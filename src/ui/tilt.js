import { TILT } from '../config.js';

/**
 * The phone's tilt, read from its orientation sensor: one shared reading for everything that reacts to it (the swaying
 * labels on the home screen, the floating objects on my things).
 *
 * Only *changes* in tilt count. "Normal" is however the phone was being held, and it slowly follows the phone (see
 * TILT.settle), so a phone held still at any angle reads as level, and tilting or moving it is what registers.
 *
 * iPhones only let a page read the sensor after the visitor allows it, and only from inside a tap: call `enable()` from a
 * click handler. Other phones just start.
 */
const RAD = Math.PI / 180;
const touchFirst = window.matchMedia('(hover: none)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, limit) => Math.min(Math.max(v, -limit), limit);

const state = { on: false, has: false, gx: 0, gy: 0, bx: 0, by: 0, at: 0 };

function onOrientation(event) {
  if (event.beta == null || event.gamma == null) return; // (desktops send one empty event)
  const beta = event.beta * RAD;
  const gamma = event.gamma * RAD;
  // Which way is downhill across the screen: gravity in the phone's own axes (x right, y up), worked out from the
  // orientation angles in a way that has no trouble when the phone is held upright.
  const dx = Math.sin(gamma) * Math.cos(beta);
  const dy = -Math.sin(beta);
  const angle = (screen.orientation?.angle ?? window.orientation ?? 0) * RAD; // how far the screen is turned from portrait
  state.gx = dx * Math.cos(angle) - dy * Math.sin(angle);
  state.gy = -dy * Math.cos(angle) - dx * Math.sin(angle);
  if (!state.has) {
    // the very first reading is "normal": however the phone happens to be held right now
    state.has = true;
    state.bx = state.gx;
    state.by = state.gy;
  }
}

export const tilt = {
  /** A touch screen that could have a sensor, and a visitor who hasn't asked for less motion. */
  supported: typeof DeviceOrientationEvent !== 'undefined' && touchFirst && !reducedMotion,
  /** iPhones: the sensor has to be allowed, from a tap. */
  needsPermission: typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function',

  get on() {
    return state.on;
  },

  /** Start listening. Resolves to whether it worked (false if not supported, or the visitor said no). */
  async enable() {
    if (state.on) return true;
    if (!tilt.supported) return false;
    try {
      if (tilt.needsPermission && (await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
    } catch {
      return false;
    }
    window.addEventListener('deviceorientation', onOrientation);
    state.on = true;
    return true;
  },

  /**
   * How far the phone has tipped from "normal" since it settled: { x, y }, each -TILT.limit .. TILT.limit. x is
   * positive when the right side goes down, y when the top goes up (toward where the screen's bottom is).
   * Call as often as you like: it reads the clock, so calling twice in one frame doesn't double anything.
   */
  read() {
    if (!state.has) return { x: 0, y: 0 };
    const now = performance.now();
    if (!state.at || now - state.at > 500) {
      // nobody has been reading (a page was open, the tab was hidden): however the phone is now is "normal"
      state.bx = state.gx;
      state.by = state.gy;
    } else {
      const k = 1 - Math.exp(-(now - state.at) / 1000 / TILT.settle);
      state.bx += (state.gx - state.bx) * k;
      state.by += (state.gy - state.by) * k;
    }
    state.at = now;
    return { x: clamp(state.gx - state.bx, TILT.limit), y: clamp(state.gy - state.by, TILT.limit) };
  },

  /** Treat the way the phone is held right now as "normal". */
  recenter() {
    state.bx = state.gx;
    state.by = state.gy;
    state.at = performance.now();
  },
};
