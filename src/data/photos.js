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
  { src: 'photos/placeholder-1.svg', alt: 'placeholder photo 1', caption: '[caption for photo 1 — where, when, who]' },
  { src: 'photos/placeholder-2.svg', alt: 'placeholder photo 2', caption: '[caption for photo 2 — where, when, who]' },
  { src: 'photos/placeholder-3.svg', alt: 'placeholder photo 3', caption: '[caption for photo 3 — where, when, who]', shape: 'tall' },
  { src: 'photos/placeholder-4.svg', alt: 'placeholder photo 4', caption: '[caption for photo 4 — where, when, who]', shape: 'tall' },
  { src: 'photos/placeholder-5.svg', alt: 'placeholder photo 5', caption: '[caption for photo 5 — where, when, who]' },
  { src: 'photos/placeholder-6.svg', alt: 'placeholder photo 6', caption: '[caption for photo 6 — where, when, who]' },
];
