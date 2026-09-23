import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AUTOROTATE_RESUME_MS, AUTOROTATE_SPEED } from '../config.js';

const FOV = 28; // narrow lens = flatter, less distorted portrait framing
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const readCssNumber = (name, fallback) => {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

const easeInOut = (t) => t * t * (3 - 2 * t);

/**
 * Renderer, camera, orbit controls and lights.
 * The scene is deliberately restrained: soft light, no tone mapping, transparent canvas,
 * so the character sits in the same flat dark world as the page around it.
 */
export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.set(0, 1, 5);

  // ---- lights: gentle three-point rig ------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xe4eaf2, 0x2b2724, 1.55);
  const key = new THREE.DirectionalLight(0xfff0de, 1.7);
  key.position.set(-2.2, 3.4, 3.4);
  // faint accent-colored rim from behind: separates the silhouette from the dark backdrop
  const rim = new THREE.DirectionalLight(0x3fe0c5, 0.75);
  rim.position.set(2.6, 2.4, -3.2);
  scene.add(hemi, key, rim);

  const lights = {
    hemi,
    key,
    rim,
    base: { hemi: hemi.intensity, key: key.intensity, rim: rim.intensity },
  };

  // ---- controls: drag to orbit, nothing else -----------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.autoRotateSpeed = AUTOROTATE_SPEED;
  // Stay near eye level: the floating label layout assumes a roughly level view.
  controls.minPolarAngle = THREE.MathUtils.degToRad(80);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(96);
  // OrbitControls sets touch-action:none, which would trap page scrolling on phones.
  canvas.style.touchAction = 'pan-y';

  // ---- auto-rotate: several things can hold it still; it resumes once all let go -----
  const blockers = new Set();
  let resumeTimer = 0;
  const syncAutoRotate = () => {
    controls.autoRotate = !reducedMotion && blockers.size === 0;
  };
  const block = (key) => {
    blockers.add(key);
    syncAutoRotate();
  };
  const unblock = (key) => {
    blockers.delete(key);
    syncAutoRotate();
  };
  syncAutoRotate();

  let frontEase = null;
  controls.addEventListener('start', () => {
    clearTimeout(resumeTimer);
    frontEase = null; // dragging always wins
    block('drag');
    block('cooldown');
    canvas.classList.add('is-dragging');
  });
  controls.addEventListener('end', () => {
    unblock('drag');
    canvas.classList.remove('is-dragging');
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => unblock('cooldown'), AUTOROTATE_RESUME_MS);
  });

  // ---- framing: put the character where the CSS says it should be -------------------
  let characterHeight = 1.8;
  function frame(height = characterHeight) {
    characterHeight = height;
    const feet = readCssNumber('--frame-feet', 0.87);
    const span = readCssNumber('--frame-span', 0.66);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

    // Feet sit at `feet` of the viewport height and the head-top `span` above them.
    const distance = height / (2 * tanHalf * span);
    const targetY = ((2 * feet - 1) * height) / (2 * span);

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-6) offset.set(0, 0.06, 1);
    offset.setLength(distance);
    controls.target.set(0, targetY, 0);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  let sizedTo = '';
  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    // Setting a canvas's width/height wipes it, even to the same values. Only do it when the size really changed, so a
    // stray resize callback can't blank the character for a frame.
    if (sizedTo === `${width}x${height}`) return;
    sizedTo = `${width}x${height}`;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frame();
  }
  new ResizeObserver(resize).observe(canvas);

  // Smoothly swing the camera back to face the front of the character.
  function easeToFront(seconds = 1.1) {
    frontEase = { elapsed: 0, duration: seconds, from: controls.getAzimuthalAngle() };
  }

  // The same, instantly. For when nobody can see it happen (the canvas is faded out while a page is open).
  function snapToFront() {
    frontEase = null;
    const offset = camera.position.clone().sub(controls.target);
    const radius = Math.hypot(offset.x, offset.z);
    offset.x = 0;
    offset.z = radius;
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function update(dt) {
    if (frontEase) {
      frontEase.elapsed += dt;
      const k = easeInOut(Math.min(frontEase.elapsed / frontEase.duration, 1));
      // Shortest way around to azimuth 0.
      const from = Math.atan2(Math.sin(frontEase.from), Math.cos(frontEase.from));
      const azimuth = from * (1 - k);
      const offset = camera.position.clone().sub(controls.target);
      const radius = Math.hypot(offset.x, offset.z);
      offset.x = radius * Math.sin(azimuth);
      offset.z = radius * Math.cos(azimuth);
      camera.position.copy(controls.target).add(offset);
      if (k >= 1) frontEase = null;
    }
    controls.update(dt);
  }

  resize();

  return {
    renderer,
    scene,
    camera,
    controls,
    lights,
    frame,
    resize,
    update,
    easeToFront,
    snapToFront,
    holdCamera: (key) => block(key),
    releaseCamera: (key) => unblock(key),
    render: () => renderer.render(scene, camera),
  };
}
