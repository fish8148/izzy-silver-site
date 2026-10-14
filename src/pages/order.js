/**
 * The pages, in order, as the edge menu lists them and as scrolling (or swiping) steps through them, after the homepage.
 * The one place to add, remove or reorder a page (it also needs its floating label in index.html and its entry in
 * pages/index.js). `html` is how the scroll pull's row writes the name, when that differs from `name`.
 */
export const PAGE_ORDER = [
  { id: 'about', name: 'about me' },
  { id: 'photos', name: 'photos' },
  // { id: 'my-things', name: 'my things' }, // (switched off for now: see pages/index.js)
  { id: 'say-hi', name: 'say hi', html: 'say <em>hi</em>' },
];
