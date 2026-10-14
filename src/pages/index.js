import { aboutPage } from './about.js';
import { photosPage } from './photos.js';
import { sayHiPage } from './say-hi.js';
// import { thingsPage } from './things.js';

export { createPageRouter } from './router.js';

/**
 * One entry per page section in index.html (keys match each section's data-page).
 * To build a new page later: write { render(page), blocks(page), stagger? } and add it here and to pages/order.js —
 * the scrolling between pages and history handling come for free. A page can also have a `preload()`, which main.js
 * calls once the browser is idle (about me and say hi use it to fetch the character ahead of time).
 *
 * My things is switched off for now. To bring it back: uncomment it here, in pages/order.js, and in index.html (its section).
 */
export const pages = {
  about: aboutPage,
  photos: photosPage,
  'say-hi': sayHiPage,
  // 'my-things': thingsPage,
};
