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

// `npm run build` -> dist/, served from `/` — true on Vercel/Netlify, and on GitHub Pages too now that
// isilver.uwce.ca (public/CNAME) fronts it: a custom domain serves the site at its root, not at /<repo>/.
export default defineConfig({
  plugins: [savePoster],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800, // three.js alone is ~700 kB minified
  },
});
