import { aboutPage } from './about.js';
import { photosPage } from './photos.js';
import { sayHiPage } from './say-hi.js';
// import { thingsPage } from './things.js';

export { createPageRouter } from './router.js';

/**
 * One entry per floating label (keys match each label's data-page).
 * To build a new page later: write { render(page), blocks(page), stagger? } and swap it in here —
 * the transition, page menu and history handling come for free (add its id to MENU_ORDER in router.js too). A page can also have a `preload()`, which main.js
 * calls once the hero is up and the browser is idle (say hi uses it to fetch the head scan ahead of time).
 *
 * My things is switched off for now. To bring it back: uncomment it here, in pages/order.js, and in index.html (its label
 * and section).
 */
export const pages = {
  about: aboutPage,
  photos: photosPage,
  'say-hi': sayHiPage,
  // 'my-things': thingsPage,
};
