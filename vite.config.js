import { defineConfig } from 'vite';
import { writeFile } from 'node:fs/promises';
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

// Dev server only: /?poster (src/scene/poster.js) renders the character's loading still in the browser and posts it
// here to be saved as public/character-poster.webp.
const savePoster = {
  name: 'save-poster',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__save-poster', (req, res) => {
      if (req.method !== 'POST') return void (res.statusCode = 405, res.end());
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          await writeFile('public/character-poster.webp', Buffer.concat(chunks));
          res.end('ok');
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
    });
  },
};

// `npm run build` -> dist/, served from `/` — true on Vercel/Netlify, and on GitHub Pages too now that
// isilver.uwce.ca (public/CNAME) fronts it: a custom domain serves the site at its root, not at /<repo>/.
export default defineConfig({
  plugins: [savePoster],
  define: {
    __RESUME_VERSION__: JSON.stringify(fileVersion('public/resume.pdf')),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
