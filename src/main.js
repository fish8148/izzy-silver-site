import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-400-italic.css'; // ("say hi" in the scroll pull's bar)
import './styles/base.css';
import './styles/hero.css';
import './styles/pages.css';
import './styles/pull.css';

import { createPageRouter, pages } from './pages/index.js';
import { createScrollPull } from './ui/scroll-pull.js';

// The site opens straight onto the first page (about me), or the one in the address (see src/pages/router.js).
const hero = document.getElementById('top');
const router = createPageRouter({ hero, pages });
createScrollPull({ router, hero }); // scroll past the end of a page to go to the next one
if (import.meta.env.DEV) window.__router = router;

// With the browser idle, let pages fetch what they'll need (the character for say hi), unless the visitor asked their
// browser to save data.
if (!navigator.connection?.saveData) {
  const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 1500));
  idle(() => Object.values(pages).forEach((page) => page.preload?.()));
}
