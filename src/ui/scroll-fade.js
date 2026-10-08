/**
 * Soft fades at the top / bottom of anything that scrolls vertically (a page's column, the phone photo grid), shown only
 * on the side that has more to scroll to (the `.has-above` / `.has-below` rules in pages.css).
 */
const SCROLLERS = '.page__col, .gallery';

function update(el) {
  const room = el.scrollHeight - el.clientHeight;
  el.classList.toggle('has-above', room > 4 && el.scrollTop > 4);
  el.classList.toggle('has-below', room > 4 && el.scrollTop < room - 4);
}

export function createScrollFade(root) {
  const refresh = () => root.querySelectorAll(SCROLLERS).forEach(update);
  document.addEventListener('scroll', (event) => event.target.matches?.(SCROLLERS) && update(event.target), { capture: true, passive: true });
  // a page's content settles a moment after it opens (photos size themselves, the router lays the column out)
  root.addEventListener('page:opened', () => [0, 300, 900].forEach((ms) => setTimeout(refresh, ms)));
  window.addEventListener('resize', refresh);
  new ResizeObserver(refresh).observe(root);
  requestAnimationFrame(refresh);
}
