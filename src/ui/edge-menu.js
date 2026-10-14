/**
 * The edge menu: push the cursor against the left or right edge of the screen and the pages slide out from that edge,
 * in a straight column down nearly the full height of the screen, centred on where the cursor touched (clamped so
 * nothing clips), over a soft dark shade. The page you're on is light blue. Move the cursor away from the menu and it
 * folds back after a moment.
 *
 * A thin glowing "seam" rests on each edge to say the menu is there. It breathes, and stretches toward the cursor as the
 * cursor nears its edge. (The scroll pull, src/ui/scroll-pull.js, dims them while its overlay is up: `dimSeams`.)
 *
 * On a touch screen, tap right at the left or right edge (where the seams are) to open it, and tap anywhere else to
 * close it.
 *
 * Three elements per link, one transform each, so nothing composes by surprise: the item slides in (and rolls, in a
 * pull), the link scales on hover, and the span inside floats and tilts.
 */

const ITEMS = [
  { id: null, text: 'homepage' },
  { id: 'about', text: 'about me' },
  { id: 'photos', text: 'photos' },
  { id: 'say-hi', text: 'say hi' },
];

const TRIGGER = 24; // px from the edge that opens it
const TOUCH_TRIGGER = 32; // ...for a fingertip
const CLOSE_DELAY = 300; // ms after the cursor leaves before it folds away
const SLACK = 48; // px around the links that still counts as "in the menu"
const OPEN = { duration: 400, stagger: 50, travel: 64 };
const CLOSE = { duration: 220 };
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

// The seam at rest, and how it answers the cursor (the Edge Board, 8a)
export const SEAM = { height: 200, width: 2, inset: 6, opacity: 0.28, reach: 220, grow: 200, widthGrow: 2, keepOff: 120 };

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};

