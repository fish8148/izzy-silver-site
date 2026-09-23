import { contact } from '../data/contact.js';

// The 3D part (and three.js) is only fetched when it's wanted: `preload` runs while the browser is idle after the hero is
// up, and the page's first open waits for whatever is left.
const loadFaceLift = () => import('../features/face-lift.js');

const views = new WeakMap(); // page element -> { canvas, note, lift, wanted }

function make(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

function contactLink(label, href) {
  if (!href) return make('span', 'hi-link is-plain', label); // no address yet: plain text, not a link that goes nowhere
  const a = make('a', 'hi-link', label);
  a.href = href;
  if (/^https?:/.test(href)) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

/**
 * Say hi: your head scan in the middle, which you can grab and stretch (features/face-lift.js), with the ways to reach you
 * underneath.
 */
export const sayHiPage = {
  stagger: 220,
  header: 'aside-bottom', // every page's header lives bottom-right (see pages.css)

  preload() {
    loadFaceLift()
      .then(({ preloadHead }) => preloadHead())
      .catch(() => {}); // (it is tried again, and reported, when the page is actually opened)
  },

  render(page) {
    page.classList.add('page--hi');

    const stage = make('div', 'hi-stage');
    const canvas = make('canvas', 'hi-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', "A 3D scan of Izzy's head. Drag it to stretch it; right-click to put it back.");
    const note = make('p', 'hi-note');
    note.hidden = true;
    stage.append(canvas, note);

    const links = make('div', 'hi-contact');
    links.append(contactLink('linkedin', contact.linkedin), contactLink(contact.email, `mailto:${contact.email}`));

    const tools = make('div', 'hi-tools');
    const reset = make('button', 'hi-reset', 'reset');
    reset.type = 'button';
    const hint = make('p', 'hi-hint');
    hint.append(
      make('span', 'hi-hint__mouse', 'click and drag the head to stretch it. right-click to reset'),
      make('span', 'hi-hint__touch', 'drag the head to stretch it'),
    );
    tools.append(reset, hint);

    page.append(stage, links, tools);

    const view = { canvas, note, lift: null, wanted: false };
    views.set(page, view);
    reset.addEventListener('click', () => view.lift?.then((lift) => lift.reset()).catch(() => {})); // (a failed load is reported when the page opens)
  },

  blocks: (page) => [...page.querySelectorAll('.hi-stage, .hi-link, .hi-tools')],

  onShow(page) {
    const view = views.get(page);
    view.wanted = true;
    view.lift ??= loadFaceLift().then(({ createFaceLift }) => createFaceLift({ canvas: view.canvas }));
    view.lift
      .then((lift) => {
        if (import.meta.env.DEV) window.__hi = lift;
        if (!view.wanted) return; // closed again before the head had loaded
        lift.reset({ animate: false }); // a fresh head every visit
        lift.start();
      })
      .catch((error) => {
        console.error('Failed to start the head scan', error);
        view.lift = null; // try again next time
        view.note.textContent = "couldn't load the 3D head, but the links below still work.";
        view.note.hidden = false;
      });
  },

  onHide(page) {
    const view = views.get(page);
    view.wanted = false;
    view.lift?.then((lift) => lift.stop()).catch(() => {});
  },
};
