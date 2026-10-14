import * as THREE from 'three';
import { CALM_OPENERS, CLICK_CYCLE, CLIPS, DANCE, ENTRANCES, OPENERS } from '../config.js';
import { createAnimator } from '../scene/animator.js';
import { cloneCharacter, createHitProxies, loadCharacter, measureAnchors, measureGroundLift } from '../scene/character.js';
import { createPicking } from '../scene/picking.js';
import { createStage } from '../scene/stage.js';

/**
 * The character, on a page (about me, say hi): his own little stage on a transparent canvas, a copy of the model (one
 * download, shared mesh and textures, but his own skeleton and animations on each page).
 *
 *   arriving   every time the page is shown he arrives with the next opener (a wave, a salute, a swing, a moonwalk,
 *              a swim, a climb or the dance party). The order is shuffled, played to the end, then shuffled again; it's
 *              shared by both pages and remembered across visits, so it never repeats until it has been through them all.
 *   clicking   a click on him walks CLICK_CYCLE: idle → wave → spin → arrow → warrior → moonwalk → dance party → salute
 *              → idle…
 *   idling     he does the odd idle action, and dragging turns the camera, which drifts round on its own in between.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}character.glb`;
// Where he stands in the canvas, by default: feet this far down it, and head-top to feet this much of its height
const FRAMING = { feet: 0.92, span: 0.8 };
const PARTY = { hemi: 0.14, key: 0.5, rim: 2.1, spot: 11 }; // the lights at the height of the dance party
const OPENERS_KEY = 'izzy_silver:openers';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const approach = (value, target, amount) => (value < target ? Math.min(value + amount, target) : Math.max(value - amount, target));

let loading = null;

/** Start fetching and reading the model. Safe to call as often as you like; the pages call it early, while idle. */
export function preloadCharacter() {
  if (!loading) {
    loading = loadCharacter(MODEL_URL);
    loading.catch(() => {
      loading = null; // a failed load can be tried again the next time the page opens
    });
  }
  return loading;
}

// ---- the openers' order, shared by every page ------------------------------------------------------------------------
const openerList = reducedMotion ? CALM_OPENERS : OPENERS;
let openers = null; // { order, next }

function shuffle(list, avoidFirst) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // (across the seam between two rounds, never the same one twice in a row)
  if (order.length > 1 && order[0] === avoidFirst) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** The next opener in the shuffled order (a new order once this one runs out). */
function nextOpener() {
  if (!openers) {
    try {
      const saved = JSON.parse(localStorage.getItem(OPENERS_KEY));
      const same = saved?.order?.length === openerList.length && openerList.every((name) => saved.order.includes(name));
      if (same && Number.isInteger(saved.next)) openers = saved;
    } catch {
      /* storage blocked or garbled: start a fresh order */
    }
    openers ??= { order: shuffle(openerList), next: 0 };
  }
  if (openers.next >= openers.order.length) openers = { order: shuffle(openerList, openers.order.at(-1)), next: 0 };
  const name = openers.order[openers.next++];
  try {
    localStorage.setItem(OPENERS_KEY, JSON.stringify(openers));
  } catch {
    /* as above: it only keeps the order going across visits */
  }
  return name;
}

/**
 * `column` is the box he stands in, and takes the clicks and drags. The canvas can be larger than it (CSS), and lets the
 * mouse through, so he can step, kick and moonwalk past the column's edges over the page (and the odd word) without
 * being cut off; `framing` places him in the column, not the canvas.
 * @param {{ canvas: HTMLCanvasElement, column?: HTMLElement, framing?: { feet: number, span: number } }} options
 * @returns the character, not yet running: call reset() and start() when it's on screen, and stop() when it isn't
 */
