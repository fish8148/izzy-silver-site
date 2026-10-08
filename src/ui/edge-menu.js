/**
 * The edge menu: push the cursor against the left or right edge of the screen and the pages slide out from that edge,
 * in a straight column down nearly the full height of the screen, centred on where the cursor touched (clamped so nothing clips), over a soft dark shade. The page
 * you're on is light blue. Move the cursor away from the menu and it folds back after a moment.
 *
 * Mouse / trackpad only: devices without a fine pointer keep the old header menu (see LEGACY_MENU_ENABLED in
 * src/pages/router.js).
 *
 * Three elements per link, one transform each, so nothing composes by surprise: the item slides in, the link scales on
 * hover, and the span inside floats and tilts.
 */

const ITEMS = [
  { id: null, text: 'homepage' },
  { id: 'about', text: 'about me' },
  { id: 'photos', text: 'photos' },
  { id: 'my-things', text: 'my things' },
  { id: 'say-hi', text: 'say hi' },
];

const TRIGGER = 24; // px from the edge that opens it
const CLOSE_DELAY = 300; // ms after the cursor leaves before it folds away
const SLACK = 48; // px around the links that still counts as "in the menu"
const OPEN = { duration: 400, stagger: 50, travel: 64 };
const CLOSE = { duration: 220 };
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createEdgeMenu({ router }) {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;

  const root = document.createElement('nav');
  root.className = 'edge-menu';
  root.setAttribute('aria-label', 'Pages');
  root.inert = true;

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

  root.append(shade, list);
  document.body.append(root);

  let open = false;
  let side = 'right';
  let closeTimer = 0;

  function place(y) {
    root.dataset.side = side;
    const h = list.offsetHeight;
    const pad = Math.max(16, window.innerHeight * 0.04);
    const top = Math.min(Math.max(y - h / 2, pad), window.innerHeight - h - pad);
    list.style.top = `${Math.round(top)}px`;
  }

  function markCurrent() {
    const cur = router.currentId;
    for (const { link, id } of items) {
      const here = id === cur;
      link.classList.toggle('is-current', here);
      if (here) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function show(edge, y) {
    clearTimeout(closeTimer);
    if (open) return;
    open = true;
    side = edge;
    markCurrent();
    place(y);
    root.inert = false;
    root.classList.add('is-open');
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
    if (!open) {
      if (x <= TRIGGER) show('left', y);
      else if (x >= window.innerWidth - TRIGGER) show('right', y);
      return;
    }
    if (within(x, y)) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    } else scheduleHide();
  });

  list.addEventListener('click', (event) => {
    const link = event.target.closest('.edge-menu__link');
    if (!link) return;
    event.preventDefault();
    const id = link.dataset.page || null;
    hide();
    if (id !== router.currentId) router.go(id);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.stopImmediatePropagation(); // Esc folds the menu, not the page underneath it
      hide();
    }
  }, true);

  window.addEventListener('resize', () => open && hide());

  return { show, hide };
}
