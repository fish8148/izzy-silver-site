/**
 * Resizes photos for the site.
 *
 *   npm run prep:photos                      # every photo in photos-src/
 *   npm run prep:photos -- path/to/folder    # a different folder
 *
 * Drop the originals (straight off the camera or phone: .jpg, .png, .webp, .avif, .tif) into photos-src/ — it isn't
 * served, so they can be as big as you like. For each one this writes, into public/photos/:
 *
 *   <name>-800.avif  <name>-800.webp  <name>-1600.avif  <name>-1600.webp
 *
 * turned the right way up (phones store that separately), with the location and camera data stripped out. Then point
 * the photo at it WITHOUT an extension, e.g. { src: 'photos/beach', ... } in src/data/photos.js or src/data/about.js,
 * and the site picks the right file for the screen (src/ui/image.js).
 *
 * Photos that are already done are skipped, unless the original has changed since. Run it again after adding more.
 * (iPhone .heic files: export them as JPEG first — the image library here can't read HEIC.)
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { PHOTO_WIDTHS } from '../src/data/photo-sizes.js';

const input = resolve(process.argv[2] ?? 'photos-src');
const output = resolve('public/photos');
const READABLE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
const kb = (path) => `${Math.round(statSync(path).size / 1024)} KB`;

let files;
try {
  files = readdirSync(input).filter((f) => READABLE.has(extname(f).toLowerCase()));
} catch {
  console.error(`No folder at ${input}. Make it and put your original photos in it.`);
  process.exit(1);
}
if (!files.length) {
  console.error(`No photos in ${input} (looked for ${[...READABLE].join(' ')}).`);
  process.exit(1);
}
mkdirSync(output, { recursive: true });

// names become file names and URLs: lower case, dashes for anything unusual
const slug = (file) =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const lines = [];
for (const file of files) {
  const source = join(input, file);
  const name = slug(file);
  const targets = PHOTO_WIDTHS.flatMap((w) => ['avif', 'webp'].map((type) => ({ w, type, path: join(output, `${name}-${w}.${type}`) })));
  const changed = statSync(source).mtimeMs;
  const upToDate = targets.every(({ path }) => {
    try {
      return statSync(path).mtimeMs >= changed;
    } catch {
      return false;
    }
  });

  const base = sharp(source).rotate(); // (applies the phone's orientation flag; the output then carries no metadata)
  const { width, height } = await base.metadata().then((m) => (m.orientation >= 5 ? { width: m.height, height: m.width } : m));
  const shape = height > width ? 'tall' : 'wide';

  if (upToDate) {
    lines.push(`  ${name.padEnd(28)} up to date            shape: '${shape}'`);
    continue;
  }
  for (const { w, type, path } of targets) {
    const resized = base.clone().resize({ width: w, withoutEnlargement: true });
    await (type === 'avif' ? resized.avif({ quality: 55, effort: 5 }) : resized.webp({ quality: 78 })).toFile(path);
  }
  const big = targets.find((t) => t.w === PHOTO_WIDTHS.at(-1) && t.type === 'avif').path;
  lines.push(`  ${name.padEnd(28)} ${`${kb(source)} -> ${kb(big)}`.padEnd(22)}shape: '${shape}'`);
}

console.log(`\n${files.length} photo${files.length === 1 ? '' : 's'} in ${input}:\n`);
console.log(lines.join('\n'));
console.log(`\nUse them as { src: 'photos/<name>', ... } — no extension. (Sizes above: original -> largest AVIF.)\n`);
