/**
 * Scroll between pages: the pull bar, then the "drop" row (the scroll-row-transition handoff, board 16a).
 *
 * Keep scrolling past the end of a page and a glowing bar, like the edge menu's seams, rises on that edge of the screen
 * with the next page's name beside it. The further you pull, the longer and brighter it gets, and it bows in toward the
 * middle of the screen like a band being stretched (trembling a little near the end). Let go early and it springs back.
 *
 * Pull it all the way and the page change plays:
 *   1. the page fades to black and a full-screen row of the page names drops in, one at a time, left to right, the
 *      current page's name blue;
 *   2. the blue hands over: the next page's name hops up, the current one dips;
 *   3. the names fall away in the same order, the black lifts, and the next page is there.
 * It only ever moves one page. Scrolling up past the top goes to the previous page the same way. Order:
 * homepage -> about me -> photos -> say hi; nothing happens before the first or after the last.
 *
 * With the edge menu open by hand, scrolling walks the menu instead.
 *
 * Wheel / trackpad, ↑ ↓ PgUp PgDn Space at a page's edge, and on a touch screen, dragging past the page's end (the bar
 * follows the finger, holds while it's down, and a full pull is about a third of the screen's height).
 * Every visual is drawn from a handful of numbers (pull, pullDir, going, t) on each frame: no CSS transitions.
 */

import { PAGE_ORDER } from '../pages/order.js';

/** Tune here. */
export const PULL = {
  distance: 600, // px of wheel past the edge for a full pull
  springBack: 0.86, // let go early: the pull is multiplied by this every frame until it's gone
  releaseDelay: 220, // ms after the last wheel event before it springs back
  duration: 2000, // ms of the page change once the pull is complete
  cooldown: 450, // ms after a page change when scrolling is ignored (so a trackpad's coasting doesn't start another)
  dropDist: 70, // px each name falls in and falls away
  stagger: 0.2, // per name
  hopUp: 22, // px the incoming page's name jumps
  dipDown: 8, // px the outgoing one dips
  menuStep: 90, // px of scroll per page while the edge menu is open by hand (scrolling then just walks the list)
  touchReach: 0.32, // touch: a full pull is the finger travelling this share of the screen's height
  keyStep: { ArrowDown: 80, ArrowUp: -80, PageDown: 300, PageUp: -300, ' ': 300 },
};

/** The bar. Lengths in px. */
export const BAR = {
  inset: 10, // from the screen's edge
  lengthFrom: 60, // at the first touch of a pull...
  lengthTo: 0.62, // ...to this share of the screen's width at a full one
  lengthMax: 920,
  width: [1.5, 3.5], // its thickness, rest to full
  glow: [4, 26], // its glow's blur radius
  bend: 44, // how far its middle bows in at a full pull
  tremble: 1.6, // px it shivers by, over the last stretch of a pull
  labelGap: 16, // between the bar's middle and the next page's name
};

const ORDER = [null, ...PAGE_ORDER.map(({ id }) => id)]; // null: the home screen
// The row: each name's text, and a hand-set resting tilt (deg) and offset (px) by place in the row
const LOOK = [
  { rot: -2.4, y: 2 },
  { rot: 0, y: 0 },
  { rot: -1.2, y: 1 },
  { rot: -1.6, y: -1 },
  { rot: 0.4, y: 0 },
];
const NAMES = [{ html: 'homepage' }, ...PAGE_ORDER.map(({ name, html }) => ({ html: html ?? name }))].map((n, i) => ({
  ...n,
  ...LOOK[i % LOOK.length],
}));
// Where the change's phases fall (fractions of `duration`)
const IN = { from: 0, span: 0.3 }; // the black coming up and the names dropping in
const BLACK = 0.14; // ...the black is full by here, and the page changes behind it
const HAND = { from: 0.34, span: 0.26 }; // the blue handing over
const EXIT = { from: 0.66, span: 0.34 }; // the names falling away and the black lifting

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sm = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
const lerp = (a, b, k) => a + (b - a) * k;
const mixBlue = (k) => `rgb(${Math.round(255 - 144 * k)}, ${Math.round(255 - 76 * k)}, ${Math.round(255 - 31 * k)})`; // #fff → #6fb3e0

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG = 'http://www.w3.org/2000/svg';

