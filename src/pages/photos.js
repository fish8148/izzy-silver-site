import { photos } from '../data/photos.js';
import { photoElement } from '../ui/image.js';

/**
 * Photos (the "Photos Board" design, variant 7a "grow"). Everything is sized from the design's 1280×800 board: one design
 * pixel is `--u` (pages.css), the same unit this file reads back as `u`.
 *
 * - Two rows drift to the right and loop, each on its own (the bottom one a little slower). They keep drifting under the
 *   pointer; only the carousel eases them to a stop (and back up once it closes).
 * - Hovering a photo fades in a dark gradient with its description.
 * - Clicking a photo lifts it out of its row and grows it into the centre while the rows fade away; its neighbours and
 *   the description fade in as it arrives. A neighbour, or ← / →, moves along (it loops). Esc, or a click on the
 *   background, sends it flying back to the nearest copy of it in the rows.
 * - Phones get a plain two-column grid that scrolls instead of the rows (pages.css); the carousel works the same.
 */

const canHover = window.matchMedia('(hover: hover)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = window.matchMedia('(max-width: 720px)');

// Knobs, in design px (× u) and ms, from the board
const DRIFT = 16; // px per second, top row
const ROW_SPEED = [1, 0.82]; // the bottom row drifts a little slower
const ROW_SHIFT = [22, -120]; // where each row's loop starts, so the two don't line up
const EASE_RATE = 4; // how quickly the drift eases to a stop / back up (per second)
const GAP = 36;
const CARD_H = 290;
const SLIDE_H = 519; // the photo in the carousel
const SLIDE_CY = 318; // its centre, from the top
const SIDE = 0.8; // neighbours' scale
const SIDE_EDGE = 128; // how far in from the screen edge a neighbour reaches
const FAR = 700; // where the hidden ones wait, beyond the edges
const CARD_R = 40;
const SLIDE_R = 48;
const T = { grow: 620, reveal: 240, flyBack: 520 };

const controllers = new WeakMap(); // page element -> controller

const tall = (i) => photos[i].shape === 'tall';
const aspect = (i) => (tall(i) ? 3 / 4 : 4 / 3);

// How wide each is shown, for picking a file (src/ui/image.js): a card is about a third of the screen on the rows (half
// on a phone's grid); the carousel photo about half (nearly all of a phone).
const CARD_SIZES = '(max-width: 720px) 48vw, 32vw';
const SLIDE_SIZES = '(max-width: 720px) 90vw, 55vw';

const picture = (photo, alt, sizes) => photoElement({ src: photo.src, alt }, { sizes, draggable: false });

function buildCard(index, copy) {
  const photo = photos[index];
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `gallery__card gallery__card--${tall(index) ? 'tall' : 'wide'}`;
  card.dataset.index = String(index);
  card.dataset.copy = String(copy);
  const primary = copy === 1;
  if (!primary) {
    card.tabIndex = -1;
    card.setAttribute('aria-hidden', 'true');
  }
  const shade = document.createElement('span');
  shade.className = 'gallery__shade';
  shade.setAttribute('aria-hidden', 'true');
  const desc = document.createElement('span');
  desc.className = 'gallery__desc';
  desc.textContent = photo.caption;
  shade.append(desc);
  const rim = document.createElement('span');
  rim.className = 'gallery__rim';
  card.append(picture(photo, primary ? photo.alt : '', CARD_SIZES), shade, rim);
  return card;
}

/** The two rows: the first half of the photos on top, the rest below, each laid out several times over for the loop. */
function buildRows() {
  const split = Math.ceil(photos.length / 2);
  return [
    [0, split],
    [split, photos.length],
  ].map(([from, to], k) => {
    const row = document.createElement('div');
    row.className = 'gallery__row';
    row.dataset.row = String(k);
    const indices = Array.from({ length: to - from }, (_, j) => from + j);
    return { el: row, indices, copies: 0, width: 0 };
  });
}

function addCopy(row) {
  for (const i of row.indices) row.el.append(buildCard(i, row.copies));
  row.copies++;
}

/** Every card you can actually see, left to right (top to bottom on the phone grid). */
function onScreenCards(page) {
  const gallery = page.querySelector('.gallery');
  const view = gallery.getBoundingClientRect();
  const seen = [];
  for (const card of gallery.querySelectorAll('.gallery__card')) {
    const r = card.getBoundingClientRect();
    if (r.width && r.right > view.left && r.left < view.right && r.bottom > view.top && r.top < view.bottom) seen.push({ card, r });
  }
  const order = narrow.matches ? (a, b) => a.r.top - b.r.top || a.r.left - b.r.left : (a, b) => a.r.left - b.r.left || a.r.top - b.r.top;
  return seen.sort(order).map(({ card }) => card);
}

function createPhotos(page) {
  const gallery = document.createElement('div');
  gallery.className = 'gallery';
  gallery.setAttribute('role', 'region');
  gallery.setAttribute('aria-label', 'Photos');
  const rows = buildRows();
  for (const row of rows) {
    addCopy(row);
    addCopy(row);
    addCopy(row);
    gallery.append(row.el);
  }

  const layer = document.createElement('div');
  layer.className = 'carousel';
  layer.hidden = true;
  layer.setAttribute('role', 'region');
  layer.setAttribute('aria-roledescription', 'carousel');
  layer.setAttribute('aria-label', 'Photo viewer');
  const slides = photos.map((photo, i) => {
    const slide = document.createElement('button');
    slide.type = 'button';
    slide.className = `carousel__photo carousel__photo--${tall(i) ? 'tall' : 'wide'}`;
    slide.dataset.index = String(i);
    const shade = document.createElement('span');
    shade.className = 'carousel__shade';
    const rim = document.createElement('span');
    rim.className = 'gallery__rim';
    slide.append(picture(photo, photo.alt, SLIDE_SIZES), shade, rim);
    layer.append(slide);
    return slide;
  });
  const desc = document.createElement('p');
  desc.className = 'carousel__desc';
  desc.setAttribute('aria-live', 'polite');
  const descText = document.createElement('span');
  desc.append(descText);
  layer.append(desc);

  const n = photos.length;
  let u = 1;
  let W = 0;
  let H = 0;
  let open = false;
  let closing = false;
  let cur = 0;
  let flight = null; // the card that lifted out of the row
  let revealTimer = 0;

  // ---- the drift --------------------------------------------------------------------
  let off = 0;
  let spd = 1;
  let armed = !canHover; // the pointer has moved since the page opened (it's usually resting where "photos" was clicked)
  let frame = 0;
  let last = 0;

  function measure() {
    W = page.clientWidth;
    H = page.clientHeight;
    if (!W || !H) return;
    // one design px: the board is 1280×800; a phone instead sizes the carousel photo to its width
    u = narrow.matches ? Math.min((0.88 * W) / (SLIDE_H * (4 / 3)), (0.5 * H) / SLIDE_H) : Math.min(W / 1280, H / 800);
    page.style.setProperty('--u', `${u}px`);
    if (narrow.matches) return;
    for (const row of rows) {
      const cards = [...row.el.children].slice(0, row.indices.length);
      row.width = cards.reduce((sum, card) => sum + card.offsetWidth, 0) + cards.length * GAP * u;
      // enough copies that the loop never shows its end: one behind, and the rest to cover the screen
      while (row.width && row.copies * row.width < W + 2 * row.width) addCopy(row);
    }
  }

  function placeRows() {
    rows.forEach((row, k) => {
      if (!row.width || narrow.matches) {
        row.el.style.transform = '';
        return;
      }
      const x = ((off * ROW_SPEED[k] * u) % row.width) - row.width + ROW_SHIFT[k] * u;
      row.el.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    });
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (narrow.matches || reducedMotion) return;
    const want = open ? 0 : 1;
    spd += (want - spd) * Math.min(1, dt * EASE_RATE);
    off += dt * spd * DRIFT;
    placeRows();
  }

  function start() {
    measure();
    off = 0;
    spd = 1;
    last = 0;
    placeRows();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // ---- the carousel -------------------------------------------------------------------
  const size = (i) => ({ w: SLIDE_H * u * aspect(i), h: SLIDE_H * u });
  const centreY = () => (narrow.matches ? H * 0.4 : SLIDE_CY * u);

  /** Where photo i sits when it is d places from the centre. */
  function slideTransform(i, d) {
    const { w, h } = size(i);
    let cx = W / 2;
    let s = 1;
    if (d === -1) [cx, s] = [SIDE_EDGE * u - (w * SIDE) / 2, SIDE];
    else if (d === 1) [cx, s] = [W - SIDE_EDGE * u + (w * SIDE) / 2, SIDE];
    else if (d <= -2) [cx, s] = [-FAR * u, SIDE];
    else if (d >= 2) [cx, s] = [W + FAR * u, SIDE];
    return `translate(${cx - w / 2}px, ${centreY() - h / 2}px) scale(${s})`;
  }

  /** The transform that puts photo i's slide exactly over a card. */
  function cardTransform(i, card) {
    const box = layer.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    const { w, h } = size(i);
    const scale = r.height / h;
    return {
      transform: `translate(${r.left - box.left + r.width / 2 - w / 2}px, ${r.top - box.top + r.height / 2 - h / 2}px) scale(${scale})`,
      radius: CARD_R * u / scale,
    };
  }

  const place = (d) => (d > n / 2 ? d - n : d < -n / 2 ? d + n : d);

  /** Lay every slide out around `cur`. `revealed`: whether the neighbours and description show yet. */
  function layout(revealed) {
    slides.forEach((slide, i) => {
      const d = place(i - cur);
      const side = Math.abs(d) === 1;
      slide.style.width = `${size(i).w}px`;
      slide.style.height = `${size(i).h}px`;
      slide.style.transform = slideTransform(i, d);
      slide.style.opacity = d === 0 ? '1' : side && revealed ? '1' : '0';
      slide.style.zIndex = d === 0 ? '2' : '1';
      slide.classList.toggle('is-centre', d === 0);
      slide.classList.toggle('is-side', side);
      slide.tabIndex = side && revealed ? 0 : -1;
      slide.toggleAttribute('aria-hidden', !(d === 0 || side));
      if (side) slide.setAttribute('aria-label', `${d < 0 ? 'Previous' : 'Next'} photo: ${photos[i].alt}`);
      else slide.removeAttribute('aria-label');
    });
    const inset = narrow.matches ? W * 0.06 : 240 * u;
    Object.assign(desc.style, {
      top: `${centreY() + (SLIDE_H / 2) * u + 37 * u}px`,
      left: `${inset}px`,
      right: `${inset}px`,
      opacity: revealed ? '1' : '0',
    });
  }

  function openAt(card) {
    if (open || closing) return;
    const i = Number(card.dataset.index);
    measure();
    open = true;
    cur = i;
    flight = card;
    descText.textContent = photos[i].caption;
    layer.hidden = false;
    page.classList.add('is-carousel'); // the rows fade away (pages.css)
    gallery.inert = true;
    layer.classList.add('is-still'); // placed without transitions this once
    layout(false);
    void layer.offsetWidth;
    layer.classList.remove('is-still');
    card.style.opacity = '0'; // it has lifted out of its row

    const slide = slides[i];
    const from = cardTransform(i, card);
    if (!reducedMotion) {
      slide.animate(
        [
          { transform: from.transform, borderRadius: `${from.radius}px` },
          { transform: slide.style.transform, borderRadius: `${SLIDE_R * u}px` },
        ],
        { duration: T.grow, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => open && !closing && layout(true), reducedMotion ? 0 : T.reveal);
    slides[i].focus({ preventScroll: true });
  }

  function go(dir) {
    if (!open || closing) return;
    cur = (cur + dir + n) % n;
    descText.textContent = photos[cur].caption;
    layout(true);
    descText.animate([{ opacity: 0, transform: `translateX(${dir * 14 * u}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 380,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
    if (layer.contains(document.activeElement)) slides[cur].focus({ preventScroll: true });
  }

  /** The copy of photo i in the rows nearest the middle of the screen (the design's pick), or null if none shows. */
  function homeCard(i) {
    const box = page.getBoundingClientRect();
    let best = null;
    let bestD = Infinity;
    for (const card of onScreenCards(page)) {
      if (Number(card.dataset.index) !== i) continue;
      const r = card.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - box.left - W / 2) + Math.abs(r.top + r.height / 2 - box.top - H / 2) * 0.5;
      if (d < bestD) [best, bestD] = [card, d];
    }
    return best;
  }

  function close() {
    if (!open || closing) return;
    closing = true;
    clearTimeout(revealTimer);
    const hadFocus = layer.contains(document.activeElement);
    const i = cur;
    const slide = slides[i];
    const target = homeCard(i);
    if (flight && flight !== target) flight.style.opacity = '';
    flight = target;
    layout(false); // neighbours and description fade
    page.classList.remove('is-carousel'); // the rows fade back in
    gallery.inert = false;

    const done = () => {
      closing = false;
      open = false;
      layer.hidden = true;
      if (target) target.style.opacity = '';
      flight = null;
      if (hadFocus) (target ?? gallery.querySelector(`.gallery__card[data-index="${i}"][data-copy="1"]`))?.focus({ preventScroll: true });
    };
    if (!target || reducedMotion) {
      slide.style.opacity = '0';
      setTimeout(done, reducedMotion ? 0 : 400);
      return;
    }
    const to = cardTransform(i, target);
    const flyBack = slide.animate(
      [
        { transform: slide.style.transform, borderRadius: `${SLIDE_R * u}px` },
        { transform: to.transform, borderRadius: `${to.radius}px` },
      ],
      { duration: T.flyBack, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    flyBack.onfinish = () => {
      layer.classList.add('is-still');
      slide.style.opacity = '0';
      done();
      flyBack.cancel();
      layer.classList.remove('is-still');
    };
  }

  /** Straight back to the rows, no animation (the page is opening fresh, or leaving). */
  function reset() {
    clearTimeout(revealTimer);
    for (const slide of slides) for (const a of slide.getAnimations()) a.cancel();
    open = false;
    closing = false;
    layer.hidden = true;
    flight = null;
    gallery.inert = false;
    gallery.style.transition = 'none';
    page.classList.remove('is-carousel');
    void gallery.offsetWidth;
    gallery.style.transition = '';
    for (const card of gallery.querySelectorAll('.gallery__card')) card.style.opacity = '';
  }

  // ---- wiring -------------------------------------------------------------------------
  if (canHover) {
    page.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || armed || !(event.movementX || event.movementY)) return;
      armed = true;
      gallery.classList.add('is-armed');
    });
  }

  gallery.addEventListener('click', (event) => {
    const card = event.target.closest('.gallery__card');
    if (card) openAt(card);
  });

  layer.addEventListener('click', (event) => {
    const slide = event.target.closest('.carousel__photo');
    if (slide) {
      const d = place(Number(slide.dataset.index) - cur);
      if (Math.abs(d) === 1) go(d);
      return;
    }
    close(); // the background
  });

  window.addEventListener('keydown', (event) => {
    if (!open || closing || page.hidden) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      go(event.key === 'ArrowRight' ? 1 : -1);
    }
  });

  new ResizeObserver(() => {
    if (page.hidden) return;
    measure();
    placeRows();
    if (open && !closing) {
      layer.classList.add('is-still');
      layout(true);
      void layer.offsetWidth;
      layer.classList.remove('is-still');
    }
  }).observe(page);

  return {
    gallery,
    layer,
    start,
    stop,
    reset() {
      reset();
      armed = !canHover;
      gallery.classList.toggle('is-armed', armed);
    },
    get showing() {
      return open;
    },
    back() {
      if (!open) return false;
      close();
      return true;
    },
  };
}

export const photosPage = {
  stagger: 90,
  header: 'aside-bottom', // every page's header lives bottom-right (see pages.css)
  // leaving: whatever is on screen dissolves left to right — the carousel if it's up, else the visible photos
  exit: {
    targets: (page) => (controllers.get(page)?.showing ? [controllers.get(page).layer] : onScreenCards(page)),
    stagger: 90,
    duration: 340,
    slide: 0,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  render(page) {
    page.classList.add('page--photos');
    const controller = createPhotos(page);
    controllers.set(page, controller);
    page.append(controller.gallery, controller.layer);
  },

  // the photos you can see fade in, left to right (the rows are placed in onShow, just before this is read)
  blocks: (page) => onScreenCards(page),

  onShow(page) {
    const controller = controllers.get(page);
    controller.reset();
    controller.start();
  },
  onHide(page) {
    controllers.get(page)?.stop(); // freeze the rows so the photos fade where they are
  },

  /** Esc closes the carousel before it closes the page. */
  back: (page) => controllers.get(page)?.back() ?? false,
};
