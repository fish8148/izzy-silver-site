/**
 * About Me page content (the "Editorial" design, 14a). Edit freely.
 *
 *   intro       one entry per paragraph, set large at the top
 *   portrait    beside the intro: a path in /public; leave off the extension for a photo made by `npm run prep:photos`
 *   resume      where both "resume ↗" links go (opens in a new tab). For a file, put it in public/ (e.g. public/resume.pdf).
 *   highlights  one section each, in order: its name stays pinned on the left while its photos scroll past on the right.
 *     description  1–2 sentences ('' shows nothing)
 *     photos       { src, alt } each, `src` as for the portrait. The grid goes wide, half, half, wide, and repeats.
 */
export const about = {
  intro: [
    'hi, my name is izzy silver. I’m a computer engineering student at university of waterloo.',
    'growing up I had a passion for technology, design, and health.',
    'currently i’m in working at qdoc, a healthcare startup.',
  ],
  portrait: { src: 'photos/about-portrait.svg', alt: 'a portrait of izzy' },
  resume: 'resume.pdf',
  highlights: [
    { slug: 'studio-lab-xr', name: 'studio lab XR', role: 'architectural visualization researcher', description: '', photos: [] },
    { slug: 'qdoc', name: 'QDoc Inc.', role: 'website developer', description: '', photos: [] },
    { slug: 'uwaterloo', name: 'university of waterloo', role: 'student', description: '', photos: [] },
  ],
};