export function createScrollPull({ router, menu, hero }) {
  if (!menu) return null;

  // ---- the bar -----------------------------------------------------------------------------------------------------
  const bar = document.createElement('div');
  bar.className = 'pull-bar';
  bar.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG, 'svg');
  svg.classList.add('pull-bar__svg');
  const gradient = document.createElementNS(SVG, 'linearGradient');
  gradient.id = 'pull-bar-fade';
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
  const stops = [0, 0.5, 1].map((offset) => {
    const stop = document.createElementNS(SVG, 'stop');
    stop.setAttribute('offset', String(offset));
    gradient.append(stop);
    return stop;
  });
  const defs = document.createElementNS(SVG, 'defs');
  defs.append(gradient);
  const line = document.createElementNS(SVG, 'path');
  line.classList.add('pull-bar__line');
  line.setAttribute('stroke', 'url(#pull-bar-fade)');
  svg.append(defs, line);
  const label = document.createElement('span');
  label.className = 'pull-bar__label';
  bar.append(svg, label);
  document.body.append(bar);

  // ---- the overlay and the row ---------------------------------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'page-row';
  overlay.setAttribute('aria-hidden', 'true');
  const row = document.createElement('div');
  row.className = 'page-row__names';
  const names = NAMES.map(({ html }) => {
    const el = document.createElement('span');
    el.className = 'page-row__name';
    el.innerHTML = html;
    row.append(el);
    return el;
  });
  overlay.append(row);
  document.body.append(overlay);

  let pull = 0;
  let pullDir = 1;
  let going = false;
  let cooldownUntil = 0;
  let lastInput = 0;
  let touching = false; // a finger is holding a pull: it doesn't spring back until it lets go
  let raf = 0;

  // ---- where we are ------------------------------------------------------------------------------------------------
  const here = () => ORDER.indexOf(router.currentId);
  /** The page `dir` steps away from here (null is home), or undefined if there's none that way. */
  function neighbour(dir) {
    const i = here() + dir;
    return i >= 0 && i < ORDER.length ? ORDER[i] : undefined;
  }

  const SCROLLERS = '.page__scroll, .trips__chapters';
  const scrolls = (el) => el.matches(SCROLLERS) && getComputedStyle(el).overflowY === 'auto' && el.scrollHeight - el.clientHeight > 1;

  /** The page's own scroller that `el` sits in, or, with no `el` (keyboard), the open page's main one. */
  function scrollerFor(el) {
    for (let n = el; n && n !== hero && n instanceof Element; n = n.parentElement) if (scrolls(n)) return n;
    if (el && el !== document.body && el !== document.documentElement && hero.contains(el) && !el.closest('.page')) return null; // (anywhere on a page counts as over its scroller)
    const page = hero.querySelector('.page:not([hidden])');
    return page ? [...page.querySelectorAll(SCROLLERS)].find(scrolls) ?? null : null;
  }

  function edges(scroller) {
    if (!scroller) return { top: true, bottom: true };
    return {
      top: scroller.scrollTop <= 0,
      bottom: scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1,
    };
  }

  // ---- input -------------------------------------------------------------------------------------------------------
  /**
   * Feed `dy` px of scroll (positive: down / next). Returns true if the pull took it, so the page mustn't scroll.
   * `scroller` is the page's own scroller under the input, if any.
   */
  function feed(dy, scroller) {
    if (menu.isOpen && !going && !pull) return menuScroll(dy);
    if (going) return true; // (scrolling on while the page changes doesn't carry on to the page after)
    if (performance.now() < cooldownUntil) return true;
    if (router.isBusy) return false; // a page is still arriving
    const dir = Math.sign(dy);
    if (!dir) return false;
    const atEdge = dir > 0 ? edges(scroller).bottom : edges(scroller).top;
    const toward = neighbour(dir) !== undefined;
    if (toward && atEdge && (pull === 0 || dir === pullDir)) {
      pull = Math.min(1, pull + Math.abs(dy) / PULL.distance);
      pullDir = dir;
    } else if (pull > 0) {
      pull = Math.max(0, pull - Math.abs(dy) / PULL.distance); // turning back eats the pull first
    } else return false;

    lastInput = performance.now();
    if (pull >= 1) {
      commit();
      return true;
    }
    if (pull === 0) {
      cancelAnimationFrame(raf);
      raf = 0;
      reset();
    } else if (!raf) raf = requestAnimationFrame(tick);
    return true;
  }

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; // pinch-zoom, or sideways
      if (!(event.target instanceof Element)) return;
      // (with the edge menu open, scrolling anywhere walks the menu; otherwise the viewer, the interact menu and say hi's
      // message box keep theirs)
      if (!menu.isOpen && event.target.closest('.carousel:not([hidden]), .interact-menu, textarea')) return;
      const dy = event.deltaY * (event.deltaMode === 1 ? 33 : 1);
      const scroller = scrollerFor(event.target);
      if (feed(dy, scroller)) event.preventDefault();
      else if (scroller && !scroller.contains(event.target)) {
        // over the page's empty space, beside its column: scroll the column, as if the wheel were over it
        event.preventDefault();
        scroller.scrollTop += dy;
      }
    },
    { passive: false },
  );

  window.addEventListener('keydown', (event) => {
    const dy = PULL.keyStep[event.key];
    if (!dy || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : null;
    // keys that belong to something else: typing, a focused button / link (Space presses it), the viewer
    if (target?.closest('input, textarea, select, [contenteditable], button, a, .carousel:not([hidden])')) return;
    const scroller = scrollerFor(null);
    if (feed(dy, scroller)) {
      event.preventDefault();
      return;
    }
    if (scroller) {
      // not at the edge yet: scroll the page's column (focus usually sits on the page itself, which doesn't scroll)
      event.preventDefault();
      scroller.scrollBy({ top: dy, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  });

  // ---- touch: a drag past the page's end pulls, as the wheel does ---------------------------------------------------
  // (Things that take a drag themselves are left alone. The gesture has to be mostly vertical, decided once it has moved a
  // little, so swiping along the photos' row of trip names never pulls.)
  const TOUCH_SKIP = '.carousel:not([hidden]), .interact-menu, .edge-menu, textarea, input';
  let finger = null; // { x, y, scroller, axis: null | 'y' | 'x' }

  window.addEventListener(
    'touchstart',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      finger = event.touches.length === 1 && target && !target.closest(TOUCH_SKIP)
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY, scroller: scrollerFor(target), axis: null }
        : null;
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      if (!finger || event.touches.length !== 1) return;
      const { clientX: x, clientY: y } = event.touches[0];
      if (!finger.axis) {
        const dx = Math.abs(x - finger.x);
        const dy = Math.abs(y - finger.y);
        if (Math.max(dx, dy) < 8) return;
        finger.axis = dy > dx ? 'y' : 'x';
      }
      const dy = finger.y - y; // the finger going up scrolls down, toward the next page
      finger.y = y;
      if (finger.axis !== 'y' || !dy || (menu.isOpen && !pull && !going)) return;
      const scaled = (dy * PULL.distance) / (window.innerHeight * PULL.touchReach);
      if (feed(scaled, finger.scroller)) {
        touching = pull > 0;
        if (event.cancelable) event.preventDefault(); // (the page itself mustn't bounce under the pull)
      }
    },
    { passive: false },
  );

  const letGo = () => {
    finger = null;
    if (!touching) return;
    touching = false;
    lastInput = performance.now(); // springs back from here, unless it was a full pull (already changing page)
  };
  window.addEventListener('touchend', letGo, { passive: true });
  window.addEventListener('touchcancel', letGo, { passive: true });

  // ---- scrolling with the edge menu open: walk the list, one page per step ---------------------------------------
  let menuAcc = 0;
  let menuTarget = -1; // where the scrolling has got to (an index into ORDER), while the router catches up
  let pumping = false;

  function menuScroll(dy) {
    if (Math.sign(dy) !== Math.sign(menuAcc)) menuAcc = 0;
    menuAcc += dy;
    if (!pumping) menuTarget = here(); // (the router has caught up: start from where it is)
    let moved = false;
    while (Math.abs(menuAcc) >= PULL.menuStep) {
      const dir = Math.sign(menuAcc);
      menuAcc -= dir * PULL.menuStep;
      const next = Math.max(0, Math.min(ORDER.length - 1, menuTarget + dir));
      if (next !== menuTarget) {
        menuTarget = next;
        moved = true;
      }
    }
    if (moved) {
      menu.markCurrent(ORDER[menuTarget]); // the blue moves straight away; the page follows as soon as it can
      pump();
    }
    return true;
  }

  /** Bring the router to the page the menu is pointing at, a step at a time if it's mid-transition. */
  function pump() {
    if (pumping) return;
    pumping = true;
    const step = () => {
      const want = ORDER[menuTarget];
      if (menuTarget < 0 || router.currentId === want) {
        pumping = false;
        return;
      }
      if (!router.isBusy) router.go(want);
      requestAnimationFrame(step);
    };
    step();
  }

  // Hovering the edge opens the menu by hand: that cancels a pull in progress (but can't interrupt a page change)
  menu.onBeforeShow = () => {
    if (going) return false;
    if (pull > 0) {
      cancelAnimationFrame(raf);
      raf = 0;
      reset();
    }
    return true;
  };

  /** While pulling, every frame: draw the bar, and once the scrolling stops, spring back. */
  function tick(now) {
    if (going) return;
    if (!touching && now - lastInput > PULL.releaseDelay) pull *= PULL.springBack;
    if (pull < 0.005) {
      raf = 0;
      return reset();
    }
    drawPull(now);
    raf = requestAnimationFrame(tick);
  }

  /** Back to rest: the bar and overlay gone, the page as it was. */
  function reset() {
    menuTarget = -1;
    menuAcc = 0;
    touching = false;
    pull = 0;
    going = false;
    menu.locked = false;
    menu.dimSeams(0);
    bar.classList.remove('is-up');
    overlay.classList.remove('is-up');
    overlay.style.opacity = '';
    hero.style.transform = '';
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
  /**
   * The bar at pull `k` (0–1) on the edge `dir` points to, fading by `fade`. `now` drives the tremble. At a full pull it
   * has gone light blue: the next page is ready.
   */
  function drawBar(k, dir, fade = 1, now = performance.now()) {
    bar.classList.toggle('is-up', k > 0 && fade > 0);
    if (!(k > 0 && fade > 0)) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const grow = easeOut(k);
    const len = lerp(BAR.lengthFrom, Math.min(BAR.lengthMax, w * BAR.lengthTo), grow);
    const edgeY = dir > 0 ? h - BAR.inset : BAR.inset;
    const shiver = reducedMotion ? 0 : BAR.tremble * clamp01((k - 0.6) / 0.4) * Math.sin(now / 26);
    const bow = reducedMotion ? 0 : BAR.bend * k ** 1.6 + shiver;
    const midY = edgeY - dir * bow; // (the curve's middle: a quadratic's control point sits twice as far out)
    const x0 = w / 2 - len / 2;
    const x1 = w / 2 + len / 2;
    line.setAttribute('d', `M ${x0.toFixed(1)} ${edgeY} Q ${(w / 2).toFixed(1)} ${(edgeY - dir * bow * 2).toFixed(1)} ${x1.toFixed(1)} ${edgeY}`);
    gradient.setAttribute('x1', x0.toFixed(1));
    gradient.setAttribute('x2', x1.toFixed(1));
    const ready = sm((k - 0.75) / 0.25);
    const color = mixBlue(ready);
    stops[0].setAttribute('stop-color', color);
    stops[0].setAttribute('stop-opacity', '0');
    stops[1].setAttribute('stop-color', color);
    stops[1].setAttribute('stop-opacity', '1');
    stops[2].setAttribute('stop-color', color);
    stops[2].setAttribute('stop-opacity', '0');
    line.setAttribute('stroke-width', lerp(BAR.width[0], BAR.width[1], grow).toFixed(2));
    const glow = lerp(BAR.glow[0], BAR.glow[1], k);
    line.style.filter = `drop-shadow(0 0 ${glow.toFixed(1)}px ${mixBlue(ready).replace('rgb', 'rgba').replace(')', `, ${lerp(0.35, 0.9, k).toFixed(2)})`)})`;
    bar.style.opacity = String(lerp(0.35, 1, sm(k / 0.4)) * fade);

    // the next page's name, by the bar's middle
    const next = ORDER.indexOf(neighbour(dir) ?? '');
    label.innerHTML = next >= 0 ? `${dir > 0 ? '↓' : '↑'} ${NAMES[next].html}` : '';
    label.style.color = color;
    label.style.opacity = String(sm((k - 0.15) / 0.35));
    const labelY = midY - dir * BAR.labelGap;
    label.style.transform = `translate(-50%, ${dir > 0 ? '-100%' : '0'}) translateY(${labelY.toFixed(1)}px)`;
  }

  function drawOverlay(k) {
    overlay.classList.toggle('is-up', k > 0);
    overlay.style.opacity = String(k);
    menu.dimSeams(k);
  }

  function drawName(i, y, opacity, color) {
    const el = names[i];
    el.style.transform = `translateY(${y.toFixed(2)}px) rotate(${NAMES[i].rot}deg)`;
    el.style.opacity = String(opacity);
    el.style.color = color;
  }

  /** While pulling: the bar (the edge menu's seams step back for it). */
  function drawPull(now) {
    drawBar(pull, pullDir, 1, now);
    menu.dimSeams(sm(pull) * 0.6);
  }

  // ---- the page change ---------------------------------------------------------------------------------------------
  function commit() {
    const dir = pullDir;
    const from = here();
    const to = from + dir;
    if (to < 0 || to >= ORDER.length) return reset();
    cancelAnimationFrame(raf);
    going = true;
    pull = 1;
    menu.locked = true;
    menu.hide();
    const duration = reducedMotion ? 700 : PULL.duration;
    let start = performance.now();
    let changed = false;
    let ready = false;

    // once the black is full, the page changes behind it; the new one shows as the black lifts
    const change = () => {
      changed = true;
      hero.style.transform = '';
      Promise.resolve(router.go(ORDER[to], { instant: true })).then(() => {
        // moving on lands at the top of the new page; moving back lands at its bottom
        const scroller = scrollerFor(null);
        if (scroller) scroller.scrollTop = dir > 0 ? 0 : scroller.scrollHeight;
        ready = true;
      });
    };

    const step = (now) => {
      let t = Math.min(1, (now - start) / duration);
      if (!changed && t >= BLACK) change();
      // the black only lifts once the new page is ready behind it
      if (!ready && t > EXIT.from) {
        start += now - (start + EXIT.from * duration);
        t = EXIT.from;
      }

      // the bar snaps away as the black comes up
      drawBar(1, dir, 1 - sm(t / 0.08), now);
      const eRaw = clamp01((t - EXIT.from) / EXIT.span);
      drawOverlay(Math.min(sm(t / BLACK), 1 - sm((eRaw - 0.3) / 0.7)));
      if (!changed) hero.style.transform = reducedMotion ? '' : `scale(${(1 - 0.04 * sm(t / BLACK)).toFixed(4)})`;
      else {
        const e = sm((t - EXIT.from) / EXIT.span);
        hero.style.transform = reducedMotion ? '' : `scale(${(0.96 + 0.04 * e).toFixed(4)})`;
      }

      const rIn = clamp01((t - IN.from) / IN.span);
      const sw = reducedMotion ? (t >= HAND.from ? 1 : 0) : sm((t - HAND.from) / HAND.span);
      const hop = Math.sin(Math.PI * sw);
      names.forEach((_, i) => {
        const a = reducedMotion ? sm(rIn) : sm(rIn * 1.8 - i * PULL.stagger); // dropping in
        const b = reducedMotion ? sm(eRaw) : sm(eRaw * 1.8 - i * PULL.stagger); // falling away
        let y = NAMES[i].y + (reducedMotion ? 0 : -(1 - a) * PULL.dropDist + b * PULL.dropDist);
        let color = mixBlue(0);
        if (i === to) {
          if (!reducedMotion) y -= PULL.hopUp * hop;
          color = mixBlue(sw);
        } else if (i === from) {
          if (!reducedMotion) y += PULL.dipDown * hop;
          color = mixBlue(1 - sw);
        }
        drawName(i, y, Math.min(a, 1 - b), color);
      });

      if (t < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      raf = 0;
      reset();
      cooldownUntil = performance.now() + PULL.cooldown;
    };
    raf = requestAnimationFrame(step);
  }

  return {
    get pull() {
      return pull;
    },
    get going() {
      return going;
    },
  };
}
