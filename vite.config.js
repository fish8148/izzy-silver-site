import { defineConfig } from 'vite';
import { writeFile } from 'node:fs/promises';

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

// Zero-config for Vercel / Netlify: `npm run build` -> dist/, served from `/`.
// GitHub Pages serves a project site from /<repo>/ instead, so its workflow (.github/workflows/deploy.yml)
// builds with GH_PAGES=1, which switches every asset URL (import.meta.env.BASE_URL, used throughout src/) to match.
export default defineConfig({
  base: process.env.GH_PAGES ? '/izzy-silver-site/' : '/',
  plugins: [savePoster],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
