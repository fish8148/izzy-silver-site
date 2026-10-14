import { trips } from '../data/photo-trips.js';
import { photoElement } from '../ui/image.js';

/**
 * Photos (the "scroll-synced index" design, 13a). The photos are grouped by trip (src/data/photo-trips.js) into one long
 * scroll of chapters on the right. The trips' names stay fixed on the left as an index: the trip you're scrolled into
 * turns blue, steps in a little and opens its description. Clicking a name scrolls to that trip.
 *
 * - The active trip is the last chapter whose top has passed a line 140px down the scroller (or the last one, once
 *   you're at the bottom).
 * - Hovering a photo fades in a dark gradient with its caption.
 * - Clicking a photo lifts it out of the grid and grows it into the centre while the page fades away; its neighbours
 *   (within that trip, looping) and the caption fade in as it arrives. A neighbour, ← / →, a swipe or a sideways scroll
 *   moves along. Esc, or a click on the background, sends it flying back to its tile.
 * - Under 900px wide the index becomes a row of names along the top, with the active trip's description under it, and
 *   the grid drops to two columns (pages.css).
 */

const canHover = window.matchMedia('(hover: hover)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// the viewer sizes its photo to the screen's width on phones and upright tablets
const upright = window.matchMedia('(max-width: 720px), (max-width: 1100px) and (orientation: portrait)');

const ACTIVATE = 140; // px down the scroller: a chapter whose top has passed this line is the one you're in
const JUMP_GAP = 20; // px left above a chapter you jump to from the index
// The tiles' repeating pattern within a chapter (columns × rows), from the design. A tall slot holding a wide photo
// becomes a wide one, and the other way round, so nothing gets cropped to a sliver.
const SPANS = [
  [2, 2],
  [1, 1],
  [1, 1],
  [1, 2],
  [2, 1],
  [1, 1],
  [1, 1],
  [1, 1],
  [1, 1],
];

// The viewer, in design px (× u: one px of a 1280×800 board) and ms
const SLIDE_H = 519; // the photo in the viewer
const SLIDE_CY = 318; // its centre, from the top
const SIDE = 0.8; // neighbours' scale
const SIDE_EDGE = 128; // how far in from the screen edge a neighbour reaches
const FAR = 700; // where the hidden ones wait, beyond the edges
const TILE_R = 28; // px: the tiles' corners
const SLIDE_R = 48;
const T = { grow: 620, reveal: 240, flyBack: 520 };
const SWIPE = 48; // px a swipe must travel to move along

/**
 * A trip's description as paragraphs (one string, or a list of them). `[text](https://…)` in one becomes a link: blue,
 * with an arrow, opening in a new tab.
 */
function descParagraphs(description) {
  const list = Array.isArray(description) ? description : description ? [description] : [];
  return list.map((paragraph) => {
    const p = document.createElement('p');
    const parts = paragraph.split(/\[([^\]]+)\]\(([^)\s]+)\)/); // text, label, href, text, label, href, …, text
    parts.forEach((part, k) => {
      if (k % 3 === 0) {
        if (part) p.append(part);
      } else if (k % 3 === 1) {
        const link = document.createElement('a');
        link.className = 'trips__desc-link';
        link.href = parts[k + 1];
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = `${part} ↗`;
        link.setAttribute('aria-label', `${part} (opens in new tab)`);
        p.append(link);
      }
    });
    return p;
  });
}

// Every photo, in page order, with the trip it belongs to
const photos = trips.flatMap((trip, t) =>
  trip.photos.map((photo) => ({ ...photo, src: `photos/${photo.src}`, alt: photo.alt ?? `a photo from ${trip.name}`, trip: t })),
);
const tripPhotos = trips.map((_, t) => photos.map((p, i) => (p.trip === t ? i : -1)).filter((i) => i >= 0));

const tall = (i) => photos[i].shape === 'tall';
const aspect = (i) => (tall(i) ? 3 / 4 : 4 / 3);

// How wide each is shown, for picking a file (src/ui/image.js)
const TILE_SIZES = '(max-width: 900px) 50vw, 40vw';
const BIG_TILE_SIZES = '(max-width: 900px) 92vw, 46vw';
const SLIDE_SIZES = '(max-width: 720px) 90vw, ((max-width: 1100px) and (orientation: portrait)) 90vw, 55vw';

const controllers = new WeakMap(); // page element -> controller

function tileSpan(i, k) {
  let [cols, rows] = SPANS[k % SPANS.length];
  if (cols !== rows && (rows > cols) !== tall(i)) [cols, rows] = [rows, cols];
  return { cols, rows };
}

