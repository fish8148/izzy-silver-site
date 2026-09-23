import * as THREE from 'three';
import { CLICK_SLOP_PX } from '../config.js';

const CLICK_MAX_MS = 500;

/**
 * Pointer handling for the canvas:
 *  - tells a real click apart from the end of a click-and-drag (camera rotation)
 *  - hit-tests the character with a Raycaster against the skeleton-following hit capsules
 *  - swaps the cursor to a pointer while hovering the character
 */
export function createPicking({ canvas, camera, hitProxies, onCharacterClick }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hitsCharacter(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    hitProxies.update();
    return raycaster.intersectObjects(hitProxies.group.children, false).length > 0;
  }

  // ---- click vs drag ----
  let down = null;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY, id: event.pointerId, at: performance.now() };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!down || event.pointerId !== down.id) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const elapsed = performance.now() - down.at;
    down = null;
    if (moved > CLICK_SLOP_PX || elapsed > CLICK_MAX_MS) return; // that was a drag (or a long press)
    if (hitsCharacter(event.clientX, event.clientY)) onCharacterClick();
  });

  // The browser takes over for vertical scrolling on touch; that is never a click.
  canvas.addEventListener('pointercancel', () => {
    down = null;
  });

  // ---- hover cursor (mouse only, at most once per frame) ----
  let queued = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || event.buttons) return;
    lastX = event.clientX;
    lastY = event.clientY;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      canvas.classList.toggle('is-hovering-character', hitsCharacter(lastX, lastY));
    });
  });
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-hovering-character'));

  return { hitsCharacter };
}
