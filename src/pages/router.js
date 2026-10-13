/**
 * Page transitions. Plain DOM + Web Animations API, separate from the Three.js scene.
 *
 * Pages have no header and no menu of their own: you move between them with the edge menu (src/ui/edge-menu.js), by
 * scrolling past a page's end (src/ui/scroll-pull.js), by swiping on a touch screen (below), or with the browser's
 * back / forward and Esc.
 *
 * Opening a page from home (click one of the floating labels):
 *   1. the character (+ nametag, floor glow) fades out, and every label — "interact" and the clicked one included —
 *      slides off through whichever screen edge it's nearest to, fading as it goes
 *   2. the page's content blocks fade + slide in from the left, one after another
 * Going home again reverses it: the content leaves, then the character fades back up and every home label drifts back in
 * from its nearest edge, staggered. Switching straight from one page to another crossfades their content.
 *
 * A page is just { render(el), blocks(el), stagger?, exit?, onShow?(el), onHide?(el), back?(el) } — see pages/index.js.
 * `exit` says how the content leaves: { targets(el) -> elements in order, stagger, duration, slide, easing }.
 * By default that's `blocks` in reverse, sliding left; Photos fades whatever is on screen, left to right, instead.
 * `onShow` runs as the page appears and `onHide` as it starts to leave (for pages that run something, like the photo drift).
 * `onHide` may return a promise: the router waits for it, along with the content leaving, before it moves on.
 * `back` gets the first press of Esc: a page with a sub-view (my things has one open object) returns true
 * once it has stepped out of it, and only when it returns nothing does the press close the page.
 * The router fires `page:opening | opened | closing | closed | returning` on the hero element so other
 * systems (e.g. the 3D scene) can pause / resume without the router knowing about them. Switching pages fires none of
 * these — the hero never stops being "a page is open" during a switch.
 */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const EASE_IO = 'cubic-bezier(0.4, 0, 0.2, 1)'; // soft at both ends: for things that fade rather than travel

// All timings in ms.
const T = {
  fade: 240, // character fade, on the way to a page
  exit: 420, // home labels sliding off their nearest edge, on the way to a page
  enter: 650, // each content block sliding + fading in
  stagger: 200, // default gap between blocks
  contentOut: 300, // content leaving to the left
  exitSpan: 700, // however many things leave, the run of staggered starts is squeezed to fit inside this
  homeIn: 900, // the character + floor glow fading up, and each home label drifting back in, on the way home
  edgeStagger: 70, // gap between each home label drifting in
  switchOut: 180, // switching pages: the old page's content fading out...
  switchIn: 380, // ...while the new page's fades + slides in, at the same time
  switchSpan: 240, // however many blocks come in, their staggered starts fit inside this
};
const SLIDE_PX = 40; // how far content travels while sliding in from the left

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const held = new Set(); // animations that keep painting their last frame until releaseHeld()

/** Let go of everything `play(..., { hold: true })` was keeping in place. Only call this once it's out of sight. */
function releaseHeld() {
  for (const animation of held) animation.cancel();
  held.clear();
}

/**
 * Animate `el`, then leave it in its final state as plain inline style, and resolve.
 *
 * The moment the animation is swapped for inline style is the risky one. Photos, the canvas, the floor glow and the
 * nametag all have a CSS `transition` on opacity, and Safari starts one from the un-animated style when the inline value
 * changes underneath a finished animation: the element pops back for a moment and then fades again. So the swap is done
 * by hand with the element's transitions switched off, and only once the style has settled do they come back.
 * (This deliberately doesn't use commitStyles(), which triggers exactly that.)
 *
 * `hold: true` is for things that are about to be hidden anyway: the animation is left in place, still painting its
 * last frame, so there is no swap to get wrong. Call releaseHeld() after they've gone.
 */
