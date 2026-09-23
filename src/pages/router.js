/**
 * Page transitions and the page menu. Plain DOM + Web Animations API, separate from the Three.js scene.
 *
 * Every page's header lives in the same spot, bottom-right (`aside-bottom` in pages.css). Hovering or focusing it
 * reveals the other pages — plus a teal "homepage" entry — stacked above it in a fixed order (see MENU_ORDER below),
 * indented in a zig-zag. It's built from the SAME label elements that float on the home screen: the router just tags
 * the other three with `.is-menu-item` (small, collapsed onto the header, invisible) the moment a page opens, so
 * they're primed to pop out on hover.
 *
 * Opening a page from home (click one of the floating labels):
 *   1. the clicked label freezes where it is and becomes the page header: it grows and travels to the bottom-right spot
 *   2. the character (+ nametag, floor glow) fades out; every other label — "interact" included — slides off through
 *      whichever screen edge it's nearest to, fading as it goes
 *   3. once off-screen, those same labels are silently repositioned onto the (invisible) page menu stack, ready for a hover
 *   4. the page's content blocks fade + slide in from the left, one after another
 * Going home again ("homepage" in the menu, Esc, or the browser's back button) reverses the
 * shape of that trip: the header — and, if the menu happened to be open, its whole stack — slides off the right edge,
 * then every home label (interact + the four pages) drifts back in from its nearest edge, staggered.
 *
 * Clicking another entry in the open menu swaps pages without ever going home: the picked label grows into the header,
 * the old header shrinks down into its new stack slot, and the rest of the stack rearranges around them. The menu stays
 * open the whole time, so several switches can happen back to back.
 *
 * A page is just { render(el), blocks(el), stagger?, header?, exit?, onShow?(el), onHide?(el), back?(el) } — see pages/index.js.
 * `exit` says how the content leaves: { targets(el) -> elements in order, stagger, duration, slide, easing }.
 * By default that's `blocks` in reverse, sliding left; Photos fades whatever is on screen, left to right, instead.
 * `onShow` runs as the page appears and `onHide` as it starts to leave (for pages that run something, like the photo drift).
 * `onHide` may return a promise: the router waits for it, along with the content leaving, before it moves on.
 * `back` gets the first press of Esc: a page with a sub-view (my things has one open object) returns true
 * once it has stepped out of it, and only when it returns nothing does the press close the page.
 * The router fires `page:opening | opened | closing | closed | returning` on the hero element so other
 * systems (e.g. the 3D scene) can pause / resume without the router knowing about them. Switching pages via the menu
 * fires none of these — the hero never stops being "a page is open" during a switch.
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
  header: 560, // the header label growing, on the way to a page
  contentOut: 300, // content leaving to the left
  exitSpan: 700, // however many things leave, the run of staggered starts is squeezed to fit inside this
  homeIn: 900, // the character + floor glow fading up, and each home label drifting back in, on the way home
  edgeStagger: 70, // gap between each home label drifting in
  menuOpen: 420, // a stack item popping out of the header
  menuOpenStagger: 45,
  menuClose: 300, // a stack item folding back into the header
  menuCloseStagger: 30,
  menuCloseGrace: 260, // how long the pointer can be away before the menu actually closes
  swap: 460, // switching pages: picked item -> header, old header -> its new stack slot
  swapDelay: 20, // ...the old header waits this long before it starts (the picked item leads)
  swapRipple: 380, // switching pages: everyone else in the stack re-settling into their new slot
  swapRippleBase: 30,
  swapRippleStagger: 20,
  switchOut: 180, // switching pages: the old page's content fading out...
  switchIn: 380, // ...while the new page's fades + slides in, at the same time
  switchSpan: 240, // however many blocks come in, their staggered starts fit inside this
  slideOff: 420, // the header (+ open stack) sliding off the right edge, on the way home
  slideOffStagger: 40,
};
const SLIDE_PX = 40; // how far content travels while sliding in from the left

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = window.matchMedia('(hover: hover)').matches;

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
// somewhere off-screen might as well just fade in place). Never used for a stack slot: those positions are the point.
const move = (x, y) => (reducedMotion ? 'none' : `translate(${x}px, ${y}px)`);
const moveTo = (x, y) => `translate(${x}px, ${y}px)`;
// The element's live painted transform (a matrix, valid mid-animation), not the last value `play()` committed — used
// as a "from" keyframe so a stack item that's interrupted mid-animation is picked up from where it visually is, not
// from a stale inline style.
const paintedTransform = (el) => getComputedStyle(el).transform;

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

/** How far right a label has to travel to clear the screen from wherever it currently is. */
function rightExit(el) {
  const r = el.getBoundingClientRect();
  return { x: window.innerWidth - r.left + 60, y: 0 };
}

