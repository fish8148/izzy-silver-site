/**
 * Scroll between pages, the "drop" row (the scroll-row-transition handoff, board 16a; it replaced 11a).
 *
 * Keep scrolling past the end of a page and the next one builds up as a pull:
 *   1. the page fades to black and a full-screen row of all five page names drops in, one at a time, left to right,
 *      the current page's name blue;
 *   2. at a full pull the blue hands over: the next page's name hops up, the current one dips;
 *   3. the names fall away in the same order, the black lifts, and the next page is there.
 * Let go early and it springs back. Scrolling up past the top goes to the previous page the same way. Order:
 * homepage -> about me -> photos -> my things -> say hi; nothing happens before the first or after the last.
 *
 * Keep scrolling through a change and the blue hands over again to the page after, for as far as you scroll (the row
 * stays up until you stop). With the edge menu open by hand, scrolling walks the menu instead.
 *
 * Wheel / trackpad, and ↑ ↓ PgUp PgDn Space at a page's edge. Touch screens swipe between pages instead (router.js).
 * Every visual is drawn from a handful of numbers (pull, pullDir, going, t) on each frame: no CSS transitions.
 */

/** The handoff's values. Tune here. */
export const PULL = {
  distance: 600, // px of wheel past the edge for a full pull
  springBack: 0.82, // let go early: the pull is multiplied by this every frame until it's gone
  releaseDelay: 200, // ms after the last wheel event before it springs back
  duration: 1600, // ms of the page change once the pull is complete
  cooldown: 150, // ms after a page change when scrolling is ignored (a brief breath before the next pull can start)
  dropDist: 70, // px each name falls in and falls away
  stagger: 0.2, // per name
  hopUp: 22, // px the incoming page's name jumps
  dipDown: 8, // px the outgoing one dips
  chainAt: 0.5, // keep scrolling through a change and it carries on: this much of a full pull, scrolled meanwhile,
  //              hands the blue on to the page after (and so on, for as far as you scroll)
  menuStep: 90, // px of scroll per page while the edge menu is open by hand (scrolling then just walks the list)
  keyStep: { ArrowDown: 80, ArrowUp: -80, PageDown: 300, PageUp: -300, ' ': 300 },
};

