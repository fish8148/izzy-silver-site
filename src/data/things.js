/**
 * The objects floating around on the "my things" page, one per hobby or project. Click one and it comes forward with
 * its `title` and `description` beside it.
 *
 *   id           any unique word
 *   title        shown big beside the object when it's opened
 *   description  a line or two under the title
 *   shape        the stand-in until there's a real model: box | sphere | torus | cone | dodecahedron | cylinder
 *   color        the stand-in's colour
 *   size         optional, 1 by default: how big it floats, relative to the others
 *   model        optional: a .glb in public/ (e.g. 'models/controller.glb'). It replaces the stand-in shape. It's centred
 *                and scaled to fit automatically, so any size and origin will do
 *
 * The first few sit where the design has them (a loose cluster on the right of the screen); after that everything drifts.
 */
export const things = [
  {
    id: 'gaming',
    title: 'gaming',
    description: 'Placeholder: a line or two about this hobby goes here.',
    shape: 'box',
    color: '#d6d6d6',
    size: 1.05,
  },
  {
    id: 'project-one',
    title: 'project one',
    description: 'Placeholder: what it is, what you built it with, and what you learned.',
    shape: 'torus',
    color: '#3fe0c5',
    size: 1,
  },
  {
    id: 'photography',
    title: 'photography',
    description: 'Placeholder: a line or two about this hobby goes here.',
    shape: 'cone',
    color: '#c9b18a',
    size: 1.05,
  },
  {
    id: 'project-two',
    title: 'project two',
    description: 'Placeholder: what it is, what you built it with, and what you learned.',
    shape: 'dodecahedron',
    color: '#c86b3c',
    size: 0.95,
  },
  {
    id: 'music',
    title: 'music',
    description: 'Placeholder: a line or two about this hobby goes here.',
    shape: 'sphere',
    color: '#8aa0b8',
    size: 0.9,
  },
];
