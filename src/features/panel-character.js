import { CLIPS } from '../config.js';
import { createAnimator } from '../scene/animator.js';
import { createHitProxies, loadCharacter, measureGroundLift } from '../scene/character.js';
import { createPicking } from '../scene/picking.js';
import { createStage } from '../scene/stage.js';

/**
 * The home screen's character, again, in the say hi page's panel: its own little stage, the same model (the browser
 * has it cached from the home screen) and the same behaviour as at home, minus the arrivals and the party. He idles
 * (with the odd idle action), a click on him walks idle → wave → spin, and dragging turns the camera, which drifts
 * round on its own in between.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}character.glb`;
// Where he stands in the panel: feet this far down it, and head-top to feet this much of its height
const FRAMING = { feet: 0.92, span: 0.8 };

let loading = null;

/** Start fetching and reading the model. Safe to call as often as you like; the page calls it early, while idle. */
export function preloadCharacter() {
  if (!loading) {
    loading = loadCharacter(MODEL_URL);
    loading.catch(() => {
      loading = null; // a failed load can be tried again the next time the page opens
    });
  }
  return loading;
}

/**
 * @param {{ canvas: HTMLCanvasElement }} options  the canvas fills the panel
 * @returns the character, not yet running: call start() when it's on screen and stop() when it isn't
 */
export async function createPanelCharacter({ canvas }) {
  const character = await preloadCharacter();
  const stage = createStage(canvas, { framing: FRAMING });

  character.root.position.y = character.floorOffset;
  stage.scene.add(character.root);
  stage.frame(character.height);

  const hitProxies = createHitProxies(character.bones, character.root);
  stage.scene.add(hitProxies.group);

  const animator = createAnimator({
    mixer: character.mixer,
    actions: character.actions,
    root: character.root,
    groundLift: measureGroundLift(character, Object.values(CLIPS)),
  });
  animator.playRest('idle', { fade: 0 });

  createPicking({ canvas, camera: stage.camera, hitProxies, onCharacterClick: () => animator.cycle() });

  let running = false;
  let last = 0;
  let firstFrame = true;
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    stage.resize();
    stage.renderer.setAnimationLoop((now) => {
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      animator.update(dt);
      stage.update(dt);
      stage.render();
      if (firstFrame) {
        firstFrame = false;
        canvas.classList.add('is-ready');
      }
    });
  }

  function stop() {
    running = false;
    stage.renderer.setAnimationLoop(null);
  }

  /** A fresh start for each visit: standing in idle, seen from the front. */
  function reset() {
    animator.playRest('idle', { fade: 0 });
    stage.snapToFront();
  }

  return {
    stage,
    animator,
    start,
    stop,
    reset,
    get running() {
      return running;
    },
  };
}