export function createEdgeMenu({ router }) {
  const root = document.createElement('nav');
  root.className = 'edge-menu';
  root.setAttribute('aria-label', 'Pages');
  root.dataset.side = 'right';
  root.inert = true;

  // the seams: an outer layer that hides them while the menu is open, one that breathes, and the two lines
  const indicator = document.createElement('div');
  indicator.className = 'edge-menu__indicator';
  const breathe = document.createElement('div');
  breathe.className = 'edge-menu__breathe';
  const seams = { right: document.createElement('div'), left: document.createElement('div') };
  seams.right.className = 'edge-menu__seam edge-menu__seam--right';
  seams.left.className = 'edge-menu__seam edge-menu__seam--left';
  breathe.append(seams.left, seams.right);
  indicator.append(breathe);

  const shade = document.createElement('div');
  shade.className = 'edge-menu__shade';

  const list = document.createElement('ul');
  list.className = 'edge-menu__list';

  const items = ITEMS.map(({ id, text }, k) => {
    const li = document.createElement('li');
    li.className = 'edge-menu__item';
    const link = document.createElement('a');
    link.className = 'edge-menu__link';
    link.href = id ? `#${id}` : '#';
    link.dataset.page = id ?? '';
    const float = document.createElement('span');
    float.className = 'edge-menu__float';
    float.textContent = text;
    // each drifts on its own clock, so they never move in step
    float.style.setProperty('--float-dur', `${(5.6 + ((k * 1.37) % 2.6)).toFixed(2)}s`);
    float.style.setProperty('--float-delay', `${(-k * 1.9).toFixed(2)}s`);
    float.style.setProperty('--tilt', `${(k % 2 ? -1 : 1) * (2 + (k % 3) * 0.4)}deg`);
    link.append(float);
    li.append(link);
    list.append(li);
    return { li, link, id };
  });

  root.append(indicator, shade, list);
  document.body.append(root);

  let open = false;
  let side = 'right';
  let closeTimer = 0;
  let locked = false; // mid page change: no hover-open, no clicks
  let onBeforeShow = () => true;
  let cursor = { x: -1, y: 0 };

  // ---- the seams ------------------------------------------------------------------------------------------------
  function drawSeam(el, { h, center, w, op }) {
    el.style.height = `${h}px`;
    el.style.top = `${center - h / 2}px`;
    el.style.width = `${w}px`;
    el.style.opacity = String(op);
  }

  /** Each seam at rest, or reaching for the cursor as it nears that edge. */
  function drawSeams() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { x, y } = cursor;
    const near = (dist) => (x < 0 || open ? 0 : smooth(1 - dist / SEAM.reach));
    const cy = Math.max(SEAM.keepOff, Math.min(H - SEAM.keepOff, y));
    const at = (p) => ({
      h: SEAM.height + p * SEAM.grow,
      center: H / 2 + (cy - H / 2) * p,
      w: SEAM.width + p * SEAM.widthGrow,
      op: SEAM.opacity + p * (1 - SEAM.opacity),
    });
    drawSeam(seams.left, at(near(x)));
    drawSeam(seams.right, at(near(W - x)));
  }

  // ---- open / close by hovering the edge -------------------------------------------------------------------------
  function place(y) {
    root.dataset.side = side;
    const h = list.offsetHeight;
    const pad = Math.max(16, window.innerHeight * 0.04);
    const top = Math.min(Math.max(y - h / 2, pad), window.innerHeight - h - pad);
    list.style.top = `${Math.round(top)}px`;
  }

  function markCurrent(cur = router.currentId) {
    for (const { link, id } of items) {
      const here = id === cur;
      link.classList.toggle('is-current', here);
      if (here) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function show(edge, y) {
    clearTimeout(closeTimer);
    if (open || locked || !onBeforeShow()) return;
    open = true;
    side = edge;
    markCurrent();
    place(y);
    root.inert = false;
    root.classList.add('is-open');
    drawSeams();
    const dir = side === 'right' ? 1 : -1;
    items.forEach(({ li }, k) => {
      li.getAnimations().forEach((a) => a.cancel());
      li.animate(
        [
          { opacity: 0, transform: `translateX(${dir * (reducedMotion ? 0 : OPEN.travel)}px)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: OPEN.duration, delay: k * OPEN.stagger, easing: EASE_OUT, fill: 'both' },
      );
    });
  }

  function hide() {
    clearTimeout(closeTimer);
    closeTimer = 0;
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    root.inert = true;
    if (root.contains(document.activeElement)) document.activeElement.blur();
    for (const { li } of items) {
      const from = getComputedStyle(li).opacity;
      li.getAnimations().forEach((a) => a.cancel());
      li.animate([{ opacity: from }, { opacity: 0 }], { duration: CLOSE.duration, easing: 'ease', fill: 'both' });
    }
    drawSeams();
  }

  function scheduleHide() {
    if (!open || closeTimer) return;
    closeTimer = setTimeout(() => {
      closeTimer = 0;
      hide();
    }, CLOSE_DELAY);
  }

  /** The menu area: from the screen edge out past the links, and a little above / below them. */
  function within(x, y) {
    const r = list.getBoundingClientRect();
    const inY = y >= r.top - SLACK && y <= r.bottom + SLACK;
    const inX = side === 'right' ? x >= r.left - SLACK : x <= r.right + SLACK;
    return inX && inY;
  }

  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const { clientX: x, clientY: y } = event;
    cursor = { x, y };
    if (!open) {
      if (x <= TRIGGER) show('left', y);
      else if (x >= window.innerWidth - TRIGGER) show('right', y);
    } else if (within(x, y)) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    } else scheduleHide();
    drawSeams();
  });
  document.documentElement.addEventListener('mouseleave', () => {
    cursor = { x: -1, y: cursor.y };
    drawSeams();
  });

  // touch: no hover, so a tap at the edge opens it and a tap anywhere but a link closes it
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    const { clientX: x, clientY: y } = event;
    if (open) {
      if (!event.target.closest?.('.edge-menu__link')) hide();
    } else if (x <= TOUCH_TRIGGER) show('left', y);
    else if (x >= window.innerWidth - TOUCH_TRIGGER) show('right', y);
  });

  list.addEventListener('click', (event) => {
    const link = event.target.closest('.edge-menu__link');
    if (!link) return;
    event.preventDefault();
    if (locked) return;
    const id = link.dataset.page || null;
    hide();
    if (id !== router.currentId) router.go(id);
  });

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && open) {
        event.stopImmediatePropagation(); // Esc folds the menu, not the page underneath it
        hide();
      }
    },
    true,
  );

  window.addEventListener('resize', () => {
    if (open) hide();
    drawSeams();
  });
  drawSeams();

  return {
    show,
    hide,
    markCurrent,
    get isOpen() {
      return open;
    },
    /** Fade the seams by `k` (0..1: the scroll pull's overlay covers the page, and the seams go with it). */
    dimSeams(k) {
      indicator.style.opacity = k > 0 ? String(1 - k) : '';
    },
    set locked(value) {
      locked = value;
    },
    /** Called before the edge opens the menu; returning false keeps it shut. */
    set onBeforeShow(fn) {
      onBeforeShow = fn;
    },
  };
}
