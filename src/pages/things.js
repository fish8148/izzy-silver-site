import { things } from '../data/things.js';
import { tilt } from '../ui/tilt.js';

// The 3D part (and three.js) is only fetched when it's wanted: `preload` runs while the browser is idle after the hero is up.
const loadThings = () => import('../features/floating-things.js');

const views = new WeakMap(); // page element -> { canvas, note, info, title, desc, motion, lift, api, wanted }

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/**
 * My things: objects floating around like they're loose in a space station (features/floating-things.js). Drag one to send it
 * drifting off, click one to bring it forward with its text beside it. Esc closes an open object first, and only then the
 * page.
 */
export const thingsPage = {
  header: 'aside-bottom', // every page's header lives bottom-right, pinned in place (see pages.css)

  preload() {
    loadThings().catch(() => {});
  },

  render(page) {
    page.classList.add('page--things');

    const stage = make('div', 'things-stage');
    const canvas = make('canvas', 'things-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      `Floating 3D objects: ${things.map((t) => t.title).join(', ')}. Drag them around or click one to read about it.`,
    );
    const note = make('p', 'things-note');
    note.hidden = true;
    stage.append(canvas, note);

    // What an open object says. Not a router block: it fades with its own CSS transition (pages.css) as objects are opened.
    const info = make('div', 'things-info');
    info.setAttribute('aria-live', 'polite');
    const title = make('h2', 'things-title');
    const desc = make('p', 'things-desc');
    info.append(title, desc);

    const view = { canvas, note, info, title, desc, motion: null, lift: null, api: null, wanted: false };
    views.set(page, view);

    // The objects are pictures on a canvas, so keyboards and screen readers get a plain list that does the same thing.
    const list = make('ul', 'things-list');
    list.setAttribute('aria-label', 'My things');
    for (const thing of things) {
      const item = make('li');
      const button = make('button', '', thing.title);
      button.type = 'button';
      button.addEventListener('click', () => view.api?.select(thing.id));
      item.append(button);
      list.append(item);
    }

    // iPhones only let a page read the phone's motion after a tap, so there's a button for it (shown only where it's needed).
    const motion = make('button', 'things-motion', 'tilt to move');
    motion.type = 'button';
    motion.hidden = true;
    motion.addEventListener('click', () =>
      tilt.enable().then((granted) => {
        if (granted) motion.hidden = true;
      }),
    );
    view.motion = motion;

    page.append(stage, info, list, motion);
  },

  blocks: (page) => [page.querySelector('.things-stage')],

  onShow(page) {
    const view = views.get(page);
    view.wanted = true;
    view.note.hidden = true;
    const hero = page.closest('.hero');
    const header = { floater: hero.querySelector('.floater.is-page-header'), label: hero.querySelector('.floater__label.is-header') };

    view.lift ??= loadThings().then(({ createFloatingThings }) =>
      createFloatingThings({
        canvas: view.canvas,
        things,
        onSelect: (thing) => {
          view.title.textContent = thing.title;
          view.desc.textContent = thing.description;
          view.info.classList.add('is-open');
        },
        onDeselect: () => view.info.classList.remove('is-open'),
      }),
    );
    view.lift
      .then((lift) => {
        view.api = lift;
        if (import.meta.env.DEV) window.__things = lift;
        if (!view.wanted) return; // closed again before it had loaded
        view.info.classList.remove('is-open');
        lift.start(header); // static by default: a wall the objects bounce off of, pinned in place by the router
        view.motion.hidden = !(tilt.supported && tilt.needsPermission && !tilt.on); // (already allowed on the home screen? then no button)
      })
      .catch((error) => {
        console.error('Failed to start my things', error);
        view.lift = null; // try again next time
        view.note.textContent = "couldn't load the 3D objects, sorry.";
        view.note.hidden = false;
      });
  },

  /** The router waits for this: closes whatever object is open before the page leaves. */
  onHide(page) {
    const view = views.get(page);
    view.wanted = false;
    view.info.classList.remove('is-open');
    const lift = view.api;
    if (!lift) return undefined;
    return lift.settle().then(() => lift.stop());
  },

  /** Esc closes an open object before it closes the page. */
  back: (page) => views.get(page).api?.back() ?? false,
};
