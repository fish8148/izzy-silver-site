import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import './styles/base.css';
import './styles/hero.css';
import './styles/floaters.css';
import './styles/party.css';
import './styles/pages.css';

import { createInteractMenu } from './ui/interact-menu.js';
import { createPageRouter, pages } from './pages/index.js';
import { createNametag } from './ui/nametag.js';
import { createSway } from './ui/sway.js';

// UI that doesn't need WebGL is set up immediately, so the labels work from first paint.
const nametag = createNametag(document.getElementById('nametag'));
const menu = createInteractMenu({
  toggle: document.getElementById('interact-toggle'),
  panel: document.getElementById('interact-menu'),
});

// Clicking a floating label opens its page (see src/pages/router.js).
const hero = document.getElementById('top');
const router = createPageRouter({ hero, pages });
hero.addEventListener('page:returning', () => nametag.wake()); // the name floats back in with the home screen
createSway(hero); // on a phone, the labels sway with its movement
if (import.meta.env.DEV) window.__router = router;

// The 3D scene (and three.js with it) loads after first paint, so the page shell appears instantly.
import('./scene/index.js')
  .then(({ startScene }) => startScene({ nametag, menu }))
  .catch((error) => {
    console.error(error);
    document.getElementById('loader')?.classList.add('is-done');
  })
  .then(() => {
    // With the hero up and the browser idle, let pages fetch what they'll need (the say hi head scan), unless the visitor
    // asked their browser to save data.
    if (navigator.connection?.saveData) return;
    const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 1500));
    idle(() => Object.values(pages).forEach((page) => page.preload?.()));
  });
