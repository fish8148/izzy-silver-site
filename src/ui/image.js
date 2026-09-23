/**
 * Photos on the site. A `src` with a file extension ('photos/me.jpg', the placeholder .svgs) is used as it is. A `src`
 * without one ('photos/beach') means the photo went through `npm run prep:photos`, which made four files from it:
 *
 *   public/photos/beach-800.avif   public/photos/beach-1600.avif
 *   public/photos/beach-800.webp   public/photos/beach-1600.webp
 *
 * and the browser picks the smallest one that is still sharp at the size it's shown (AVIF where it can, WebP otherwise).
 */
import { PHOTO_WIDTHS } from '../data/photo-sizes.js';

const url = (path) => `${import.meta.env.BASE_URL}${path}`;
const hasExtension = (src) => /\.[a-z0-9]+$/i.test(src);
const srcset = (src, type) => PHOTO_WIDTHS.map((w) => `${url(`${src}-${w}.${type}`)} ${w}w`).join(', ');

/**
 * `sizes`: how wide the photo is shown, as a CSS length (see the `sizes` attribute), so the browser can pick a file.
 * Returns a plain <img>, or a <picture> wrapping one (pages.css makes the <picture> itself take up no box).
 */
export function photoElement({ src, alt }, { sizes = '100vw', draggable = true } = {}) {
  const img = document.createElement('img');
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = draggable;
  if (hasExtension(src)) {
    img.src = url(src);
    return img;
  }
  img.src = url(`${src}-${PHOTO_WIDTHS[0]}.webp`);
  img.srcset = srcset(src, 'webp');
  img.sizes = sizes;
  const avif = document.createElement('source');
  avif.type = 'image/avif';
  avif.srcset = srcset(src, 'avif');
  avif.sizes = sizes;
  const picture = document.createElement('picture');
  picture.append(avif, img);
  return picture;
}
