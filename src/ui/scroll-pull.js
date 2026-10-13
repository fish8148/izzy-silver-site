/**
 * Scroll between pages, "roll from the seam" (the scroll-transition handoff, board 11a).
 *
 * Keep scrolling past the end of a page and the next one builds up as a pull:
 *   1. the right-hand seam stretches,
 *   2. the edge menu opens out of it, outward from the current page's label,
 *   3. the list rolls one slot, so the next page's label moves into the current one's place and turns blue,
 *   4. at a full pull the page swaps behind the menu and the menu tucks away. Let go early and it springs back.
 * Scrolling up past the top goes to the previous page the same way, rolling the other way. Order:
 * homepage -> about me -> photos -> my things -> say hi; nothing happens before the first or after the last.
 *
 * Wheel / trackpad, and ↑ ↓ PgUp PgDn Space at a page's edge. Mouse devices only, since it draws the edge menu
 * (src/ui/edge-menu.js); touch screens swipe between pages instead (router.js).
 *
 * Every visual is drawn from a handful of numbers (pull, pullDir, going, t) on each frame: no CSS transitions.
 */

/** Izzy's settled values (the handoff README's table). Tune here. */
export const PULL = {
  distance: 600, // px of wheel past the edge for a full pull
  springBack: 0.8, // let go early: the pull is multiplied by this every frame until it's gone
  releaseDelay: 200, // ms after the last wheel event before it springs back
  cooldown: 700, // ms after a page change when scrolling is ignored (so trackpad coasting can't change page again)
  seamStart: 0.35, // the first part of the pull only stretches the seam
  menuOpen: 0.5, // ...then the menu opens over this much of the rest
  rollLag: 0.3, // ...and the roll waits this much of the rest before starting
  seamGrow: 440, // px the seam gains (it rests at 200)
  seamWidth: 4, // px wide at full stretch (it rests at 2)
  stagger: 0.22, // per label, as the menu opens outward from the current one
  slide: 40, // px each label slides in from the right
  shade: 1, // the shade's opacity, fully open
  activeScale: 0.12, // the label in the current slot grows by this
  rows: 2.6, // labels further than this many slots from the current one fade out
  duration: 1000, // ms of the page change once the pull is complete
  hold: 0.55, // part of that the menu stays fully open (the pages swap within it)
  pageShift: 115, // px the outgoing and incoming pages travel
  nudge: 20, // px the page gives while you pull, like a rubber band
  keyStep: { ArrowDown: 80, ArrowUp: -80, PageDown: 300, PageUp: -300, ' ': 300 },
};

