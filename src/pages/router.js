/**
 * Which page is showing. There is no home screen: the site opens on the first page in pages/order.js (about me), or on
 * the one in the address (#photos), and you move between pages by scrolling or swiping past a page's end
 * (src/ui/scroll-pull.js), with links inside the pages (about me's "say hi →"), or with the browser's back / forward.
 *
 * Switching is instant: the old page is hidden and the new one shown, with no transition (the scroll pull's bar is the
 * only hint that a change is coming). The very first page fades its blocks in once, as the site loads.
 *
 * A page is just { render(el), blocks(el), stagger?, onShow?(el), onHide?(el), back?(el) } — see pages/index.js.
 * `onShow` runs as the page appears and `onHide` as it goes (for pages that run something, like the photo drift or the
 * character). `back` gets Esc: a page with a sub-view (my things has one open object) steps out of it.
 */

import { PAGE_ORDER } from './order.js';

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const T = { enter: 650, stagger: 200 }; // the first page's blocks fading + sliding in (ms)
const SLIDE_PX = 40;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createPageRouter({ hero, pages }) {
  const pageEl = (id) => hero.querySelector(`.page[data-page="${id}"]`);
  const first = PAGE_ORDER.find(({ id }) => pages[id])?.id;
  let current = null; // { id, def, page }

  function show(id, { entrance = false } = {}) {
    const def = pages[id];
    const page = pageEl(id);
    if (!page.dataset.rendered) {
      def.render(page);
      page.dataset.rendered = 'true';
    }
    page.hidden = false;
    current = { id, def, page };
    def.onShow?.(page);
    page.focus({ preventScroll: true });
    hero.dispatchEvent(new CustomEvent('page:shown', { detail: { id } }));
    if (!entrance || reducedMotion) return;
    const step = def.stagger ?? T.stagger;
    def.blocks(page).forEach((block, i) =>
      block
        .animate(
          [
            { opacity: 0, transform: `translateX(${-SLIDE_PX}px)` },
            { opacity: 1, transform: 'translateX(0px)' },
          ],
          { duration: T.enter, delay: i * step, easing: EASE_OUT, fill: 'backwards' },
        )
        .finished.catch(() => {}),
    );
  }

  function hide() {
    if (!current) return;
    const { def, page } = current;
    // (the first page's entrance may still be playing)
    for (const a of page.getAnimations({ subtree: true })) if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.finish();
    def.onHide?.(page);
    page.hidden = true;
    current = null;
  }

  /** Show page `id` straight away. `history`: 'push' (default) adds an entry, 'replace' rewrites this one, 'none' leaves it. */
  function go(id, { history: mode = 'push' } = {}) {
    if (!pages[id] || id === current?.id) return false;
    hide();
    if (mode === 'push') history.pushState({ page: id }, '', `#${id}`);
    else if (mode === 'replace') history.replaceState({ page: id }, '', `#${id}`);
    show(id);
    return true;
  }

  window.addEventListener('popstate', () => {
    const id = history.state?.page ?? location.hash.slice(1);
    go(pages[id] ? id : first, { history: pages[id] ? 'none' : 'replace' });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // in a form field (say hi), Esc just leaves the field
    if (event.target instanceof Element && event.target.matches('input, textarea')) return void event.target.blur();
    current?.def.back?.(current.page);
  });

  // Links to a page (#say-hi) inside the pages switch to it here, rather than as a plain hash change.
  hero.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    const id = link?.getAttribute('href').slice(1);
    if (!pages[id] || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    go(id);
  });

  // Open on the page in the address, or the first one.
  const initial = pages[location.hash.slice(1)] ? location.hash.slice(1) : first;
  history.replaceState({ page: initial }, '', initial === first && !location.hash ? location.pathname + location.search : `#${initial}`);
  show(initial, { entrance: true });

  return {
    go,
    get currentId() {
      return current?.id ?? null;
    },
  };
}
