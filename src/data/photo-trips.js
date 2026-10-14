/**
 * Photos page content, grouped by trip. Each trip is one chapter on the page, in this order, and one name in the index
 * on the left. Edit freely.
 *
 *   slug         used in the page's anchors (#toronto); letters, numbers and dashes
 *   name         shown in the index and above the chapter (lowercase, like the rest of the site)
 *   description  shown under the name while you're in that trip: a string, or a list of strings for several paragraphs.
 *                [text](https://…) makes a link (blue, with an arrow, opens in a new tab). Leave it '' to show nothing.
 *   photos       in order; the first one is shown big. Each is
 *                  src      the photo's name in public/photos, without size or extension (`npm run prep:photos` makes
 *                           those from photos-src/)
 *                  shape    'wide' or 'tall' (what `npm run prep:photos` printed for it): picks its tile in the grid
 *                  caption  shown over the photo when you hover it, and under it in the viewer ('' for none)
 *                  alt      what the photo shows, for screen readers (defaults to the trip's name)
 */
export const trips = [
  {
    slug: 'toronto',
    name: 'toronto',
    description: 'my extended family lives here, so i’m back often. the food is the best part: my favourites so far are sushi on bloor and brown donkatsu.',
    photos: [
      { src: 'toronto1', shape: 'wide', caption: '' },
      { src: 'toronto2', shape: 'wide', caption: '' },
      { src: 'toronto3', shape: 'tall', caption: '' },
      { src: 'toronto4', shape: 'tall', caption: '' },
    ],
  },
  {
    slug: 'camp',
    name: 'camp',
    description: 'three summers at a wilderness camp, working alongside my friends. i started as a counsellor leading canoe trips, and most recently was program coordinator, planning and running every camp-wide program.',
    photos: [
      { src: 'camp1', shape: 'wide', caption: '' },
      { src: 'camp2', shape: 'tall', caption: '' },
      { src: 'camp3', shape: 'wide', caption: '' },
      { src: 'camp4', shape: 'tall', caption: '' },
      { src: 'camp5', shape: 'tall', caption: '' },
      { src: 'camp6', shape: 'wide', caption: '' },
      { src: 'camp7', shape: 'wide', caption: '' },
      { src: 'camp8', shape: 'wide', caption: '' },
      { src: 'camp9', shape: 'wide', caption: '' },
      { src: 'camp10', shape: 'wide', caption: '' },
      { src: 'camp11', shape: 'tall', caption: '' },
      { src: 'camp12', shape: 'wide', caption: '' },
      { src: 'camp13', shape: 'wide', caption: '' },
    ],
  },
  {
    slug: 'moab',
    name: 'moab',
    description: 'white water rafting with my dad and little brother: four nights camping along the green and colorado rivers.',
    photos: [
      { src: 'moab1', shape: 'wide', caption: '' },
      { src: 'moab2', shape: 'wide', caption: '' },
      { src: 'moab3', shape: 'tall', caption: '' },
      { src: 'moab4', shape: 'wide', caption: '' },
      { src: 'moab5', shape: 'tall', caption: '' },
      { src: 'moab6', shape: 'wide', caption: '' },
      { src: 'moab7', shape: 'tall', caption: '' },
    ],
  },
  {
    slug: 'costa-rica',
    name: 'costa rica',
    description: 'my grad trip with my family, through tamarindo, cerro chato and puntarenas. the best thing i ate: casado.',
    photos: [
      { src: 'costarica4', shape: 'wide', caption: '' },
      { src: 'costarica1', shape: 'tall', caption: '' },
      { src: 'costarica2', shape: 'tall', caption: '' },
      { src: 'costarica3', shape: 'tall', caption: '' },
    ],
  },
  {
    slug: 'poland',
    name: 'poland',
    description: [
      'my grandfather survived the holocaust, so this trip meant a lot to me. a few friends and i joined march of the living, a holocaust education trip to auschwitz, auschwitz-birkenau, treblinka and majdanek.',
      'we travelled with alex buckman, a holocaust survivor and educator. hearing his story and outlook on life first hand changed me, and i’ve taken his motto as my own: “my religion is kindness.”',
      'read his story [here](https://abcbookworld.com/writer/buckman-alex/).',
    ],
    photos: [
      { src: 'poland1', shape: 'wide', caption: '' },
      { src: 'poland2', shape: 'tall', caption: '' },
      { src: 'poland3', shape: 'tall', caption: '' },
      { src: 'poland4', shape: 'wide', caption: '' },
      { src: 'poland5', shape: 'tall', caption: '' },
      { src: 'poland6', shape: 'wide', caption: '' },
    ],
  },
  {
    slug: 'washington',
    name: 'washington',
    description: 'my grade 12 school trip: the holocaust memorial museum, the smithsonians, and moulin rouge at the kennedy center. my favourite smithsonian was the national museum of african american history and culture.',
    photos: [
      { src: 'washington2', shape: 'wide', caption: '' },
      { src: 'washington1', shape: 'tall', caption: '' },
    ],
  },
  {
    // (the plane photo had no trip of its own: it's here for now, move it wherever it belongs)
    slug: 'waterloo',
    name: 'waterloo',
    description: '',
    photos: [
      { src: 'waterloo1', shape: 'wide', caption: '' },
      { src: 'plane1', shape: 'tall', caption: '' },
    ],
  },
];
