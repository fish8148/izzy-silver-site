import * as THREE from 'three';
import { CLIPS, DANCE, ENTRANCES, FIRST_ENTRANCES, RETURN_ENTRANCES } from '../config.js';
import { createDanceParty } from '../features/dance-party.js';
import { createAnimator } from './animator.js';
import { createHitProxies, loadCharacter, measureAnchors, measureGroundLift } from './character.js';
import { createPicking } from './picking.js';
import { createStage } from './stage.js';

const MODEL_URL = `${import.meta.env.BASE_URL}character.glb`;

// How far above the top of the head the nametag floats (metres).
const NAMETAG_LIFT = 0.12;

/**
 * Boots the 3D hero. Everything else on the page works even if this fails.
 * @param {{ nametag: ReturnType<typeof import('../ui/nametag.js').createNametag>,
 *           menu: ReturnType<typeof import('../ui/interact-menu.js').createInteractMenu> }} ui
 */
export async function startScene({ nametag, menu }) {
  const canvas = document.getElementById('stage');
  const hero = document.getElementById('top');
  const loaderEl = document.getElementById('loader');
  const loaderBar = loaderEl.querySelector('.hero__loader-bar');
  const showHitVolumes = new URLSearchParams(location.search).has('hit');

  const showFallback = (message) => {
    loaderEl.classList.add('is-done');
    const note = document.createElement('p');
    note.className = 'hero__fallback';
    note.textContent = message;
    hero.append(note);
  };

  let stage;
  try {
    stage = createStage(canvas);
  } catch (error) {
    console.warn('WebGL unavailable', error);
    showFallback("your browser couldn't start the 3D scene — the rest of the site still works.");
    return;
  }

  let character;
  try {
    character = await loadCharacter(MODEL_URL, (event) => {
      if (event.lengthComputable && event.total) {
        loaderBar.style.setProperty('--progress', String(Math.max(0.08, event.loaded / event.total)));
      }
    });
  } catch (error) {
    console.error('Failed to load character.glb', error);
    showFallback("couldn't load the 3D character — the rest of the site still works.");
    return;
  }

  // Stand the character on the floor and frame the camera around them.
  character.root.position.y = character.floorOffset;
  stage.scene.add(character.root);
  stage.frame(character.height);

  const hitProxies = createHitProxies(character.bones, character.root);
  stage.scene.add(hitProxies.group);
  hitProxies.setVisible(showHitVolumes);

  // Clips that never touch the floor get dropped back down (see measureGroundLift), and clips that carry their own
  // travel (a swing, a climb) are shifted so they finish at the centre (see measureAnchors).
  const groundLift = measureGroundLift(character, [...Object.values(CLIPS), ...DANCE.clips]);
  const anchors = measureAnchors(character, Object.values(ENTRANCES), CLIPS.idle);

  const animator = createAnimator({
    mixer: character.mixer,
    actions: character.actions,
    root: character.root,
    groundLift,
    anchors,
  });

  createPicking({
    canvas,
    camera: stage.camera,
    hitProxies,
    onCharacterClick: () => animator.cycle(),
  });

  // ---- interact menu -> features -----------------------------------------------------
  const party = createDanceParty({
    stage,
    animator,
    hero,
    stopButton: document.getElementById('party-stop'),
    onBusyChange: (busy) => menu.setBusy('dance', busy),
  });
  menu.on('dance', () => party.start());

  // ---- entrances: how he arrives ----
  // The first time the home screen shows, he waves or salutes, then idles. It's a different one from the last time the page
  // was loaded (remembered in localStorage), so reloading always gives the other. Each time you come back from a page he
  // arrives some other way (a swing, a moonwalk, a swim, a climb). A page you deep-linked straight onto counts as not having
  // seen the home screen yet, so the first return from it gets the greeting.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GREETING_KEY = 'izzy_silver:greeting';
  const lastGreeting = () => {
    try {
      return localStorage.getItem(GREETING_KEY);
    } catch {
      return null; // (storage blocked, private window…: it's only for variety, so a plain random pick will do)
    }
  };
  const rememberGreeting = (name) => {
    try {
      localStorage.setItem(GREETING_KEY, name);
    } catch {
      /* as above */
    }
  };
  let greeted = false;
  let lastReturn = null;
  const pick = (list, avoid) => {
    const options = list.length > 1 ? list.filter((name) => name !== avoid) : list; // never the same one twice in a row
    return options[Math.floor(Math.random() * options.length)];
  };

  /** How far the screen's edge is from the centre at the character's distance, in metres (where the moonwalk starts). */
  const halfWidth = () => {
    const { camera, controls } = stage;
    return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.distanceTo(controls.target) * camera.aspect;
  };

  function enter() {
    const first = !greeted;
    if (!first && reducedMotion) return; // no big arrivals for people who asked for less motion
    greeted = true;
    const name = first ? pick(FIRST_ENTRANCES, lastGreeting()) : pick(RETURN_ENTRANCES, lastReturn);
    if (first) rememberGreeting(name);
    else lastReturn = name;
    const started = animator.playEntrance(name, { halfWidth: halfWidth(), onDone: () => stage.releaseCamera('entrance') });
    // Arrivals with travel need the camera to stay put, facing the front, until they're over. The greeting stays where it
    // is, so the camera keeps its slow orbit while he waves.
    if (started && !first) stage.holdCamera('entrance');
  }

  // (dev only: /?poster renders the loading still instead of starting up, see poster.js)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('poster')) {
    const { capturePoster } = await import('./poster.js');
    return capturePoster({ stage, character, canvas });
  }

  if (!hero.classList.contains('is-page-open')) enter();

  canvas.classList.add('is-ready');
  loaderEl.classList.add('is-done');

  // ---- render loop: paused while the hero is off-screen, the tab is hidden, or a page is open ----
  let heroVisible = true;
  let pageOpen = hero.classList.contains('is-page-open'); // true when deep-linked straight onto a page
  let last = performance.now();
  const syncPaused = () => party.setPaused(!heroVisible || document.hidden || pageOpen);
  hero.addEventListener('page:opening', () => party.stop()); // leaving for a page ends the party
  hero.addEventListener('page:opened', () => {
    pageOpen = true;
    syncPaused();
  });
  // Start rendering again as soon as the page begins to close, while the canvas is still invisible, so the
  // character is already a live, warmed-up frame (not a stale one) by the time it fades back in. The camera turns to face
  // the front now too, unseen, so the arrival is always seen from the front.
  hero.addEventListener('page:closing', () => {
    pageOpen = false;
    last = performance.now();
    stage.snapToFront();
    syncPaused();
  });
  // The canvas starts to fade back in: this is when he arrives.
  hero.addEventListener('page:returning', enter);
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    last = performance.now();
    syncPaused();
  }).observe(hero);
  document.addEventListener('visibilitychange', syncPaused);

  const anchor = new THREE.Vector3();
  const headTop = character.bones.HeadTop_End ?? character.bones.Head;

  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;
    if (!heroVisible || pageOpen) return;

    animator.update(dt);
    stage.update(dt);
    party.update(dt);
    if (showHitVolumes) hitProxies.update();
    stage.render();

    // Pin the nametag above the head. Read after render so the bone matrices are current.
    headTop.getWorldPosition(anchor);
    anchor.y += NAMETAG_LIFT;
    anchor.project(stage.camera);
    nametag.follow(((anchor.x + 1) / 2) * canvas.clientWidth, ((1 - anchor.y) / 2) * canvas.clientHeight, dt);
  });

  if (import.meta.env.DEV) window.__izzy = { stage, character, animator, hitProxies, groundLift, anchors, party, enter, isRenderPaused: () => pageOpen || !heroVisible };
}
