import { about } from '../data/about.js';
import { photoElement } from '../ui/image.js';

/**
 * About Me (the "Editorial" design, 14a): one scrolling page.
 *   1. the intro: three paragraphs set large, a resume link, and a portrait
 *   2. the highlights (src/data/about.js): each section's name stays pinned on the left while its photos scroll past
 *   3. a large resume link to close
 * Under 960px everything goes to one column (pages.css).
 */

const WIDE_EVERY = [2, 1, 1, 2]; // the photo grid's columns per tile, repeating: wide, half, half, wide
const base = import.meta.env.BASE_URL;
const url = (path) => (/^(https?:)?\/\//.test(path) || path.startsWith('/') ? path : `${base}${path}`);

function resumeLink(className) {
  const link = document.createElement('a');
  link.className = className;
  link.href = url(about.resume);
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'resume ↗';
  link.setAttribute('aria-label', `resume (${/\.pdf$/i.test(about.resume) ? 'PDF, ' : ''}opens in new tab)`);
  return link;
}

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
  text.append(resumeLink('about-intro__resume'));
  const portrait = document.createElement('figure');
  portrait.className = 'about-intro__portrait';
  portrait.append(photoElement(about.portrait, { sizes: '(max-width: 959px) 92vw, 340px' }));
  section.append(text, portrait);
  return section;
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
      const cols = WIDE_EVERY[i % WIDE_EVERY.length];
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

  render(page) {
    page.classList.add('page--about');
    const scroller = document.createElement('div');
    scroller.className = 'about page__scroll';
    scroller.tabIndex = -1;
    const closing = document.createElement('section');
    closing.className = 'about-closing';
    closing.setAttribute('aria-label', 'Resume');
    closing.append(resumeLink('about-closing__resume'));
    scroller.append(intro(), ...about.highlights.map(highlight), closing);
    page.append(scroller);
  },

  onShow(page) {
    page.querySelector('.about').scrollTop = 0;
  },

  // the intro comes in one piece at a time: each paragraph, the link, the portrait (the rest is below the fold)
  blocks: (page) => [...page.querySelectorAll('.about-intro__text > *'), page.querySelector('.about-intro__portrait')],
};
