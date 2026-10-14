import { about } from '../data/about.js';
import { photoElement } from '../ui/image.js';
import { resumeLink } from '../ui/resume.js';
import { pageCharacter, preloadPageCharacter } from './page-character.js';

/**
 * About Me (the "Editorial" design, 14a, with the character from 24b "Standing"): one scrolling page, and the first one
 * the site opens on.
 *   1. the intro: three paragraphs set large, the resume and say hi links, and the 3D character standing beside them
 *      on the black page (features/panel-character.js), with a faint pool of light under his feet
 *   2. the highlights (src/data/about.js): each section's name stays pinned on the left while its photos scroll past
 *   3. a large resume link to close
 * Under 960px everything goes to one column (pages.css).
 */

const WIDE_EVERY = [2, 1, 1, 2]; // the photo grid's columns per tile, repeating: wide, half, half, wide
const views = new WeakMap(); // page element -> its character (page-character.js)
// He's drawn larger here than on say hi: feet about 1% above the bottom of his column, the head about 3% below its top
const FRAMING = { feet: 0.97, span: 0.9 };

function lazy(el) {
  for (const img of el.tagName === 'IMG' ? [el] : el.querySelectorAll('img')) img.loading = 'lazy';
  return el;
}

function intro() {
  const section = document.createElement('section');
  section.className = 'about-intro';
  section.setAttribute('aria-label', 'Intro');
  const text = document.createElement('div');
  text.className = 'about-intro__text';
  for (const paragraph of about.intro) {
    const p = document.createElement('p');
    p.textContent = paragraph;
    text.append(p);
  }
  const links = document.createElement('div');
  links.className = 'about-intro__links';
  const hi = document.createElement('a');
  hi.className = 'about-intro__hi';
  hi.href = '#say-hi'; // (the router switches to say hi in place: same tab, hence → rather than ↗)
  hi.textContent = 'say hi →';
  links.append(resumeLink('about-intro__resume'), hi);
  text.append(links);

  const character = document.createElement('div');
  character.className = 'about-intro__character';
  const floor = document.createElement('div');
  floor.className = 'about-intro__floor';
  const canvas = document.createElement('canvas');
  canvas.className = 'about-intro__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', "Izzy's 3D character. Click him to change what he's doing, or drag to look around.");
  const note = document.createElement('p');
  note.className = 'about-intro__note';
  note.hidden = true;
  character.append(floor, canvas, note);
  section.append(text, character);
  return { section, canvas, note, column: character };
}

function highlight(item, k) {
  const section = document.createElement('section');
  section.className = 'about-highlight';
  section.id = `about-${item.slug}`;
  section.setAttribute('aria-label', item.name);

  const side = document.createElement('div');
  side.className = 'about-highlight__side';
  const meta = document.createElement('p');
  meta.className = 'about-highlight__meta';
  const num = document.createElement('span');
  num.textContent = String(k + 1).padStart(2, '0');
  const role = document.createElement('span');
  role.textContent = item.role;
  meta.append(num, role);
  const name = document.createElement('h2');
  name.className = 'about-highlight__name';
  name.textContent = item.name;
  side.append(meta, name);
  if (item.description) {
    const desc = document.createElement('p');
    desc.className = 'about-highlight__desc';
    desc.textContent = item.description;
    side.append(desc);
  }
  section.append(side);

  if (item.photos?.length) {
    const grid = document.createElement('div');
    grid.className = 'about-highlight__grid';
    item.photos.forEach((photo, i) => {
      let cols = WIDE_EVERY[i % WIDE_EVERY.length];
      // a half-width photo that would sit alone at the end of a row (the last one, its partner missing) goes full width
      if (cols === 1 && i === item.photos.length - 1 && WIDE_EVERY[(i - 1 + WIDE_EVERY.length) % WIDE_EVERY.length] !== 1) cols = 2;
      const tile = document.createElement('figure');
      tile.className = `about-highlight__photo${cols > 1 ? ' is-wide' : ''}`;
      tile.append(lazy(photoElement({ src: photo.src, alt: photo.alt ?? `${item.name}` }, { sizes: cols > 1 ? '(max-width: 959px) 92vw, 60vw' : '(max-width: 559px) 92vw, (max-width: 959px) 46vw, 30vw' })));
      grid.append(tile);
    });
    section.append(grid);
  }
  return section;
}

export const aboutPage = {
  stagger: 120,

  preload: preloadPageCharacter,

  render(page) {
    page.classList.add('page--about');
    const scroller = document.createElement('div');
    scroller.className = 'about page__scroll';
    scroller.tabIndex = -1;
    const closing = document.createElement('section');
    closing.className = 'about-closing';
    closing.setAttribute('aria-label', 'Resume');
    closing.append(resumeLink('about-closing__resume'));
    const top = intro();
    scroller.append(top.section, ...about.highlights.map(highlight), closing);
    page.append(scroller);
    views.set(page, pageCharacter({ canvas: top.canvas, column: top.column, note: top.note, framing: FRAMING, failText: "couldn't load the 3D character, but the links still work." }));
  },

  onShow(page) {
    page.querySelector('.about').scrollTop = 0;
    views.get(page).show();
  },

  onHide(page) {
    views.get(page).hide();
  },

  // the intro comes in one piece at a time: each paragraph, the links, the character (the rest is below the fold)
  blocks: (page) => [...page.querySelectorAll('.about-intro__text > *'), page.querySelector('.about-intro__character')],
};