export async function createPanelCharacter({ canvas, column = canvas, framing = FRAMING }) {
  const character = cloneCharacter(await preloadCharacter());
  // the column's framing, as a share of the canvas around it (read on every resize)
  const inCanvas = {
    get feet() {
      const c = canvas.getBoundingClientRect();
      const b = column.getBoundingClientRect();
      return c.height ? (b.top - c.top + framing.feet * b.height) / c.height : framing.feet;
    },
    get span() {
      const c = canvas.getBoundingClientRect();
      return c.height ? (framing.span * column.getBoundingClientRect().height) / c.height : framing.span;
    },
  };
  const stage = createStage(canvas, { framing: inCanvas, events: column });

  character.root.position.y = character.floorOffset;
  stage.scene.add(character.root);
  stage.frame(character.height);

  const hitProxies = createHitProxies(character.bones, character.root);
  stage.scene.add(hitProxies.group);

  // (not the entrances: the swim is meant to stay up at swimming height, and the others travel on their own anchors)
  const everyClip = [...Object.values(CLIPS), ...DANCE.clips, ...CLICK_CYCLE.flatMap((entry) => entry.clips ?? [])];
  const animator = createAnimator({
    mixer: character.mixer,
    actions: character.actions,
    root: character.root,
    // (clips that float are dropped to the floor; clips that travel are shifted to end in the middle: scene/character.js)
    groundLift: measureGroundLift(character, [...new Set(everyClip)]),
    anchors: measureAnchors(character, Object.values(ENTRANCES), CLIPS.idle),
  });
  animator.playRest('idle', { fade: 0 });

  // ---- the dance party: the lights go dark and colourful while he dances ------------------------------------------
  const { lights } = stage;
  const spot = new THREE.SpotLight(0xffffff, 0, 0, 0.5, 0.9, 0);
  spot.position.set(0, 5.5, 1.6);
  spot.target.position.set(0, 0.9, 0);
  stage.scene.add(spot, spot.target);
  const baseKey = lights.key.color.clone();
  const baseRim = lights.rim.color.clone();
  const color = new THREE.Color();
  const tint = (light, hue, lightness = 0.55) => light.color.setHSL(hue / 360, 0.95, lightness, THREE.SRGBColorSpace);
  const party = { active: false, level: 0, target: 0, clock: 0 };

  function startParty() {
    const started = animator.playSequence(DANCE.clips, {
      then: 'idle',
      onDone: () => (party.target = 0), // (finished, or cut short by a click or a new arrival: the lights come back either way)
    });
    if (!started) return false;
    Object.assign(party, { active: true, target: 1, clock: 0 });
    stage.holdCamera('party'); // stop the slow orbit…
    stage.easeToFront(1); // …and turn to face the dancer
    return true;
  }

  function updateParty(dt) {
    if (!party.active) return;
    party.clock += dt;
    party.level = approach(party.level, party.target, dt / DANCE.fade);
    const e = ease(party.level);
    const hue = (party.clock * 38) % 360; // a full colour cycle every ~9.5 s
    const beat = (party.clock * DANCE.bpm) / 60;
    const pulse = reducedMotion ? 0.92 : 0.84 + 0.16 * Math.pow(0.5 + 0.5 * Math.cos(beat * Math.PI * 2), 2);
    lights.hemi.intensity = lerp(lights.base.hemi, PARTY.hemi, e);
    tint(spot, hue);
    spot.intensity = PARTY.spot * e * pulse;
    color.copy(baseKey);
    tint(lights.key, hue + 240);
    lights.key.color.lerp(color, 1 - e);
    lights.key.intensity = lerp(lights.base.key, PARTY.key, e);
    color.copy(baseRim);
    tint(lights.rim, hue + 120);
    lights.rim.color.lerp(color, 1 - e);
    lights.rim.intensity = lerp(lights.base.rim, PARTY.rim, e) * (0.9 + 0.1 * pulse);
    if (party.target === 0 && party.level === 0) endParty();
  }

  /** Hand the lights back exactly as they were. */
  function endParty() {
    party.active = false;
    party.level = party.target = 0;
    lights.hemi.intensity = lights.base.hemi;
    lights.key.intensity = lights.base.key;
    lights.rim.intensity = lights.base.rim;
    lights.key.color.copy(baseKey);
    lights.rim.color.copy(baseRim);
    spot.intensity = 0;
    stage.releaseCamera('party');
  }

  // ---- clicking: the next thing in CLICK_CYCLE ---------------------------------------------------------------------
  let step = 0; // where he is in CLICK_CYCLE

  function click() {
    animator.interrupt(); // (anything he's in the middle of, the dance included, is cut short)
    stage.releaseCamera('entrance');
    // treading water (after the swim) is outside the cycle: a click brings him back to idle, its start
    step = animator.getState().rest === 'tread' ? 0 : (step + 1) % CLICK_CYCLE.length;
    const entry = CLICK_CYCLE[step];
    if (typeof entry === 'string') animator.playRest(entry);
    else if (entry.dance) startParty();
    else animator.playSequence(entry.clips, { then: entry.then ?? 'idle' });
  }

  createPicking({ canvas, target: column, camera: stage.camera, hitProxies, onCharacterClick: click });

  // ---- arriving ------------------------------------------------------------------------------------------------------
  /**
   * How far his column's edge is from the centre at his distance, in metres (the moonwalk starts just past it, so he only
   * crosses a little of the page beside him).
   */
  const halfWidth = () => {
    const { camera, controls } = stage;
    const canvasHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(controls.target) * camera.aspect;
    return canvasHalf * (column.clientWidth / (canvas.clientWidth || 1));
  };

  function arrive() {
    const name = nextOpener();
    step = 0;
    if (name === 'dance') {
      animator.playRest('idle', { fade: 0 });
      startParty();
      return name;
    }
    const def = ENTRANCES[name];
    const started = animator.playEntrance(name, { halfWidth: halfWidth(), onDone: () => stage.releaseCamera('entrance') });
    if (def.rest) step = Math.max(0, CLICK_CYCLE.indexOf(def.rest)); // (a click during the wave carries on from the wave)
    // arrivals that travel need the camera to stay put, facing the front, until they're over
    if (started && (def.travel || def.anchor)) stage.holdCamera('entrance');
    return name;
  }

  // ---- running -------------------------------------------------------------------------------------------------------
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
      updateParty(dt);
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

  /** A fresh start for each visit: seen from the front, arriving with the next opener. Returns the opener's name. */
  function reset() {
    animator.abortSequence(); // (a dance left running when the page was hidden)
    if (party.active) endParty();
    stage.releaseCamera('entrance');
    stage.snapToFront();
    return arrive();
  }

  return {
    stage,
    animator,
    start,
    stop,
    reset,
    click,
    get running() {
      return running;
    },
  };
}
