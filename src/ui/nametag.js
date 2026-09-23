import { NAMETAG_IDLE_MS } from '../config.js';

/**
 * The floating "izzy_silver" tag. It's a plain DOM element (not part of the 3D scene) that
 * the render loop keeps pinned above the character's head. It fades out after the pointer
 * has been still for a few seconds and comes back as soon as it moves again.
 */
export function createNametag(el) {
  let hideTimer = 0;
  let x = 0;
  let y = 0;
  let placed = false;

  const wake = (event) => {
    // Some browsers fire a zero-movement "mouse moved" when content changes under a still cursor.
    if (event.type === 'pointermove' && event.pointerType === 'mouse' && !event.movementX && !event.movementY) return;
    el.classList.remove('is-hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.add('is-hidden'), NAMETAG_IDLE_MS);
  };

  // pointermove covers mouse/pen; pointerdown covers touch, where there is no hovering cursor.
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  wake({ type: 'init' }); // visible on load, then fades after the first still spell

  return {
    /** Bring the tag back and restart its 3-second countdown (e.g. when the home screen returns). */
    wake: () => wake({ type: 'init' }),

    /** Ease toward a screen position (CSS px, relative to the hero). Frame-rate independent. */
    follow(targetX, targetY, dt) {
      if (!placed) {
        x = targetX;
        y = targetY;
        placed = true;
      } else {
        const k = 1 - Math.exp(-dt * 32); // fast enough that it reads as rigidly attached
        x += (targetX - x) * k;
        y += (targetY - y) * k;
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },
  };
}
