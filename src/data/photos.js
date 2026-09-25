/**
 * Photos page content. The photos sit on two rows that slowly drift to the right and loop: the first half go on the
 * top row, the rest on the bottom row, both read left to right. Add as many as you like.
 *
 *   src      image path, relative to /public
 *   alt      what the photo shows (for screen readers)
 *   caption  the description: fades in over the bottom of the photo when you hover it, and sits under it in the carousel
 *   shape    'wide' (4:3, the default) or 'tall' (3:4). Mixing them staggers the two rows, as in the design.
 *            For the loop to look seamless the two rows should come out about equally long, e.g. top: wide,
 *            wide, tall and bottom: tall, wide, wide. The shorter row just spreads its gaps a little.
 */
export const photos = [
  { src: 'photos/washington1.svg', alt: 'placeholder photo 1', caption: '[caption for photo 1 — where, when, who]', shape: 'tall' },
  { src: 'photos/washington2.svg', alt: 'placeholder photo 2', caption: '[caption for photo 2 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp1.svg', alt: 'placeholder photo 3', caption: '[caption for photo 3 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp2.svg', alt: 'placeholder photo 4', caption: '[caption for photo 4 — where, when, who]', shape: 'tall' },
  { src: 'photos/camp3.svg', alt: 'placeholder photo 5', caption: '[caption for photo 5 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp4.svg', alt: 'placeholder photo 6', caption: '[caption for photo 6 — where, when, who]', shape: 'tall' },
  { src: 'photos/camp5.svg', alt: 'placeholder photo 7', caption: '[caption for photo 7 — where, when, who]', shape: 'tall' },
  { src: 'photos/camp6.svg', alt: 'placeholder photo 8', caption: '[caption for photo 8 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp7.svg', alt: 'placeholder photo 9', caption: '[caption for photo 9 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp8.svg', alt: 'placeholder photo 10', caption: '[caption for photo 10 — where, when, who]', shape: 'wide' }
  { src: 'photos/camp9.svg', alt: 'placeholder photo 11', caption: '[caption for photo 11 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp10.svg', alt: 'placeholder photo 12', caption: '[caption for photo 12 — where, when, who]', shape: 'wide' }
  { src: 'photos/camp11.svg', alt: 'placeholder photo 13', caption: '[caption for photo 13 — where, when, who]', shape: 'tall' },
  { src: 'photos/camp12.svg', alt: 'placeholder photo 14', caption: '[caption for photo 14 — where, when, who]', shape: 'wide' },
  { src: 'photos/camp13.svg', alt: 'placeholder photo 15', caption: '[caption for photo 15 — where, when, who]', shape: 'wide' },

];
