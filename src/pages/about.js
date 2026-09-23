import { about } from '../data/about.js';
import { photoElement } from '../ui/image.js';

function card(className, photo) {
  const figure = document.createElement('figure');
  figure.className = `about-card ${className}`;
  const img = photoElement(photo, { sizes: '(max-width: 720px) 60vw, 34vw' }); // (the wide card, the bigger of the two)
  const rim = document.createElement('span'); // the glassy edge, drawn over the photo (same as on the photos page)
  rim.className = 'about-card__rim';
  figure.append(img, rim);
  return figure;
}

/** About Me: two photo cards, then one paragraph at a time. Each is its own staggered block. */
export const aboutPage = {
  stagger: 200,
  header: 'aside-bottom', // every page's header lives bottom-right (see pages.css)

  render(page) {
    page.classList.add('page--about');

    const column = document.createElement('div');
    column.className = 'page__col';

    const cards = document.createElement('div');
    cards.className = 'about-cards';
    cards.append(card('about-card--portrait', about.portrait), card('about-card--wide', about.wide));

    const text = document.createElement('div');
    text.className = 'about-text';
    for (const paragraph of about.paragraphs) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      text.append(p);
    }

    column.append(cards, text);
    page.append(column);
  },

  blocks: (page) => [page.querySelector('.about-cards'), ...page.querySelectorAll('.about-text p')],
};