function buildTile(i, k, lazy) {
  const photo = photos[i];
  const { cols, rows } = tileSpan(i, k);
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'gallery__card trips__tile';
  tile.dataset.index = String(i);
  tile.style.gridColumn = `span ${cols}`;
  tile.style.gridRow = `span ${rows}`;
  tile.dataset.cols = String(cols);
  if (photo.caption) tile.setAttribute('aria-label', `${photo.alt}: ${photo.caption}`);
  const img = photoElement({ src: photo.src, alt: photo.alt }, { sizes: cols > 1 ? BIG_TILE_SIZES : TILE_SIZES, draggable: false });
  for (const el of [img, ...img.querySelectorAll?.('img') ?? []]) if (el.tagName === 'IMG') el.loading = lazy ? 'lazy' : 'eager';
  const shade = document.createElement('span');
  shade.className = 'gallery__shade';
  shade.setAttribute('aria-hidden', 'true');
  if (photo.caption) {
    const desc = document.createElement('span');
    desc.className = 'gallery__desc';
    desc.textContent = photo.caption;
    shade.append(desc);
  }
  const rim = document.createElement('span');
  rim.className = 'gallery__rim';
  tile.append(img, shade, rim);
  return tile;
}

function createPhotos(page) {
  const root = document.createElement('div');
  root.className = 'trips';

  // ---- the index ------------------------------------------------------------------------------------------------
  const index = document.createElement('nav');
  index.className = 'trips__index';
  index.setAttribute('aria-label', 'Trips');
  const indexList = document.createElement('div');
  indexList.className = 'trips__list';
  const entries = trips.map((trip, t) => {
    const item = document.createElement('div');
    item.className = 'trips__item';
    const link = document.createElement('a');
    link.className = 'trips__link';
    link.href = `#${trip.slug}`;
    link.dataset.trip = String(t);
    const name = document.createElement('span');
    name.className = 'trips__name';
    name.textContent = trip.name;
    const count = document.createElement('span');
    count.className = 'trips__count';
    count.textContent = String(trip.photos.length);
    count.setAttribute('aria-label', `${trip.photos.length} photos`);
    link.append(name, count);
    item.append(link);
    const paragraphs = descParagraphs(trip.description);
    if (paragraphs.length) {
      const desc = document.createElement('div');
      desc.className = 'trips__desc';
      desc.append(...paragraphs);
      item.append(desc);
    }
    indexList.append(item);
    return { item, link };
  });
  // narrow screens: the active trip's description, under the row of names
  const now = document.createElement('div');
  now.className = 'trips__now';
  now.setAttribute('aria-live', 'polite');
  index.append(indexList, now);

  // ---- the chapters ---------------------------------------------------------------------------------------------
  const scroller = document.createElement('div');
  scroller.className = 'trips__chapters';
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', 'Photos');
  scroller.tabIndex = -1;
  const chapters = trips.map((trip, t) => {
    const chapter = document.createElement('section');
    chapter.className = 'trips__chapter';
    chapter.id = `trip-${trip.slug}`;
    chapter.setAttribute('aria-label', trip.name);
    const label = document.createElement('div');
    label.className = 'trips__label';
    const num = document.createElement('span');
    num.textContent = String(t + 1).padStart(2, '0');
    const nm = document.createElement('span');
    nm.textContent = trip.name;
    label.append(num, nm);
    const grid = document.createElement('div');
    grid.className = 'trips__grid';
    tripPhotos[t].forEach((i, k) => grid.append(buildTile(i, k, t > 0)));
    chapter.append(label, grid);
    scroller.append(chapter);
    return chapter;
  });
  const tail = document.createElement('div');
  tail.className = 'trips__tail'; // room for the last trip to scroll up to the line and become the one you're in
  scroller.append(tail);

  root.append(index, scroller);

  // ---- which trip you're in -------------------------------------------------------------------------------------
  let active = -1;

  function setActive(t) {
    if (t === active) return;
    active = t;
    entries.forEach(({ item, link }, k) => {
      item.classList.toggle('is-active', k === t);
      if (k === t) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    now.replaceChildren(...descParagraphs(trips[t]?.description));
    // narrow screens: keep the active name in view along the row
    const link = entries[t]?.link;
    if (link && indexList.scrollWidth > indexList.clientWidth) {
      const left = link.offsetLeft - (indexList.clientWidth - link.offsetWidth) / 2;
      indexList.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }

  function sync() {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max > 0 && scroller.scrollTop >= max - tail.offsetHeight * 0.5) return setActive(chapters.length - 1);
    const line = scroller.scrollTop + ACTIVATE;
    let t = 0;
    chapters.forEach((chapter, k) => {
      if (chapter.offsetTop <= line) t = k;
    });
    setActive(t);
  }

  let syncQueued = false;
  scroller.addEventListener(
    'scroll',
    () => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => {
        syncQueued = false;
        sync();
      });
    },
    { passive: true },
  );

  indexList.addEventListener('click', (event) => {
    const link = event.target.closest('.trips__link');
    if (!link) return;
    event.preventDefault();
    const chapter = chapters[Number(link.dataset.trip)];
    scroller.scrollTo({ top: Math.max(0, chapter.offsetTop - JUMP_GAP), behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  // ---- the viewer ---------------------------------------------------------------------------------------------------
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
    const img = photoElement({ src: photo.src, alt: photo.alt }, { sizes: SLIDE_SIZES, draggable: false });
    for (const el of [img, ...img.querySelectorAll?.('img') ?? []]) if (el.tagName === 'IMG') el.loading = 'lazy';
    slide.append(img, shade, rim);
    layer.append(slide);
    return slide;
  });
  const desc = document.createElement('p');
  desc.className = 'carousel__desc';
  desc.setAttribute('aria-live', 'polite');
  const descText = document.createElement('span');
  desc.append(descText);
  layer.append(desc);

  let u = 1;
  let W = 0;
  let H = 0;
  let open = false;
  let closing = false;
  let group = []; // the photos of the trip being viewed (indices into `photos`), in order
  let cur = 0; // the one in the middle (an index into `photos`)
  let flight = null; // the tile that lifted out of the grid
  let revealTimer = 0;
  let armed = !canHover; // the pointer has moved since the page opened (it's usually resting where "photos" was clicked)

  function measure() {
    W = page.clientWidth;
    H = page.clientHeight;
    if (!W || !H) return;
    // one design px: the board is 1280×800; a phone instead sizes the viewer's photo to its width
    u = upright.matches ? Math.min((0.88 * W) / (SLIDE_H * (4 / 3)), (0.5 * H) / SLIDE_H) : Math.min(W / 1280, H / 800);
    page.style.setProperty('--u', `${u}px`);
  }

  const size = (i) => ({ w: SLIDE_H * u * aspect(i), h: SLIDE_H * u });
  const centreY = () => (upright.matches ? H * 0.4 : SLIDE_CY * u);

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

  /** The transform that puts photo i's slide exactly over a tile. */
  function tileTransform(i, tile) {
    const box = layer.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    const { w, h } = size(i);
    // the tile crops the photo: grow from the tile's size, matching whichever side the photo fills
    const scale = Math.max(r.width / w, r.height / h);
    return {
      transform: `translate(${r.left - box.left + r.width / 2 - w / 2}px, ${r.top - box.top + r.height / 2 - h / 2}px) scale(${scale})`,
      radius: TILE_R / scale,
    };
  }

  /** How many places along the trip photo i is from the centre (looping, so a short trip still has both neighbours). */
  function place(i) {
    const n = group.length;
    const at = group.indexOf(i);
    if (at < 0) return Infinity;
    let d = at - group.indexOf(cur);
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    if (n === 2 && d === -1) d = 1; // a pair: the other one waits on the right
    return d;
  }

  /** Lay every slide out around `cur`. `revealed`: whether the neighbours and caption show yet. */
  function layout(revealed) {
    slides.forEach((slide, i) => {
      const d = place(i);
      const inTrip = d !== Infinity;
      const side = Math.abs(d) === 1;
      slide.hidden = !inTrip;
      if (!inTrip) return;
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
    const inset = upright.matches ? W * 0.06 : 240 * u;
    Object.assign(desc.style, {
      top: `${centreY() + (SLIDE_H / 2) * u + 37 * u}px`,
      left: `${inset}px`,
      right: `${inset}px`,
      opacity: revealed ? '1' : '0',
    });
  }

  function openAt(tile) {
    if (open || closing) return;
    const i = Number(tile.dataset.index);
    measure();
    open = true;
    group = tripPhotos[photos[i].trip];
    cur = i;
    flight = tile;
    descText.textContent = photos[i].caption;
    layer.hidden = false;
    page.classList.add('is-carousel'); // the page fades away (pages.css)
    root.inert = true;
    layer.classList.add('is-still'); // placed without transitions this once
    layout(false);
    void layer.offsetWidth;
    layer.classList.remove('is-still');
    tile.style.opacity = '0'; // it has lifted out of the grid

    const slide = slides[i];
    const from = tileTransform(i, tile);
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
    if (!open || closing || group.length < 2) return;
    cur = group[(group.indexOf(cur) + dir + group.length) % group.length];
    descText.textContent = photos[cur].caption;
    layout(true);
    descText.animate([{ opacity: 0, transform: `translateX(${dir * 14 * u}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 380,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
    if (layer.contains(document.activeElement)) slides[cur].focus({ preventScroll: true });
  }

  /** Photo i's tile, if any of it is on screen. */
  function homeTile(i) {
    const tile = scroller.querySelector(`.trips__tile[data-index="${i}"]`);
    if (!tile) return null;
    const view = scroller.getBoundingClientRect();
    const r = tile.getBoundingClientRect();
    return r.bottom > view.top && r.top < view.bottom ? tile : null;
  }

  function close() {
    if (!open || closing) return;
    closing = true;
    clearTimeout(revealTimer);
    const hadFocus = layer.contains(document.activeElement);
    const i = cur;
    const slide = slides[i];
    const target = homeTile(i);
    if (flight && flight !== target) flight.style.opacity = '';
    flight = target;
    layout(false); // neighbours and caption fade
    page.classList.remove('is-carousel'); // the page fades back in
    root.inert = false;

    const done = () => {
      closing = false;
      open = false;
      layer.hidden = true;
      if (target) target.style.opacity = '';
      flight = null;
      if (hadFocus) (target ?? scroller.querySelector(`.trips__tile[data-index="${i}"]`))?.focus({ preventScroll: true });
    };
    if (!target || reducedMotion) {
      slide.style.opacity = '0';
      setTimeout(done, reducedMotion ? 0 : 400);
      return;
    }
    const to = tileTransform(i, target);
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

  /** Straight back to the page, no animation (it's opening fresh, or leaving). */
  function reset() {
    clearTimeout(revealTimer);
    for (const slide of slides) for (const a of slide.getAnimations()) a.cancel();
    open = false;
    closing = false;
    layer.hidden = true;
    flight = null;
    root.inert = false;
    root.style.transition = 'none';
    page.classList.remove('is-carousel');
    void root.offsetWidth;
    root.style.transition = '';
    for (const tile of scroller.querySelectorAll('.trips__tile')) tile.style.opacity = '';
  }

  // ---- wiring -------------------------------------------------------------------------------------------------------
  if (canHover) {
    page.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || armed || !(event.movementX || event.movementY)) return;
      armed = true;
      root.classList.add('is-armed');
    });
  }

  scroller.addEventListener('click', (event) => {
    const tile = event.target.closest('.trips__tile');
    if (tile) openAt(tile);
  });

  layer.addEventListener('click', (event) => {
    if (swiped) return;
    const slide = event.target.closest('.carousel__photo');
    if (slide) {
      const d = place(Number(slide.dataset.index));
      if (Math.abs(d) === 1) go(d);
      return;
    }
    close(); // the background
  });

  // swipe / scroll sideways to move along
  let swipe = null;
  let swiped = false;
  let wheelAt = 0;
  layer.addEventListener('pointerdown', (event) => {
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    swiped = false;
  });
  layer.addEventListener('pointerup', (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    swiped = true;
    setTimeout(() => (swiped = false), 60);
    go(dx < 0 ? 1 : -1);
  });
  layer.addEventListener('pointercancel', () => (swipe = null));
  layer.addEventListener(
    'wheel',
    (event) => {
      if (!open || closing) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 6 || event.timeStamp - wheelAt < 420) return; // one step per gesture, not per wheel tick
      wheelAt = event.timeStamp;
      go(delta > 0 ? 1 : -1);
    },
    { passive: false },
  );

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
    sync();
    if (open && !closing) {
      layer.classList.add('is-still');
      layout(true);
      void layer.offsetWidth;
      layer.classList.remove('is-still');
    }
  }).observe(page);

  return {
    root,
    layer,
    index,
    scroller,
    start() {
      measure();
      scroller.scrollTop = 0;
      active = -1;
      sync();
    },
    reset() {
      reset();
      armed = !canHover;
      root.classList.toggle('is-armed', armed);
    },
    get showing() {
      return open;
    },
    back() {
      if (!open) return false;
      close();
      return true;
    },
    /** The tiles you can see, top to bottom. */
    onScreen() {
      const view = scroller.getBoundingClientRect();
      return [...scroller.querySelectorAll('.trips__tile')].filter((tile) => {
        const r = tile.getBoundingClientRect();
        return r.width && r.bottom > view.top && r.top < view.bottom;
      });
    },
  };
}

export const photosPage = {
  stagger: 90,
  // leaving: the viewer if it's up, else the index and the photos you can see, top to bottom
  exit: {
    targets: (page) => {
      const c = controllers.get(page);
      return c?.showing ? [c.layer] : c ? [c.index, ...c.onScreen()] : [];
    },
    stagger: 60,
    duration: 340,
    slide: 0,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  render(page) {
    page.classList.add('page--photos');
    const controller = createPhotos(page);
    controllers.set(page, controller);
    page.append(controller.root, controller.layer);
  },

  // the index, then the photos you can see, come in one after another (laid out in onShow, just before this is read)
  blocks: (page) => {
    const c = controllers.get(page);
    return c ? [c.index, ...c.onScreen()] : [];
  },

  onShow(page) {
    const controller = controllers.get(page);
    controller.reset();
    controller.start();
  },

  /** Esc closes the viewer before it closes the page. */
  back: (page) => controllers.get(page)?.back() ?? false,
};
