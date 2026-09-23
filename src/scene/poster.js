import { CLIPS } from '../config.js';

// The box the poster covers, in units of --frame-span (the character's height on screen): its top sits `above` over his
// feet, it is `tall` high and `wide` across, centred. hero.css draws .hero__poster with the same `above` and `tall`:
// change them together, then re-capture.
const POSTER = { above: 1.06, tall: 1.1, wide: 0.62, renderHeight: 1100 };

/**
 * DEV ONLY. Makes public/character-poster.webp: the still of the character shown while the real one loads (hero.css).
 *
 *   npm run dev, then open  http://localhost:5173/?poster
 *
 * Re-run it whenever character.glb changes. It stands him in the first frame of his idle, facing the front, renders one
 * frame at a fixed size, crops it to the box the poster is drawn in (POSTER, below), and hands it to the dev server
 * (vite.config.js), which saves it. Reload without ?poster afterwards.
 */
export async function capturePoster({ stage, character, canvas }) {
  const { renderer, camera } = stage;
  const { mixer, actions, root } = character;
  const status = (text) => (document.getElementById('loader').querySelector('span').textContent = text);

  // the pose: idle, frame one, dead centre, facing front
  mixer.stopAllAction();
  actions[CLIPS.idle].reset().play();
  mixer.update(0);
  root.position.set(0, character.floorOffset, 0);
  root.rotation.set(0, 0, 0);
  stage.snapToFront();

  // a fixed-size render, so the poster comes out the same whatever window this runs in (the framing only depends on the
  // height: see stage.frame, and the crop is centred)
  const height = POSTER.renderHeight;
  const width = Math.round(height * 0.75);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  stage.frame();
  stage.render();

  const { feet, span } = readFrame();
  const top = (feet - span * POSTER.above) * height;
  const cropH = span * POSTER.tall * height;
  const cropW = span * POSTER.wide * height;
  const out = document.createElement('canvas');
  out.width = Math.round(cropW);
  out.height = Math.round(cropH);
  // (straight after render, in the same task: the WebGL canvas is only readable until the browser shows it)
  out.getContext('2d').drawImage(canvas, (width - cropW) / 2, top, cropW, cropH, 0, 0, out.width, out.height);

  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/webp', 0.72));
  const saved = await fetch('/__save-poster', { method: 'POST', body: blob });
  status(saved.ok ? `poster saved (${Math.round(blob.size / 1024)} KB, ${out.width}×${out.height})` : 'poster NOT saved');
  document.getElementById('loader').classList.remove('is-done');
  console.info('[poster]', saved.ok ? 'saved public/character-poster.webp' : await saved.text());
}

function readFrame() {
  const style = getComputedStyle(document.documentElement);
  return { feet: parseFloat(style.getPropertyValue('--frame-feet')), span: parseFloat(style.getPropertyValue('--frame-span')) };
}