// The page menu's fixed order, topmost first, ending at the header. "__home__" is the "go home" entry, not a real page.
const MENU_ORDER = ['__home__', 'say-hi', 'photos', 'my-things', 'about'];
// The order home labels drift back in, on the way home.
const RETURN_ORDER = ['interact', 'about', 'say-hi', 'photos', 'my-things'];

export function createPageRouter({ hero, pages }) {
  const floaters = [...hero.querySelectorAll('.floater')];
  const interactFloater = hero.querySelector('#interact-toggle').closest('.floater');
  const characterLayer = ['.hero__canvas', '.nametag', '.hero__floor'].map((s) => hero.querySelector(s)).filter(Boolean);
  // The nametag positions itself every frame (an inline transform) and already fades through its own CSS transition,
  // so on the way back it's handled separately from the rest.
  const nametag = hero.querySelector('.nametag');
  const fadeLayer = characterLayer.filter((el) => el !== nametag);

  const pageEl = (id) => hero.querySelector(`.page[data-page="${id}"]`);
  const labelFor = (id) => hero.querySelector(`.floater__label[data-page="${id}"]`);

  // ---- the "homepage" menu entry: not a real page, just a teal button that lives in the stack -----------------------
  const homeFloater = document.createElement('div');
  homeFloater.className = 'floater is-menu-item';
  homeFloater.style.visibility = 'hidden';
  const homeLabel = document.createElement('button');
  homeLabel.type = 'button';
  homeLabel.className = 'floater__label floater__label--accent';
  homeLabel.dataset.home = '';
  homeLabel.style.animation = 'none'; // it never sits at a natural floating spot, so it never needs the bob
  homeLabel.textContent = 'homepage';
  homeFloater.append(homeLabel);
  hero.querySelector('.floaters').append(homeFloater);

  const stackLabel = (id) => (id === '__home__' ? homeLabel : labelFor(id));
  const stackFloater = (id) => stackLabel(id).closest('.floater');

  /** The stack for page `curId`, in fixed order, each with its k (0 = right next to the header, counting up). */
  function stackEntries(curId) {
    const ids = MENU_ORDER.filter((id) => id !== curId);
    const n = ids.length;
    return ids.map((id, j) => ({ id, k: n - 1 - j }));
  }

  // Proportions from the Page Menu Board (a 40px header: items 54px above it, 46px apart, every other one 44px in).
  const STACK = { step: 0, indent: 0, gap: 0 }; // px, recomputed from the header's current size
  function measureStack(label) {
    const size = parseFloat(getComputedStyle(label).fontSize);
    STACK.step = size * 1.15;
    STACK.indent = size * 1.1;
    STACK.gap = size * 1.35;
  }
  const slotOffset = (k) => ({ x: k % 2 ? STACK.indent : 0, y: -(STACK.gap + k * STACK.step) });
  const CLOSED_OFFSET = { x: 0, y: 4 }; // where a stack item sits, invisible, folded onto the header

  let current = null; // { id, def, page, floater, label }
  let busy = false;
  let menuOpen = false;
  let closeTimer = null;
  // The history entry we're on, as we last wrote or saw it. (A hash typed into the address bar lands on a fresh entry
  // with no state; this is what it was typed on top of.) State: { page, depth: entries since home, deep: no home behind }.
  let lastState = history.state;

  /**
   * Size the page's content column: the full width between the margins. On narrow screens it also stops above the header
   * (bottom-right), so nothing scrolls underneath it; wider layouts place their column beside the header in pages.css.
   */
  function layout(page, floater) {
    const vw = hero.clientWidth;
    const pad = Math.min(140, Math.max(20, vw * 0.07));
    const headerTop = floater.getBoundingClientRect().top - hero.getBoundingClientRect().top;
    page.style.setProperty('--col-left', `${pad}px`);
    page.style.setProperty('--col-width', `${Math.max(160, vw - 2 * pad)}px`);
    page.style.setProperty('--col-bottom', `${Math.max(0, hero.clientHeight - headerTop + 12)}px`);
  }

  // ---- header label ----------------------------------------------------------------
  /** Pin the label exactly where it currently is (mid-bob included) and make it plain text. */
  function freeze(label) {
    const at = getComputedStyle(label).transform;
    label.style.animation = 'none';
    label.style.transform = at === 'none' ? '' : at;
    label.classList.add('is-header');
    label.setAttribute('aria-current', 'page');
  }

  /**
   * The header "pose" is a class on the label's floater (pages.css): bigger text at the bottom-right spot. It's applied
   * instantly so it can be measured; the label then slides + scales between the two poses.
   */
  function poseHeader(floater, def, on) {
    floater.classList.toggle('is-page-header', on);
    if (on && def.header) floater.dataset.pose = def.header;
    else delete floater.dataset.pose;
  }

  /**
   * Where the label's text starts and how big it looks right now — mid-animation included: the scale it's painted at
   * comes from its live transform, so a label caught halfway through growing is picked up at the size it appears.
   */
  function snapshot(label) {
    const style = getComputedStyle(label);
    const { left, top } = label.getBoundingClientRect();
    const m = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
    const s = m ? Math.hypot(m.a, m.b) : 1;
    const ox = parseFloat(style.paddingLeft);
    const oy = parseFloat(style.paddingTop);
    return { x: left + ox * s, y: top + oy * s, font: parseFloat(style.fontSize) * s, origin: `${ox}px ${oy}px` };
  }

  /** The transform that makes a label laid out at `a` look like it's at `b` (it scales about the top-left of its text). */
  const between = (a, b) => `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.font / a.font})`;

  /** Esc: close the menu first if it's open, then a page's own sub-view (if any), then the page itself. */
  function goBack() {
    if (busy || !current) return;
    if (menuOpen) return closeMenu();
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
  async function enterContent(page, def, floater) {
    if (!page.dataset.rendered) {
      def.render(page);
      page.dataset.rendered = 'true';
    }
    layout(page, floater);
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

  // ---- the page menu: hover / focus the header ----------------------------------------------------------------------
  function withinStackBounds(x, y) {
    if (!current) return false;
    const pad = 44;
    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    for (const { id } of [{ id: current.id }, ...stackEntries(current.id)]) {
      const el = id === current.id ? current.floater : stackFloater(id);
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      l = Math.min(l, rect.left - pad);
      r = Math.max(r, rect.right + pad);
      t = Math.min(t, rect.top - pad);
      b = Math.max(b, rect.bottom + pad);
    }
    return x >= l && x <= r && y >= t && y <= b;
  }

  function scheduleCloseMenu() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!busy) closeMenu();
    }, T.menuCloseGrace);
  }

  function openMenu() {
    if (!current || menuOpen || busy) return;
    menuOpen = true;
    clearTimeout(closeTimer);
    hero.classList.add('is-menu-open');
    measureStack(current.label);
    for (const { id, k } of stackEntries(current.id)) {
      const label = stackLabel(id);
      stackFloater(id).style.visibility = '';
      const off = slotOffset(k);
      const from = paintedTransform(label);
      stopAnimations(label);
      play(
        label,
        [
          { transform: from, opacity: 0 },
          { transform: moveTo(off.x, off.y), opacity: 1 },
        ],
        { duration: T.menuOpen, delay: k * T.menuOpenStagger, easing: EASE_OUT, fill: 'both' },
      );
    }
  }

  function closeMenu() {
    if (!current || !menuOpen) return;
    menuOpen = false;
    clearTimeout(closeTimer);
    hero.classList.remove('is-menu-open');
    const entries = stackEntries(current.id);
    const n = entries.length;
    for (const { id, k } of entries) {
      const label = stackLabel(id);
      const closed = moveTo(CLOSED_OFFSET.x, CLOSED_OFFSET.y);
      const from = paintedTransform(label);
      const opacity = getComputedStyle(label).opacity;
      stopAnimations(label);
      play(
        label,
        [
          { transform: from, opacity },
          { transform: closed, opacity: 0 },
        ],
        { duration: T.menuClose, delay: (n - 1 - k) * T.menuCloseStagger, easing: EASE_OUT, fill: 'both' },
      ).then(() => {
        if (!menuOpen) stackFloater(id).style.visibility = 'hidden'; // (unless it has opened again meanwhile)
      });
    }
  }

  // ---- open: home -> page ------------------------------------------------------------------------------------------
  async function open(id, { instant = false, fromHistory = false } = {}) {
    const def = pages[id];
    const label = labelFor(id);
    if (busy || current || !def || !label) return false;
    busy = true;
    releaseHeld(); // (nothing should be left over, but a stray held fade must never survive into a new page)
    const k = instant ? 0 : 1;
    const floater = label.closest('.floater');
    const others = floaters.filter((f) => f !== floater); // every other home label's floater, "interact" included
    // The transform goes on the LABEL, never the floater — the floater's own transform is left alone so the page menu
    // (which transforms labels too) never has a stale offset to compose with later.
    const vectors = others.map((f) => [f.querySelector('.floater__label'), edgeExit(f.querySelector('.floater__label'))]); // measured before anything moves

    hero.dispatchEvent(new CustomEvent('page:opening', { detail: { id } }));
    hero.classList.add('is-page-open');
    hero.querySelector('#interact-toggle')?.setAttribute('aria-expanded', 'false');
    hero.querySelector('#interact-menu')?.setAttribute('hidden', '');
    if (!fromHistory) {
      history.pushState({ page: id, depth: 1 }, '', `#${id}`);
      lastState = history.state;
    }

    freeze(label);
    const from = snapshot(label); // where the label is now: small, mid-bob
    label.style.transform = '';
    poseHeader(floater, def, true); // ...and where it ends up: bigger, bottom-right
    const to = snapshot(label);
    label.style.transformOrigin = to.origin;

    // 2: character fade, every other label sliding off its nearest edge, the header taking its place — all at once
    await Promise.all([
      play(label, [{ transform: between(to, from) }, { transform: 'none' }], {
        duration: reducedMotion ? 0 : T.header * k,
        easing: EASE_OUT,
      }),
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
    label.style.transform = '';
    label.style.transformOrigin = '';
    // Hide what's clickable or readable so it can't be tabbed to. The canvas and the floor glow are left "visible" at
    // opacity 0: hiding a WebGL canvas lets some browsers throw its drawing buffer away, and it comes back blank.
    [nametag, ...others].forEach((el) => el && (el.style.visibility = 'hidden'));

    // 3: the other three pages + "homepage" quietly become the (still invisible) page menu, folded onto the header
    for (const { id: sid } of stackEntries(id)) {
      const sLabel = stackLabel(sid);
      const sFloater = stackFloater(sid);
      sLabel.style.animation = 'none';
      sFloater.classList.add('is-menu-item');
      sFloater.style.visibility = 'hidden';
      sLabel.style.transform = moveTo(CLOSED_OFFSET.x, CLOSED_OFFSET.y);
      sLabel.style.opacity = '';
    }
    measureStack(label);

    // The header has landed: the page is open from here on, so the menu works (and a switch or Esc can take over) while
    // the content is still coming in.
    const page = pageEl(id);
    current = { id, def, page, floater, label };
    busy = false;
    hero.dispatchEvent(new CustomEvent('page:opened', { detail: { id } }));

    // 4: content in
    enterContent(page, def, floater).then(() => {
      if (current?.page === page && !isMenuMember(document.activeElement)) page.focus({ preventScroll: true });
    });
    return true;
  }

  // ---- switchTo: page -> page, via the open menu --------------------------------------------------------------------
  // A switch never blocks: `current` becomes the new page straight away, every label is picked up from wherever it is
  // (even halfway through the last switch), and the two pages' content crossfades at the same time. So you can click
  // down the menu as fast as you like; each click just redirects everything already in motion.
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
  function swapIn(page, def, floater) {
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
    layout(page, floater);
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
    // (not while focus is in the menu: moving it out would fold the menu away mid-browse)
    if (!isMenuMember(document.activeElement)) page.focus({ preventScroll: true });
  }

  function switchTo(id) {
    if (busy || !current || id === current.id || !pages[id]) return false;
    clearTimeout(closeTimer);
    const old = current;
    const def = pages[id];
    const label = stackLabel(id);
    const floater = stackFloater(id);
    history.replaceState({ ...history.state, page: id }, '', `#${id}`);
    lastState = history.state;

    // where everything is painted right now (mid-flight included), before anything changes
    const newLayout = stackEntries(id); // the stack once `id` is current (includes old.id, not `id`)
    const ripple = newLayout.filter((e) => e.id !== old.id);
    const pickedFrom = snapshot(label);
    const oldFrom = snapshot(old.label);
    const rippleFrom = ripple.map(({ id: rid }) => paintedTransform(stackLabel(rid)));
    for (const el of [label, old.label, ...ripple.map(({ id: rid }) => stackLabel(rid))]) stopAnimations(el);

    // the new poses: the picked label becomes the header, the old header a stack item
    label.style.transform = '';
    label.style.opacity = '';
    stackFloater(id).style.visibility = '';
    floater.classList.remove('is-menu-item');
    poseHeader(floater, def, true);
    label.classList.add('is-header');
    label.setAttribute('aria-current', 'page');
    const pickedTo = snapshot(label);
    label.style.transformOrigin = pickedTo.origin;

    old.label.style.transform = '';
    poseHeader(old.floater, old.def, false);
    old.floater.classList.add('is-menu-item');
    old.label.classList.remove('is-header');
    old.label.removeAttribute('aria-current');
    const oldTo = snapshot(old.label);
    old.label.style.transformOrigin = oldTo.origin;
    const oldSlot = slotOffset(newLayout.find((e) => e.id === old.id)?.k ?? 0);

    current = { id, def, page: pageEl(id), floater, label };
    measureStack(label);

    // 1. labels: the picked one grows into the header, the old header shrinks into its slot, the rest ripple
    if (menuOpen) {
      play(label, [{ transform: between(pickedTo, pickedFrom) }, { transform: 'none' }], { duration: T.swap, easing: EASE_IO });
      play(old.label, [{ transform: between(oldTo, oldFrom) }, { transform: moveTo(oldSlot.x, oldSlot.y) }], {
        duration: T.swap,
        delay: T.swapDelay,
        easing: EASE_IO,
      });
      ripple.forEach(({ id: rid, k }, i) => {
        const off = slotOffset(k);
        play(stackLabel(rid), [{ transform: rippleFrom[i] }, { transform: moveTo(off.x, off.y) }], {
          duration: T.swapRipple,
          delay: T.swapRippleBase + k * T.swapRippleStagger,
          easing: EASE_OUT,
        });
      });
    } else {
      // (a switch with the menu shut: the browser's back / forward, or a hash typed in) the new header rises out of
      // the old one, which folds away into the closed stack; everyone else is already folded there, out of sight
      const closed = moveTo(CLOSED_OFFSET.x, CLOSED_OFFSET.y);
      play(label, [{ transform: between(pickedTo, pickedFrom), opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: T.swap,
        easing: EASE_IO,
      });
      play(old.label, [{ transform: between(oldTo, oldFrom), opacity: 1 }, { transform: closed, opacity: 0 }], {
        duration: T.swap * 0.6,
        easing: EASE_IO,
      }).then(() => {
        if (!menuOpen && current?.id !== old.id) old.floater.style.visibility = 'hidden';
      });
      for (const { id: rid } of ripple) stackLabel(rid).style.transform = closed;
    }

    // 2. content: out and in at the same time
    if (old.page !== current.page) swapOut(old.page, old.def);
    swapIn(current.page, def, floater);
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
    clearTimeout(closeTimer);
    const wasMenuOpen = menuOpen;
    menuOpen = false;
    hero.classList.remove('is-menu-open');
    const { def, page, floater, label } = current;
    hero.dispatchEvent(new CustomEvent('page:closing', { detail: { id: current.id } }));
    // a switch may still be in flight: hide any other page that's still fading out, and take the labels from where they are
    for (const other of hero.querySelectorAll('.page')) {
      if (other !== page && !other.hidden) {
        pageGen.set(other, (pageGen.get(other) ?? 0) + 1);
        other.hidden = true;
      }
    }

    // 1. everything near the header slides off the right edge: the header, and — if the menu was open — its whole
    //    stack, cascading top-of-stack first, header last. The content leaves at the same time.
    const stackIds = wasMenuOpen ? stackEntries(current.id) : [];
    const slideTargets = [{ label, k: -1 }, ...stackIds.map(({ id, k }) => ({ label: stackLabel(id), k }))];
    const n = slideTargets.length;
    const { leaving, ready } = leaveContent(page, def);
    await Promise.all([
      ...slideTargets.map(({ label: lbl, k }) => {
        const v = rightExit(lbl);
        const delay = (n - 1 - (k + 1)) * T.slideOffStagger;
        const from = paintedTransform(lbl);
        stopAnimations(lbl);
        return play(
          lbl,
          [
            { opacity: 1, transform: from },
            { opacity: 0, transform: move(v.x, v.y) },
          ],
          { duration: T.slideOff, delay, easing: EASE_IN, hold: true },
        );
      }),
      ready,
    ]);
    finishLeave(page, def, leaving);

    // 2. tidy up: every label that was part of the page menu goes back to being a plain, invisible home label —
    //    imperceptible, since none of it is on screen right now
    for (const pid of ['about', 'say-hi', 'photos', 'my-things']) {
      const pLabel = labelFor(pid);
      const pFloater = pLabel.closest('.floater');
      pFloater.classList.remove('is-menu-item', 'is-page-header');
      delete pFloater.dataset.pose;
      pFloater.style.visibility = 'hidden';
      pLabel.style.transform = '';
      pLabel.style.transformOrigin = '';
      pLabel.style.animation = '';
      pLabel.style.opacity = '';
    }
    label.classList.remove('is-header');
    label.removeAttribute('aria-current');
    homeFloater.style.visibility = 'hidden';
    homeLabel.style.transform = '';
    homeLabel.style.opacity = '';
    interactFloater.style.visibility = 'hidden';
    const interactLabel = interactFloater.querySelector('.floater__label');
    interactLabel.style.transform = '';
    interactLabel.style.opacity = '';
    nametag.style.visibility = 'hidden';

    // 3. the home screen comes back: character + floor glow fade up, and every home label drifts in from whichever
    //    edge it's nearest to, staggered. (The render loop has been running again since `page:closing`, so what fades
    //    in is already a live frame. The nametag is left to its own CSS fade: animating it here would flash it.)
    hero.dispatchEvent(new CustomEvent('page:returning', { detail: { id: current.id } }));
    nametag.style.visibility = '';
    nametag.style.removeProperty('opacity');
    await Promise.all([
      ...fadeLayer.map((el) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: T.homeIn, delay: 60, easing: EASE_IO, fill: 'both' })),
      ...RETURN_ORDER.map((id, i) => {
        const lbl = id === 'interact' ? interactLabel : labelFor(id);
        lbl.closest('.floater').style.visibility = '';
        const v = edgeExit(lbl); // (its transform is already cleared above, so this reads its true home position)
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
    [...fadeLayer, interactLabel, ...['about', 'say-hi', 'photos', 'my-things'].map(labelFor)].forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
    });

    hero.classList.remove('is-page-open');
    label.focus({ preventScroll: true });
    const id = current.id;
    current = null;
    busy = false;
    hero.dispatchEvent(new CustomEvent('page:closed', { detail: { id } }));
    return true;
  }

  // ---- wiring ------------------------------------------------------------------------
  hero.addEventListener('click', (event) => {
    const label = event.target.closest('.floater__label');
    if (!label) return;
    event.preventDefault();

    if (label === homeLabel) {
      if (current) close();
      return;
    }
    if (label.classList.contains('is-header')) {
      // on a device with no hover, tapping the header is the only way to reach the menu
      if (!canHover && current) (menuOpen ? closeMenu() : openMenu());
      return;
    }
    if (!label.dataset.page) return;
    if (current && menuOpen && label.dataset.page !== current.id) switchTo(label.dataset.page);
    else if (!current) open(label.dataset.page);
  });

  // hovering the header (or moving within the stack's bounds) opens / keeps open the page menu
  hero.addEventListener('pointermove', (event) => {
    if (!current) return;
    if (!menuOpen) {
      if (canHover && event.target.closest('.floater') === current.floater) openMenu();
      return;
    }
    if (withinStackBounds(event.clientX, event.clientY)) clearTimeout(closeTimer);
    else scheduleCloseMenu();
  });
  hero.addEventListener('pointerleave', () => {
    if (menuOpen) scheduleCloseMenu();
  });

  // keyboard: focusing the header or a stack item opens the menu; focusing away from it closes it
  const isMenuMember = (el) => {
    if (!current || !el?.closest) return false; // event.target is only ever an Element for a real pointer/focus event
    const floater = el.closest('.floater');
    return floater === current.floater || !!floater?.classList.contains('is-menu-item');
  };
  hero.addEventListener('focusin', (event) => {
    if (!current || busy || !isMenuMember(event.target)) return;
    clearTimeout(closeTimer);
    if (!menuOpen) openMenu();
  });
  hero.addEventListener('focusout', () => {
    if (!current || !menuOpen) return;
    requestAnimationFrame(() => {
      if (!isMenuMember(document.activeElement)) scheduleCloseMenu();
    });
  });

  // touch: tapping outside the header/stack closes the menu (there's no "pointer leaves" to catch it)
  document.addEventListener('pointerdown', (event) => {
    if (menuOpen && !isMenuMember(event.target)) closeMenu();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current && !busy) goBack();
  });

  // ↑ / ↓ (and Home / End) walk the menu in the order it's drawn, top of the stack down to the header. (Tab still goes
  // in page order, which doesn't match the zig-zag.) From the header, ↑ opens the menu if it isn't already.
  hero.addEventListener('keydown', (event) => {
    if (!current || busy || !isMenuMember(event.target)) return;
    const keys = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity };
    if (!(event.key in keys) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (!menuOpen) openMenu();
    const order = [...stackEntries(current.id).map(({ id }) => stackLabel(id)), current.label];
    const at = order.indexOf(event.target.closest('.floater__label'));
    const to = Math.min(Math.max((at < 0 ? order.length - 1 : at) + keys[event.key], 0), order.length - 1);
    order[to].focus({ preventScroll: true });
  });

  window.addEventListener('resize', () => {
    if (!current) return;
    layout(current.page, current.floater);
    if (menuOpen) {
      measureStack(current.label);
      for (const { id, k } of stackEntries(current.id)) {
        const off = slotOffset(k);
        stackLabel(id).style.transform = moveTo(off.x, off.y);
      }
    }
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

  return {
    open,
    close,
    get isOpen() {
      return !!current || busy;
    },
  };
}