async function play(el, keyframes, { hold = false, ...options } = {}) {
  if (!el) return;
  const animation = el.animate(keyframes, { fill: 'forwards', ...options });
  try {
    await animation.finished;
  } catch {
    return; // cancelled while it was running
  }
  if (hold) {
    held.add(animation);
    return;
  }

  const last = keyframes[keyframes.length - 1];
  const transition = el.style.transition;
  el.style.transition = 'none';
  for (const property of ['opacity', 'transform']) {
    if (last[property] !== undefined) el.style.setProperty(property, String(last[property]));
  }
  animation.cancel();
  void getComputedStyle(el).opacity; // settle the style change now, while transitions are still off
  el.style.transition = transition;
}

// For travel where "no motion" is itself a reasonable reduced-motion fallback (an element that fades in or out
// somewhere off-screen might as well just fade in place).
const move = (x, y) => (reducedMotion ? 'none' : `translate(${x}px, ${y}px)`);

/** Cancel the router's own animations on an element (not its CSS animations / transitions). Read what you need first. */
function stopAnimations(el) {
  for (const animation of el.getAnimations()) {
    if (!(animation instanceof CSSAnimation) && !(animation instanceof CSSTransition)) animation.cancel();
  }
}

/** Where a label goes when it leaves (or comes from): straight through whichever side edge it's nearest to. */
function edgeExit(el) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const x = cx < window.innerWidth / 2 ? -(r.right + 60) : window.innerWidth - r.left + 60;
  return { x, y: 0 };
}

// The order home labels drift back in, on the way home.
const RETURN_ORDER = ['interact', 'about', 'say-hi', 'photos', 'my-things'];