const ORDER = [null, 'about', 'photos', 'my-things', 'say-hi']; // null: the home screen
// The row: each name's text, and its hand-set resting tilt (deg) and offset (px)
const NAMES = [
  { html: 'homepage', rot: -2.4, y: 2 },
  { html: 'about me', rot: 0, y: 0 },
  { html: 'photos', rot: -1.2, y: 1 },
  { html: 'my things', rot: 0.4, y: 0 },
  { html: 'say <em>hi</em>', rot: -1.6, y: -1 },
];
// Where the commit's phases fall (fractions of `duration`)
const HAND = { from: 0.08, span: 0.3 }; // the blue handing over
const EXIT = { from: 0.58, span: 0.42 }; // the names falling away and the black lifting

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sm = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const mixBlue = (k) => `rgb(${Math.round(255 - 144 * k)}, ${Math.round(255 - 76 * k)}, ${Math.round(255 - 31 * k)})`; // #fff → #6fb3e0

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createScrollPull({ router, menu, hero }) {
  if (!menu) return null;

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
  let releaseTimer = 0;
  let raf = 0;
  let carry = 0; // px scrolled on (in pullDir) while a page change was playing, to carry on with

  // ---- where we are ------------------------------------------------------------------------------------------------
  const here = () => ORDER.indexOf(router.currentId);
  /** The page `dir` steps away from index `from` (null is home), or undefined if there's none that way. */
  function neighbour(dir, from = here()) {
    const i = from + dir;
    return i >= 0 && i < ORDER.length ? ORDER[i] : undefined;
  }

  const SCROLLERS = '.page__col, .page__scroll, .trips__chapters';
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
    if (going) {
      // still scrolling while the page changes: save it up to carry on with (turning back cancels it)
      carry = Math.sign(dy) === pullDir ? carry + Math.abs(dy) : Math.max(0, carry - Math.abs(dy));
      return true;
    }
    if (performance.now() < cooldownUntil) return true;
    if (router.isBusy) return false; // a page is still arriving
    const dir = Math.sign(dy);
    if (!dir) return false;
    const atEdge = dir > 0 ? edges(scroller).bottom : edges(scroller).top;
    const toward = neighbour(dir) !== undefined;
    if (toward && atEdge && (pull === 0 || dir === pullDir)) {
      const reach = pull + Math.abs(dy) / PULL.distance;
      carry = Math.max(0, reach - 1) * PULL.distance; // a big flick that overshoots a full pull keeps the rest
      pull = Math.min(1, reach);
      pullDir = dir;
    } else if (pull > 0) {
      pull = Math.max(0, pull - Math.abs(dy) / PULL.distance); // turning back eats the pull first
    } else return false;

    cancelAnimationFrame(raf);
    clearTimeout(releaseTimer);
    if (pull >= 1) {
      commit();
      return true;
    }
    if (pull === 0) reset();
    else {
      drawPull();
      releaseTimer = setTimeout(release, PULL.releaseDelay);
    }
    return true;
  }

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; // pinch-zoom, or sideways
      if (!(event.target instanceof Element)) return;
      // (with the edge menu open, scrolling anywhere walks the menu; otherwise the viewer and interact menu keep theirs)
      if (!menu.isOpen && event.target.closest('.carousel:not([hidden]), .interact-menu')) return;
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
      clearTimeout(releaseTimer);
      reset();
    }
    return true;
  };

  /** Let go early: spring back to nothing. */
  function release() {
    const step = () => {
      pull *= PULL.springBack;
      if (pull < 0.005) return reset();
      drawPull();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /** Back to rest: the overlay gone, the page as it was. */
  function reset() {
    menuTarget = -1;
    menuAcc = 0;
    pull = 0;
    going = false;
    menu.locked = false;
    menu.dimSeams(0);
    overlay.classList.remove('is-up');
    overlay.style.opacity = '';
    hero.style.transform = '';
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
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

  /** While pulling: the page fades to black and steps back, and the names drop in, left to right. */
  function drawPull() {
    const ov = sm(pull / 0.5);
    drawOverlay(ov);
    hero.style.transform = reducedMotion || !ov ? '' : `scale(${(1 - 0.04 * ov).toFixed(4)})`;
    const rIn = clamp01((pull - 0.15) / 0.45);
    const cur = here();
    names.forEach((_, i) => {
      const a = reducedMotion ? sm(rIn) : sm(rIn * 1.8 - i * PULL.stagger);
      const drop = reducedMotion ? 0 : (1 - a) * PULL.dropDist;
      drawName(i, NAMES[i].y - drop, a, mixBlue(i === cur ? 1 : 0));
    });
  }

  // ---- the page change ---------------------------------------------------------------------------------------------
  function commit() {
    if (neighbour(pullDir) === undefined) {
      carry = 0;
      return reset();
    }
    const dir = pullDir;
    going = true;
    pull = 1;
    menu.locked = true;
    menu.hide();
    let from = here();
    let to = from + dir;
    const duration = reducedMotion ? 400 : PULL.duration;
    let start = performance.now();
    let ready = false;

    // behind the full black, the page changes straight away; the next one shows as the black lifts
    const goTo = (i) => {
      ready = false;
      Promise.resolve(router.go(ORDER[i], { instant: true })).then(() => {
        // moving on lands at the top of the new page; moving back lands at its bottom
        const scroller = scrollerFor(null);
        if (scroller) scroller.scrollTop = dir > 0 ? 0 : scroller.scrollHeight;
        ready = true;
      });
    };
    goTo(to);

    const step = (now) => {
      let t = Math.min(1, (now - start) / duration);
      // still scrolling on, with somewhere to go? Before the names fall away, hand the blue on again
      if (!reducedMotion && t >= EXIT.from && ready && carry >= PULL.chainAt * PULL.distance && neighbour(dir, to) !== undefined) {
        carry = Math.max(0, carry - PULL.distance);
        from = to;
        to += dir;
        goTo(to);
        start = now - HAND.from * duration;
        t = HAND.from;
      }
      // the black only lifts once the new page is ready behind it
      if (!ready && t > EXIT.from) {
        start += now - (start + EXIT.from * duration);
        t = EXIT.from;
      }

      const sw = reducedMotion ? (t > 0 ? 1 : 0) : sm((t - HAND.from) / HAND.span);
      const eRaw = clamp01((t - EXIT.from) / EXIT.span);
      drawOverlay(1 - sm((eRaw - 0.3) / 0.7));
      const e = sm((t - EXIT.from) / EXIT.span);
      hero.style.transform = reducedMotion ? '' : `scale(${(0.96 + 0.04 * e).toFixed(4)})`;
      const hop = Math.sin(Math.PI * sw);
      names.forEach((_, i) => {
        const b = reducedMotion ? sm(eRaw) : sm(eRaw * 1.8 - i * PULL.stagger);
        let y = NAMES[i].y + (reducedMotion ? 0 : b * PULL.dropDist);
        let color = mixBlue(0);
        if (i === to) {
          if (!reducedMotion) y -= PULL.hopUp * hop;
          color = mixBlue(sw);
        } else if (i === from) {
          if (!reducedMotion) y += PULL.dipDown * hop;
          color = mixBlue(1 - sw);
        }
        drawName(i, y, 1 - b, color);
      });

      if (t < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      const extra = carry;
      carry = 0;
      reset();
      cooldownUntil = performance.now() + PULL.cooldown;
      // a little scrolling left over: carry it into the page you've landed on
      const scroller = scrollerFor(null);
      if (extra > 0 && scroller) scroller.scrollTop += dir * extra;
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
