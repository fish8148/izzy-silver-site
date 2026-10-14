import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// A fingerprint of public/resume.pdf, added to the resume links (?v=…): a new resume gets a new address, so no browser
// (or the CDN in front of the site) can keep showing an old copy, or a "not found" it remembered from before it existed.
function fileVersion(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 10);
  } catch {
    return '';
  }
}

// `npm run build` -> dist/, served from `/` — true on Vercel/Netlify, and on GitHub Pages too now that
// isilver.uwce.ca (public/CNAME) fronts it: a custom domain serves the site at its root, not at /<repo>/.
export default defineConfig({
  define: {
    __RESUME_VERSION__: JSON.stringify(fileVersion('public/resume.pdf')),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