export function createPageRouter({ hero, pages }) {
  const floaters = [...hero.querySelectorAll('.floater')];
  const interactFloater = hero.querySelector('#interact-toggle').closest('.floater');
  const interactLabel = interactFloater.querySelector('.floater__label');
  const characterLayer = ['.hero__canvas', '.nametag', '.hero__floor'].map((s) => hero.querySelector(s)).filter(Boolean);
  // The nametag positions itself every frame (an inline transform) and already fades through its own CSS transition,
  // so on the way back it's handled separately from the rest.
  const nametag = hero.querySelector('.nametag');
  const fadeLayer = characterLayer.filter((el) => el !== nametag);

  const pageEl = (id) => hero.querySelector(`.page[data-page="${id}"]`);
  const labelFor = (id) => hero.querySelector(`.floater__label[data-page="${id}"]`);

  let current = null; // { id, def, page }
  let busy = false;
  // The history entry we're on, as we last wrote or saw it. (A hash typed into the address bar lands on a fresh entry
  // with no state; this is what it was typed on top of.) State: { page, depth: entries since home, deep: no home behind }.
  let lastState = history.state;

  /** Size the page's content column: the full width between the margins (wider layouts refine it in pages.css). */
  function layout(page) {
    const vw = hero.clientWidth;
    const pad = Math.min(140, Math.max(20, vw * 0.07));
    page.style.setProperty('--col-left', `${pad}px`);
    page.style.setProperty('--col-width', `${Math.max(160, vw - 2 * pad)}px`);
  }

  /** Esc: a page's own sub-view first (if any), then the page itself. */
  function goBack() {
    if (busy || !current) return;
    if (current.def.back?.(current.page)) return;
    close();
  }

  // ---- content: shared by opening a page, switching pages, and closing one -----------------------------------------
  /** Kicks the page's content off screen, held at its last frame. Call finishLeave() once `ready` settles. */
  function leaveContent(page, def) {
    const settled = Promise.resolve(def.onHide?.(page)).catch(() => {}); // (a page may still be tidying up: waited for below)
    const exit = {
      targets: (p) => [...def.blocks(p)].reverse(),
      stagger: 45,
      duration: T.contentOut,
      slide: SLIDE_PX * 1.2,
      easing: EASE_IN,
      ...def.exit,
    };
    const leaving = exit.targets(page);
    const slide = reducedMotion ? 0 : exit.slide;
    // however many things leave, keep the whole run of staggered starts inside T.exitSpan
    const step = leaving.length > 1 ? Math.min(exit.stagger, T.exitSpan / (leaving.length - 1)) : 0;
    const ready = Promise.all([
      ...leaving.map((el, i) => {
        const from = getComputedStyle(el).opacity; // not always 1: hovered photos dim the others
        return play(
          el,
          slide
            ? [
                { opacity: from, transform: 'translateX(0px)' },
                { opacity: 0, transform: `translateX(${-slide}px)` },
              ]
            : [{ opacity: from }, { opacity: 0 }],
          { duration: exit.duration, delay: i * step, easing: exit.easing, fill: 'both', hold: true },
        );
      }),
      settled,
    ]);
    return { leaving, ready };
  }

  /** Call once `ready` (and anything else that was held alongside it) has settled. */
  function finishLeave(page, def, leaving) {
    page.hidden = true;
    releaseHeld();
    for (const el of new Set([...leaving, ...def.blocks(page)])) {
      el.style.opacity = '';
      el.style.transform = '';
    }
  }

  /** The page's content fading + sliding in, one block after another. */
  async function enterContent(page, def) {
    if (!page.dataset.rendered) {
      def.render(page);
      page.dataset.rendered = 'true';
    }
    layout(page);
    page.hidden = false;
    def.onShow?.(page);
    const slide = reducedMotion ? 0 : SLIDE_PX;
    const step = def.stagger ?? T.stagger;
    await Promise.all(
      def.blocks(page).map(async (block, i) => {
        await play(
          block,
          [
            { opacity: 0, transform: `translateX(${-slide}px)` },
            { opacity: 1, transform: 'translateX(0px)' },
          ],
          { duration: T.enter, delay: i * step, easing: EASE_OUT, fill: 'both' },
        );
        block.style.opacity = '';
        block.style.transform = '';
      }),
    );
  }

  // ---- open: home -> page ------------------------------------------------------------------------------------------
  async function open(id, { instant = false, fromHistory = false } = {}) {
    const def = pages[id];
    if (busy || current || !def) return false;
    busy = true;
    releaseHeld(); // (nothing should be left over, but a stray held fade must never survive into a new page)
    const k = instant ? 0 : 1;
    const labels = floaters.map((f) => f.querySelector('.floater__label'));
    const vectors = labels.map((el) => [el, edgeExit(el)]); // measured before anything moves

    hero.dispatchEvent(new CustomEvent('page:opening', { detail: { id } }));
    hero.classList.add('is-page-open');
    interactLabel.setAttribute('aria-expanded', 'false');
    hero.querySelector('#interact-menu')?.setAttribute('hidden', '');
    if (!fromHistory) {
      history.pushState({ page: id, depth: 1 }, '', `#${id}`);
      lastState = history.state;
    }

    // 1: character fade, and every label sliding off its nearest edge, all at once
    await Promise.all([
      ...characterLayer.map((el) => play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * k, easing: EASE_OUT })),
      ...vectors.map(([el, v]) =>
        play(
          el,
          [
            { opacity: 1, transform: 'translate(0px, 0px)' },
            { opacity: 0, transform: move(v.x, v.y) },
          ],
          { duration: T.exit * k, easing: EASE_IN },
        ),
      ),
    ]);
    // Hide what's clickable or readable so it can't be tabbed to. The canvas and the floor glow are left "visible" at
    // opacity 0: hiding a WebGL canvas lets some browsers throw its drawing buffer away, and it comes back blank.
    [nametag, ...floaters].forEach((el) => el && (el.style.visibility = 'hidden'));

    // The page is open from here on (a switch or Esc can take over) while the content is still coming in.
    const page = pageEl(id);
    current = { id, def, page };
    busy = false;
    hero.dispatchEvent(new CustomEvent('page:opened', { detail: { id } }));

    // 2: content in
    enterContent(page, def).then(() => {
      if (current?.page === page) page.focus({ preventScroll: true });
    });
    return true;
  }

  // ---- switchTo: page -> page ---------------------------------------------------------------------------------------
  // A switch never blocks: `current` becomes the new page straight away, and the two pages' content crossfades.
  const pageGen = new WeakMap(); // page -> counter, bumped whenever it starts showing or leaving (a stale fade-out skips hiding it)
  const fading = new WeakMap(); // page -> the elements its last fade-out touched

  /** The old page's content fades out quickly; the page is hidden afterwards unless it has been switched back to. */
  function swapOut(page, def) {
    const gen = (pageGen.get(page) ?? 0) + 1;
    pageGen.set(page, gen);
    const settled = Promise.resolve(def.onHide?.(page)).catch(() => {});
    const targets = (def.exit?.targets ?? def.blocks)(page);
    const step = targets.length > 1 ? Math.min(30, 120 / (targets.length - 1)) : 0;
    fading.set(page, targets);
    const fades = targets.map((el, i) => {
      const from = getComputedStyle(el).opacity;
      stopAnimations(el);
      return el
        .animate([{ opacity: from }, { opacity: 0 }], { duration: T.switchOut, delay: i * step, easing: EASE_IN, fill: 'both' })
        .finished.catch(() => {});
    });
    Promise.all([...fades, settled]).then(() => {
      if (pageGen.get(page) !== gen) return; // it's showing again
      page.hidden = true;
      for (const el of new Set([...targets, ...def.blocks(page)])) {
        stopAnimations(el);
        el.style.opacity = '';
        el.style.transform = '';
      }
      fading.delete(page);
    });
  }

  /** The new page's content fades + slides in, quickly, straight away. */
  function swapIn(page, def) {
    pageGen.set(page, (pageGen.get(page) ?? 0) + 1);
    // still fading out from a moment ago? take each element from the opacity it has reached
    const reached = new Map();
    for (const el of fading.get(page) ?? []) {
      reached.set(el, getComputedStyle(el).opacity);
      stopAnimations(el);
    }
    fading.delete(page);
    if (!page.dataset.rendered) {
      def.render(page);
      page.dataset.rendered = 'true';
    }
    layout(page);
    const wasHidden = page.hidden;
    page.hidden = false;
    def.onShow?.(page);
    const blocks = def.blocks(page);
    const step = blocks.length > 1 ? Math.min(def.stagger ?? T.stagger, T.switchSpan / (blocks.length - 1)) : 0;
    const slide = reducedMotion ? 0 : SLIDE_PX / 2;
    blocks.forEach((block, i) => {
      const from = Number(reached.get(block) ?? (wasHidden ? 0 : getComputedStyle(block).opacity));
      stopAnimations(block);
      block.style.opacity = '';
      block.style.transform = '';
      if (from >= 1) return;
      block
        .animate(
          [
            { opacity: from, transform: `translateX(${-slide * (1 - from)}px)` },
            { opacity: 1, transform: 'translateX(0px)' },
          ],
          { duration: T.switchIn, delay: i * step, easing: EASE_OUT, fill: 'backwards' },
        )
        .finished.catch(() => {});
    });
    page.focus({ preventScroll: true });
  }

  function switchTo(id) {
    if (busy || !current || id === current.id || !pages[id]) return false;
    const old = current;
    const def = pages[id];
    history.replaceState({ ...history.state, page: id }, '', `#${id}`);
    lastState = history.state;
    current = { id, def, page: pageEl(id) };
    if (old.page !== current.page) swapOut(old.page, old.def);
    swapIn(current.page, def);
    return true;
  }

  // ---- close: page -> home ---------------------------------------------------------------------------------------
  async function close({ fromHistory = false } = {}) {
    if (busy || !current) return false;
    if (!fromHistory && history.state?.page === current.id) {
      if (!history.state.deep) {
        // Step back to the home entry: one step, or more if hashes were typed in since (each added an entry).
        // popstate calls close() again with fromHistory = true; resolve once that has finished.
        const closed = new Promise((resolve) => hero.addEventListener('page:closed', () => resolve(true), { once: true }));
        history.go(-(history.state.depth ?? 1));
        return closed;
      }
      // Opened by a deep link: there is no home entry behind this one, so going "back" would leave
      // the site. Drop the hash in place instead and just play the close animation.
      history.replaceState(null, '', location.pathname + location.search);
      lastState = null;
    }
    busy = true;
    const { def, page } = current;
    hero.dispatchEvent(new CustomEvent('page:closing', { detail: { id: current.id } }));
    // a switch may still be in flight: hide any other page that's still fading out
    for (const other of hero.querySelectorAll('.page')) {
      if (other !== page && !other.hidden) {
        pageGen.set(other, (pageGen.get(other) ?? 0) + 1);
        other.hidden = true;
      }
    }

    // 1. the content leaves
    const { leaving, ready } = leaveContent(page, def);
    await ready;
    finishLeave(page, def, leaving);

    // 2. the home screen comes back: character + floor glow fade up, and every home label drifts in from whichever
    //    edge it's nearest to, staggered. (The render loop has been running again since `page:closing`, so what fades
    //    in is already a live frame. The nametag is left to its own CSS fade: animating it here would flash it.)
    const labels = RETURN_ORDER.map((rid) => (rid === 'interact' ? interactLabel : labelFor(rid)));
    for (const lbl of labels) {
      lbl.style.transform = '';
      lbl.style.opacity = '';
    }
    hero.dispatchEvent(new CustomEvent('page:returning', { detail: { id: current.id } }));
    nametag.style.visibility = '';
    nametag.style.removeProperty('opacity');
    await Promise.all([
      ...fadeLayer.map((el) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: T.homeIn, delay: 60, easing: EASE_IO, fill: 'both' })),
      ...labels.map((lbl, i) => {
        lbl.closest('.floater').style.visibility = '';
        const v = edgeExit(lbl); // (its transform is cleared above, so this reads its true home position)
        return play(
          lbl,
          [
            { opacity: 0, transform: move(v.x, v.y) },
            { opacity: 1, transform: 'translate(0px, 0px)' },
          ],
          { duration: T.homeIn, delay: i * T.edgeStagger, easing: EASE_OUT },
        );
      }),
    ]);
    [...fadeLayer, ...labels].forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
    });

    hero.classList.remove('is-page-open');
    const id = current.id;
    if (!document.activeElement || document.activeElement === document.body || page.contains(document.activeElement)) {
      labelFor(id)?.focus({ preventScroll: true });
    }
    current = null;
    busy = false;
    hero.dispatchEvent(new CustomEvent('page:closed', { detail: { id } }));
    return true;
  }

  // ---- wiring ------------------------------------------------------------------------
  hero.addEventListener('click', (event) => {
    const label = event.target.closest('.floater__label');
    if (!label?.dataset.page) return;
    event.preventDefault();
    if (!current) open(label.dataset.page);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current && !busy) goBack();
  });

  window.addEventListener('resize', () => {
    if (current) layout(current.page);
  });

  /**
   * Show page `id` (or home, for null) however we're currently placed: open it from home, switch to it, or close. For
   * history moves and hash edits, which can land anywhere. Mid-transition, it waits for that to finish, then goes.
   */
  let pendingRoute;
  function routeTo(id) {
    if (busy) {
      if (pendingRoute === undefined) {
        // (a moment after the event: the page that just opened starts rendering its content straight after it fires)
        const settle = () =>
          queueMicrotask(() => {
            const next = pendingRoute;
            pendingRoute = undefined;
            routeTo(next);
          });
        hero.addEventListener(current ? 'page:closed' : 'page:opened', settle, { once: true });
      }
      pendingRoute = id;
      return;
    }
    if (!id) {
      if (current) close({ fromHistory: true });
    } else if (!current) open(id, { fromHistory: true });
    else if (id !== current.id) switchTo(id);
  }

  window.addEventListener('popstate', () => {
    const prev = lastState;
    let id = history.state?.page ?? null;
    // No state: the hash was typed into the address bar (or followed from a plain #link), which added a new entry on
    // top of the one we were on. Adopt it, one step further from home than that one (see close()).
    if (!history.state) {
      const typed = location.hash.slice(1);
      if (pages[typed]) {
        id = typed;
        history.replaceState({ page: id, depth: (prev?.depth ?? 0) + 1, deep: prev?.deep }, '', `#${id}`);
      }
    }
    lastState = history.state;
    routeTo(id);
  });

  // Deep link: /#photos opens straight onto the page.
  const initial = location.hash.slice(1);
  if (pages[initial]) {
    history.replaceState({ page: initial, deep: true }, '', `#${initial}`);
    lastState = history.state;
    open(initial, { instant: true, fromHistory: true });
  }


  // ---- swiping through the pages (touch) -------------------------------------------------------------------------
  // On a touch screen, swipe up to go home -> about -> photos -> my things -> say hi, and down to go back. Inside a page
  // that scrolls (a tall column, the phone photo grid) it only moves on once you've reached that end and swipe again.
  // (With a mouse or trackpad, scrolling past the end of a page pulls the next one in through the edge menu instead:
  // src/ui/scroll-pull.js.)
  const SCROLL_ORDER = ['about', 'photos', 'my-things', 'say-hi'];

  function scrollStep(dir) {
    if (busy) return;
    const at = current ? SCROLL_ORDER.indexOf(current.id) : -1;
    const next = at + dir;
    if (next >= SCROLL_ORDER.length) return;
    if (next < 0) {
      if (current) close();
    } else if (!current) open(SCROLL_ORDER[next]);
    else switchTo(SCROLL_ORDER[next]);
  }

  /** The vertical scroller under `el` that has somewhere to go, with which of its ends you're at. */
  function scrollEdges(el) {
    for (let n = el; n && n !== hero; n = n.parentElement) {
      if (!n.matches?.('.page__col, .page__scroll, .trips__chapters') || getComputedStyle(n).overflowY !== 'auto') continue;
      const room = n.scrollHeight - n.clientHeight;
      if (room > 4) return { top: n.scrollTop <= 2, bottom: n.scrollTop >= room - 2 };
    }
    return { top: true, bottom: true };
  }

  let swipe = null;
  hero.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      swipe = event.touches.length === 1 && event.target instanceof Element ? { x: touch.clientX, y: touch.clientY, target: event.target, edges: scrollEdges(event.target) } : null;
    },
    { passive: true },
  );
  hero.addEventListener(
    'touchend',
    (event) => {
      const start = swipe;
      swipe = null;
      if (!start || event.touches.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dy) < 80 || Math.abs(dy) < Math.abs(dx) * 1.6) return;
      const dir = dy < 0 ? 1 : -1; // a swipe up scrolls down
      if (start.target.closest('.carousel:not([hidden]), .interact-menu, canvas:not(.hero__canvas)')) return;
      if (start.edges[dir > 0 ? 'bottom' : 'top']) scrollStep(dir);
    },
    { passive: true },
  );

  /** Go to page `id`, or home for null, from wherever we are (the edge menu's links). False if mid-transition. */
  function go(id, { instant = false } = {}) {
    if (busy) return false;
    if (!id && !current) return false;
    if (id && !pages[id]) return false;
    const started = !id ? close() : current ? switchTo(id) : open(id);
    return instant ? fastForward(id ?? null).then(() => started) : started;
  }

  /**
   * Skip every transition the router has in flight until it has fully settled on `id` (null = home). For when something
   * else is covering the change with its own animation (the scroll pull fades the whole hero out and back in around it):
   * each of the router's steps waits on its animations, so finishing them hurries it through every step in turn.
   */
  async function fastForward(id) {
    const stillGoing = (a) =>
      a.playState !== 'finished' &&
      !(a instanceof CSSAnimation) &&
      !(a instanceof CSSTransition) &&
      a.effect?.getTiming().iterations !== Infinity;
    let quiet = 0;
    for (let pass = 0; pass < 200 && quiet < 3; pass++) {
      const running = hero.getAnimations({ subtree: true }).filter(stillGoing);
      running.forEach((a) => a.finish());
      const settled = !busy && (current?.id ?? null) === id && !running.length;
      quiet = settled ? quiet + 1 : 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    open,
    close,
    go,
    get currentId() {
      return current?.id ?? null;
    },
    get isOpen() {
      return !!current || busy;
    },
    get isBusy() {
      return busy;
    },
  };
}
