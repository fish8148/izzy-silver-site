// The 3D part (and three.js) is only fetched when it's wanted: a page's `preload` runs while the browser is idle, and its
// first open waits for whatever is left.
const loadModule = () => import('../features/panel-character.js');

/**
 * Fetch the character's code, and on a laptop the model too. (A phone just fetches the code: reading the model ahead of
 * time would hold its memory for a page that may never be opened.)
 */
export function preloadPageCharacter() {
  const phone = window.matchMedia('(pointer: coarse)').matches;
  loadModule()
    .then(({ preloadCharacter }) => phone || preloadCharacter())
    .catch(() => {}); // (it is tried again, and reported, when the page is actually shown)
}

/**
 * The character on a page (features/panel-character.js): created the first time the page is shown, then each time it
 * shows he arrives anew, and he stops while it's hidden. If he can't load, `note` says so, and the next show tries again.
 */
export function pageCharacter({ canvas, column, note, failText, framing }) {
  let model = null;
  let wanted = false;
  return {
    show() {
      wanted = true;
      model ??= loadModule().then(({ createPanelCharacter }) => createPanelCharacter({ canvas, column, framing }));
      model
        .then((character) => {
          if (import.meta.env.DEV) (window.__characters ??= {})[canvas.className] = character;
          if (!wanted) return; // hidden again before he had loaded
          note.hidden = true;
          character.reset();
          character.start();
        })
        .catch((error) => {
          console.error('Failed to start the character', error);
          model = null; // try again next time
          note.textContent = failText;
          note.hidden = false;
        });
    },
    hide() {
      wanted = false;
      model?.then((character) => character.stop()).catch(() => {});
    },
  };
}
