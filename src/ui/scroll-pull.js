/**
 * Scroll between pages with the pull bar.
 *
 * Keep scrolling past the end of a page and a glowing bar rises on that edge of the screen with the next page's name
 * beside it. The further you pull, the longer and brighter it gets, and it bows in toward the middle of the screen like a
 * band being stretched (trembling a little near the end). Let go early and it springs back. Pull it all the way and the
 * next page is simply there: no transition. It only ever moves one page. Scrolling up past the top goes to the previous
 * page the same way. Order: pages/order.js (about me -> photos -> say hi); nothing happens before the first or after the last.
 *
 * Wheel / trackpad, ↑ ↓ PgUp PgDn Space at a page's edge, and on a touch screen, dragging past the page's end (the bar
 * follows the finger, holds while it's down, and a full pull is about a third of the screen's height).
 * Every visual is drawn from a couple of numbers (pull, pullDir) on each frame: no CSS transitions.
 */

import { PAGE_ORDER } from '../pages/order.js';

/** Tune here. */
export const PULL = {
  distance: 600, // px of wheel past the edge for a full pull
  springBack: 0.86, // let go early: the pull is multiplied by this every frame until it's gone
  releaseDelay: 220, // ms after the last wheel event before it springs back
  cooldown: 700, // ms after a page change when scrolling is ignored (so a trackpad's coasting doesn't start another)
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

const ORDER = PAGE_ORDER.map(({ id }) => id);
const NAMES = PAGE_ORDER.map(({ name, html }) => html ?? name);

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

export function createScrollPull({ router, hero }) {
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

  let pull = 0;
  let pullDir = 1;
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
    if (performance.now() < cooldownUntil) return true;
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
      // (the photo viewer and say hi's message box keep theirs)
      if (event.target.closest('.carousel:not([hidden]), textarea')) return;
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
  const TOUCH_SKIP = '.carousel:not([hidden]), textarea, input';
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
      if (finger.axis !== 'y' || !dy) return;
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

  /** While pulling, every frame: draw the bar, and once the scrolling stops, spring back. */
  function tick(now) {
    if (!touching && now - lastInput > PULL.releaseDelay) pull *= PULL.springBack;
    if (pull < 0.005) {
      raf = 0;
      return reset();
    }
    drawPull(now);
    raf = requestAnimationFrame(tick);
  }

  /** Back to rest: the bar gone. */
  function reset() {
    touching = false;
    pull = 0;
    bar.classList.remove('is-up');
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
    label.innerHTML = next >= 0 ? `${dir > 0 ? '↓' : '↑'} ${NAMES[next]}` : '';
    label.style.color = color;
    label.style.opacity = String(sm((k - 0.15) / 0.35));
    const labelY = midY - dir * BAR.labelGap;
    label.style.transform = `translate(-50%, ${dir > 0 ? '-100%' : '0'}) translateY(${labelY.toFixed(1)}px)`;
  }

  /** While pulling: the bar. */
  function drawPull(now) {
    drawBar(pull, pullDir, 1, now);
  }

  // ---- the page change: straight to the next page -------------------------------------------------------------------
  function commit() {
    const dir = pullDir;
    const to = ORDER[here() + dir];
    cancelAnimationFrame(raf);
    raf = 0;
    reset();
    cooldownUntil = performance.now() + PULL.cooldown;
    if (to === undefined || !router.go(to)) return;
    // moving on lands at the top of the new page; moving back lands at its bottom
    const scroller = scrollerFor(null);
    if (scroller) scroller.scrollTop = dir > 0 ? 0 : scroller.scrollHeight;
  }

  return {
    get pull() {
      return pull;
    },
  };
}
