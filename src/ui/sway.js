import { SWAY } from '../config.js';
import { tilt } from './tilt.js';

const clamp = (v, limit) => Math.min(Math.max(v, -limit), limit);

/**
 * On a phone, the floating labels on the home screen sway with the phone's movement: tip or move the phone and they lean
 * that way a little, overshoot, and settle back (each on its own spring, and each by its own share: --depth in index.html),
 * on top of their usual float. Nothing happens on a desktop, or if the visitor asked for less motion.
 *
 * The lean is applied as --sway-x / --sway-y on each floater, which floaters.css turns into a translate. It holds still
 * while a page is open, so the label that has become the page's header isn't swaying under the page.
 *
 * iPhones only let a page read the sensor after the visitor allows it, and only from a tap, so the first tap on the home
 * screen (one that isn't on a label, which is about to open a page) asks. Everything else starts straight away.
 */
export function createSway(hero) {
  if (!tilt.supported) return;

  if (tilt.needsPermission) {
    const ask = (event) => {
      if (hero.classList.contains('is-page-open') || event.target.closest('.floater, .page')) return;
      hero.removeEventListener('click', ask);
      tilt.enable();
    };
    hero.addEventListener('click', ask);
  } else {
    tilt.enable();
  }

  const range = SWAY.stiffness[1] - SWAY.stiffness[0];
  // (not the page menu's "homepage" entry: it only exists inside the menu, never floating on the home screen)
  const bodies = [...hero.querySelectorAll('.floater:not(.is-menu-item)')].map((el, index) => ({
    el,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    shown: [0, 0],
    minX: -SWAY.limit, // how far it can lean either way before it would leave the screen (see measure)
    maxX: SWAY.limit,
    depth: parseFloat(el.style.getPropertyValue('--depth')) || 1,
    omega: SWAY.stiffness[0] + ((index * 0.618) % 1) * range, // (spread evenly, so neighbours differ)
  }));

  // Some labels sit only a few pixels inside the screen's edge on a phone, so each one gets its own limit: how far it could
  // move sideways before the label would leave the screen. Measured from where the label is, less how far it has swayed.
  const KEEP = 8; // px of margin to leave (the label's own float takes a few more)
  function measure() {
    for (const b of bodies) {
      const box = b.el.getBoundingClientRect();
      b.minX = Math.min(-(box.left - b.x - KEEP), 0);
      b.maxX = Math.max(hero.clientWidth - (box.right - b.x) - KEEP, 0);
    }
  }
  requestAnimationFrame(measure);
  if (import.meta.env.DEV) window.__sway = { bodies, measure };
  window.addEventListener('resize', measure);
  hero.addEventListener('page:closed', measure);
  // A page is opening: straighten every label up. Its lean would otherwise stay put while the page is open and knock the
  // header, and each entry in the page menu, a different few px off its spot.
  hero.addEventListener('page:opening', () => {
    for (const b of bodies) {
      b.x = b.y = b.vx = b.vy = 0;
      b.shown = [0, 0];
      b.el.style.removeProperty('--sway-x');
      b.el.style.removeProperty('--sway-y');
    }
  });

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    if (!dt || hero.classList.contains('is-page-open')) return;

    const lean = tilt.read();
    for (const b of bodies) {
      const targetX = Math.min(Math.max(lean.x * SWAY.px * b.depth, -SWAY.limit, b.minX), SWAY.limit, b.maxX);
      const targetY = clamp(lean.y * SWAY.px * b.depth * 0.7, SWAY.limit); // (up and down leans a little less than sideways)
      // a damped spring toward where the phone says it should be
      const stiffness = b.omega * b.omega;
      const damping = 2 * SWAY.damping * b.omega;
      b.vx += (stiffness * (targetX - b.x) - damping * b.vx) * dt;
      b.vy += (stiffness * (targetY - b.y) - damping * b.vy) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // (the spring overshoots, so the limit is enforced on where the label is too, not only on where it's heading)
      if (b.x < b.minX) {
        b.x = b.minX;
        b.vx = Math.max(b.vx, 0);
      } else if (b.x > b.maxX) {
        b.x = b.maxX;
        b.vx = Math.min(b.vx, 0);
      }
      if (Math.abs(b.x - b.shown[0]) > 0.05 || Math.abs(b.y - b.shown[1]) > 0.05) {
        b.shown = [b.x, b.y]; // (only touch the page when it has moved enough to see)
        b.el.style.setProperty('--sway-x', `${b.x.toFixed(2)}px`);
        b.el.style.setProperty('--sway-y', `${b.y.toFixed(2)}px`);
      }
    }
  }
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
}