const ORDER = [null, 'about', 'photos', 'my-things', 'say-hi']; // null: the home screen
const SEAM_REST = { height: 200, width: 2, opacity: 0.28 };
const WHITE = [255, 255, 255];
const BLUE = [111, 179, 224]; // #6fb3e0, the current page

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sm = (x) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};
const mix = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(', ')})`;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createScrollPull({ router, menu, hero }) {
  if (!menu) return null;

  let pull = 0;
  let pullDir = 1;
  let going = false;
  let t = 0;
  let cooldownUntil = 0;
  let releaseTimer = 0;
  let raf = 0;
  let rests = null; // each label's resting centre while the pull has the menu (null: it doesn't)

  // ---- where we are ------------------------------------------------------------------------------------------------
  const here = () => ORDER.indexOf(router.currentId);
  /** The page `dir` steps away (null is home), or undefined if there's none that way. */
  function neighbour(dir) {
    const i = here() + dir;
    return i >= 0 && i < ORDER.length ? ORDER[i] : undefined;
  }

  const scrolls = (el) => el.matches('.page__col, .page__scroll, .trips__chapters') && getComputedStyle(el).overflowY === 'auto' && el.scrollHeight - el.clientHeight > 1;

  /** The page's own scroller that `el` sits in, or, with no `el` (keyboard), the open page's main one. */
  function scrollerFor(el) {
    for (let n = el; n && n !== hero && n instanceof Element; n = n.parentElement) if (scrolls(n)) return n;
    if (el && el !== document.body && el !== document.documentElement && hero.contains(el) && !el.closest('.page')) return null; // (anywhere on a page counts as over its scroller)
    const page = hero.querySelector('.page:not([hidden])');
    return page ? [...page.querySelectorAll('.page__col, .page__scroll, .trips__chapters')].find(scrolls) ?? null : null;
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
    if (going || performance.now() < cooldownUntil) return true;
    if (menu.isOpen || router.isBusy) return false; // the menu is open by hand, or a page is still arriving
    const dir = Math.sign(dy);
    if (!dir) return false;
    const atEdge = dir > 0 ? edges(scroller).bottom : edges(scroller).top;
    const toward = neighbour(dir) !== undefined;
    if (toward && atEdge && (pull === 0 || dir === pullDir)) {
      if (!rests) rests = menu.beginPull();
      pull = Math.min(1, pull + Math.abs(dy) / PULL.distance);
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
      draw();
      releaseTimer = setTimeout(release, PULL.releaseDelay);
    }
    return true;
  }

  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; // pinch-zoom, or sideways
      if (!(event.target instanceof Element) || event.target.closest('.carousel:not([hidden]), .interact-menu')) return;
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
    // keys that belong to something else: typing, a focused button / link (Space presses it), the page menu, the viewer
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
      draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /** Back to rest: the menu handed back, the page where it was. */
  function reset() {
    pull = 0;
    t = 0;
    going = false;
    menu.locked = false;
    if (rests) menu.endPull();
    rests = null;
    hero.style.transform = '';
    hero.style.opacity = '';
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------
  /** `sw`: how far the page swap has got (commit only), `incoming`: whether the new page is the one showing. */
  function draw({ sw = 0, incoming = false, ready = true } = {}) {
    const S = PULL.seamStart;
    const ph = 1 - S;
    const m = going ? (t < PULL.hold ? 1 : 1 - sm((t - PULL.hold) / (1 - PULL.hold))) : sm((pull - S) / (ph * PULL.menuOpen));
    const c = going ? 1 : sm((pull - S - ph * PULL.rollLag) / (ph * (1 - PULL.rollLag)));
    const k = going ? 1 : Math.min(1, pull / S);

    // the seam stretches, then fades as the menu takes over
    const h = Math.min(SEAM_REST.height + k * PULL.seamGrow, window.innerHeight * 0.94);
    menu.setSeam(
      {
        h,
        center: window.innerHeight / 2,
        w: SEAM_REST.width + k * (PULL.seamWidth - SEAM_REST.width),
        op: (SEAM_REST.opacity + k * (1 - SEAM_REST.opacity)) * (1 - m),
      },
      pull > 0 || going,
    );
    menu.shade.style.opacity = String(m * PULL.shade);

    // the labels roll through a fixed slot: the current page's label's resting place. The page it's rolling toward
    // ends up exactly there, so (here, in the old layout) nothing jumps when the menu re-rests on the new page.
    const cur = here();
    const gap = rests.length > 1 ? (rests[rests.length - 1] - rests[0]) / (rests.length - 1) : 1;
    const slot = rests[cur];
    const roll = -pullDir * c * gap;
    menu.items.forEach(({ li, link }, i) => {
      const y = rests[i] + roll;
      const d = Math.abs(y - slot) / gap;
      const mk = sm(m * (1 + 2 * PULL.stagger) - Math.abs(i - cur) * PULL.stagger);
      const near = sm(1 - d);
      li.style.opacity = String(mk * sm(1 - d / PULL.rows));
      li.style.transform = reducedMotion ? 'none' : `translate(${((1 - mk) * PULL.slide).toFixed(2)}px, ${roll.toFixed(2)}px)`;
      link.style.color = mix(WHITE, BLUE, near);
      link.style.transform = `scale(${(1 + PULL.activeScale * near).toFixed(4)})`;
    });

    // the page: a small rubber-band give while pulling; during the change, the old page rises out and the new one
    // rises in from below (the hero is one layer, so the two go one after the other, both behind the menu)
    if (!going) {
      hero.style.transform = pull > 0 && !reducedMotion ? `translateY(${(-pullDir * pull * PULL.nudge).toFixed(2)}px)` : '';
      hero.style.opacity = '';
      return;
    }
    const shift = reducedMotion ? 0 : PULL.pageShift;
    if (!incoming) {
      hero.style.opacity = String(1 - sm(sw / 0.5));
      hero.style.transform = shift ? `translateY(${(-pullDir * (PULL.nudge + sw * shift)).toFixed(2)}px)` : '';
    } else {
      hero.style.opacity = ready ? String(sm((sw - 0.5) / 0.5)) : '0';
      hero.style.transform = shift ? `translateY(${(pullDir * shift * (1 - sw)).toFixed(2)}px)` : '';
    }
  }

  // ---- the page change ---------------------------------------------------------------------------------------------
  function commit() {
    const to = neighbour(pullDir);
    if (to === undefined) return reset();
    const dir = pullDir;
    going = true;
    pull = 1;
    t = 0;
    menu.locked = true;
    const duration = reducedMotion ? 200 : PULL.duration;
    const hold = reducedMotion ? 1 : PULL.hold;
    const start = performance.now();
    let swapped = false;
    let ready = false;

    const step = (now) => {
      t = Math.min(1, (now - start) / duration);
      const sw = sm(t / hold);
      if (!swapped && sw >= 0.5) {
        swapped = true;
        // swap while the hero is fully faded out; the router's own transitions are skipped behind it
        Promise.resolve(router.go(to, { instant: true })).then(() => {
          // moving on lands at the top of the new page; moving back lands at its bottom
          const scroller = scrollerFor(null);
          if (scroller) scroller.scrollTop = dir > 0 ? 0 : scroller.scrollHeight;
          ready = true;
        });
      }
      draw({ sw, incoming: swapped, ready });
      if (t < 1 || !ready) {
        raf = requestAnimationFrame(step);
        return;
      }
      cooldownUntil = performance.now() + PULL.cooldown;
      reset();
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
