import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FACE_LIFT } from '../config.js';

/**
 * Face lift: the head scan on the say hi page, which you can grab and stretch like rubber (after the SM64
 * title-screen toy).
 *
 * - Press on the head to grab that spot of the surface and drag. Every vertex within `radius` of it follows the pointer,
 *   most strongly at the spot itself and less and less toward the edge (a smooth bump, so it pulls like rubber and never
 *   comes to a point). The pull happens in the plane facing the camera, so it goes wherever the pointer goes.
 * - The stretch stays until you reset: right-click, or the on-screen button (the page calls `reset()`).
 * - Press on empty space and drag to orbit the camera a little instead.
 *
 * Everything is measured in "head heights": the scan is scaled to be 1 tall (see readHead), so the numbers in
 * FACE_LIFT in config.js mean the same thing whatever size the file is.
 */

const HEAD_URL = `${import.meta.env.BASE_URL}head.glb`;
const FOV = 24; // narrow lens: flatter, less distorted portrait
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const rad = THREE.MathUtils.degToRad;
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
/** 1 at the grabbed spot, flat there, easing to exactly 0 (with no slope) at the edge of the radius: no point, no crease. */
const falloff = (t) => (1 - t * t) ** 3;

// ---- loading ---------------------------------------------------------------------------------------------------------
let headPromise = null;

/** Start fetching and reading head.glb. Safe to call as often as you like; the page calls it early, while idle. */
export function preloadHead() {
  if (!headPromise) {
    headPromise = new GLTFLoader().loadAsync(HEAD_URL).then(readHead);
    headPromise.catch(() => {
      headPromise = null; // a failed load can be tried again the next time the page opens
    });
  }
  return headPromise;
}

/** A plain, editable float attribute (the file's own could be interleaved or quantised). */
function plain(attribute) {
  if (attribute.isBufferAttribute && attribute.array instanceof Float32Array && !attribute.normalized) return attribute;
  const copy = new THREE.BufferAttribute(new Float32Array(attribute.count * 3), 3);
  for (let i = 0; i < attribute.count; i++) copy.setXYZ(i, attribute.getX(i), attribute.getY(i), attribute.getZ(i));
  return copy;
}

/**
 * Pull the first mesh out of the file and stand it up: node transforms baked in, centred on the origin, one unit tall.
 * (The Blender export carries a 90° rotation on the node and the head sits where it did on the full-body scan, so a
 * new export needs no preparation: drop it in as public/head.glb.)
 */
function readHead(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let source = null;
  gltf.scene.traverse((object) => {
    if (!source && object.isMesh) source = object;
  });
  if (!source) throw new Error('head.glb has no mesh in it');

  const geometry = source.geometry.clone();
  geometry.applyMatrix4(source.matrixWorld);
  if (FACE_LIFT.turn) geometry.rotateY(FACE_LIFT.turn);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z);
  geometry.scale(1 / size.y, 1 / size.y, 1 / size.y);

  geometry.setAttribute('position', plain(geometry.getAttribute('position')));
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  geometry.setAttribute('normal', plain(geometry.getAttribute('normal')));
  if (!geometry.index) geometry.setIndex([...Array(geometry.getAttribute('position').count).keys()]);

  return { geometry, map: source.material.map ?? null, width: size.x / size.y };
}

/**
 * The scan's UV seams split vertices: two or more sit on the very same spot. They all move together (a vertex's pull only
 * depends on where it is), but their normals have to be worked out together too or the seams would show as creases.
 * Returns, for every vertex, the id of the spot it sits on.
 */
function weld(positions) {
  const spots = new Map();
  const spotOf = new Uint32Array(positions.length / 3);
  for (let i = 0; i < spotOf.length; i++) {
    const key = `${Math.round(positions[i * 3] * 1e5)},${Math.round(positions[i * 3 + 1] * 1e5)},${Math.round(positions[i * 3 + 2] * 1e5)}`;
    let id = spots.get(key);
    if (id === undefined) {
      id = spots.size;
      spots.set(key, id);
    }
    spotOf[i] = id;
  }
  return { spotOf, spots: spots.size };
}

// ---- the toy ---------------------------------------------------------------------------------------------------------
/**
 * @param {{ canvas: HTMLCanvasElement }} options  the canvas fills its parent; the parent is what listens for presses
 * @returns the head, not yet running: call start() when it is on screen and stop() when it isn't
 */
export async function createFaceLift({ canvas }) {
  const host = canvas.parentElement;
  const head = await preloadHead();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, 4);

  // Soft light. The scan's texture already has its shading baked in, so this only has to add a little shape. The key
  // light drifts slowly from side to side, which is what makes the stretched surface read as 3D.
  const hemi = new THREE.HemisphereLight(0xf1f4f8, 0x4a423c, 1.85);
  const key = new THREE.DirectionalLight(0xfff1e0, 1.15);
  const rim = new THREE.DirectionalLight(0x3fe0c5, 0.55); // the same faint teal edge as the home screen
  rim.position.set(2.4, 1.4, -2.6);
  scene.add(hemi, key, rim);
  let clock = 0;
  const driftLight = () => {
    const angle = -0.55 + (reducedMotion ? 0 : Math.sin(clock * 0.4) * 0.6);
    key.position.set(Math.sin(angle) * 3, 1.7, Math.cos(angle) * 3);
  };
  driftLight();

  // ---- the head ----
  const { geometry } = head;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  position.setUsage(THREE.DynamicDrawUsage);
  normal.setUsage(THREE.DynamicDrawUsage);
  const count = position.count;
  const restPositions = position.array.slice();
  const restNormals = normal.array.slice();
  const triangles = geometry.index.array;
  const { spotOf, spots } = weld(restPositions);
  const sums = new Float32Array(spots * 3);

  const map = head.map;
  if (map) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // the bounds are kept up to date below, but there's no need to ever risk it popping out
  scene.add(mesh);

  /** Smooth normals across the seams, from where the surface is now. */
  function recomputeNormals() {
    const p = position.array;
    sums.fill(0);
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t] * 3;
      const b = triangles[t + 1] * 3;
      const c = triangles[t + 2] * 3;
      const abx = p[b] - p[a];
      const aby = p[b + 1] - p[a + 1];
      const abz = p[b + 2] - p[a + 2];
      const acx = p[c] - p[a];
      const acy = p[c + 1] - p[a + 1];
      const acz = p[c + 2] - p[a + 2];
      const nx = aby * acz - abz * acy; // the cross product's length is the triangle's area, so big triangles count for more
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const sa = spotOf[triangles[t]] * 3;
      const sb = spotOf[triangles[t + 1]] * 3;
      const sc = spotOf[triangles[t + 2]] * 3;
      sums[sa] += nx;
      sums[sa + 1] += ny;
      sums[sa + 2] += nz;
      sums[sb] += nx;
      sums[sb + 1] += ny;
      sums[sb + 2] += nz;
      sums[sc] += nx;
      sums[sc + 1] += ny;
      sums[sc + 2] += nz;
    }
    const n = normal.array;
    for (let i = 0; i < count; i++) {
      const s = spotOf[i] * 3;
      const length = Math.hypot(sums[s], sums[s + 1], sums[s + 2]) || 1;
      n[i * 3] = sums[s] / length;
      n[i * 3 + 1] = sums[s + 1] / length;
      n[i * 3 + 2] = sums[s + 2] / length;
    }
    normal.needsUpdate = true;
  }

  /** The surface changed: tell the GPU, redo the normals, and keep the bounds honest so picking still finds it. */
  function commit() {
    position.needsUpdate = true;
    recomputeNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  // ---- camera ----
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.45;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null }; // right-click is reset
  // Only a little way round: the scan is open at the back and underneath.
  controls.minAzimuthAngle = -rad(FACE_LIFT.swing);
  controls.maxAzimuthAngle = rad(FACE_LIFT.swing);
  controls.minPolarAngle = rad(68);
  controls.maxPolarAngle = rad(106);
  canvas.style.touchAction = 'none'; // a drag on the head is the toy, not a page scroll

  let sizedTo = '';
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    // Setting a canvas's size wipes it even to the same values, and a hidden page measures 0: only act on a real change.
    if (!width || !height || sizedTo === `${width}x${height}`) return;
    sizedTo = `${width}x${height}`;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;

    // Distance: the head fills `span` of the height, unless that would make it wider than `maxWidth` of the screen.
    const tanHalf = Math.tan(rad(FOV / 2));
    const distance = Math.max(1 / (2 * tanHalf * FACE_LIFT.span), head.width / (2 * tanHalf * camera.aspect * FACE_LIFT.maxWidth));
    const offset = camera.position.clone().sub(controls.target);
    camera.position.copy(controls.target).add(offset.setLength(distance));
    // Then slide the picture so the head's centre lands on `centerY` rather than dead centre.
    camera.setViewOffset(width, height, 0, (0.5 - FACE_LIFT.centerY) * height, width, height);
    camera.updateProjectionMatrix();
    controls.update();
    renderNow();
  }
  new ResizeObserver(resize).observe(host);

  // ---- grabbing ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aimAt = (event) => {
    const rect = canvas.getBoundingClientRect(); // (measured each time: the page is sliding in when it first appears)
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((event.clientY - rect.top) / rect.height) * 2);
    raycaster.setFromCamera(ndc, camera);
  };
  const pick = (event) => {
    aimAt(event);
    return raycaster.intersectObject(mesh, false)[0] ?? null;
  };

  let running = false;
  let deformed = false;
  let grab = null; // { id, point, plane, base, ids, weights, offset, target, released }
  let resetting = null; // { from, time }
  let hover = null; // the last pointer position over the canvas, waiting to be checked in the next frame

  const normalOfPlane = new THREE.Vector3();
  const pullPoint = new THREE.Vector3();

  function beginGrab(point, id) {
    resetting = null; // grabbing during a reset takes over from wherever it has got to
    const base = position.array.slice();
    const reach = FACE_LIFT.radius;
    const near = [];
    for (let i = 0; i < count; i++) {
      const dx = base[i * 3] - point.x;
      const dy = base[i * 3 + 1] - point.y;
      const dz = base[i * 3 + 2] - point.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < reach * reach) near.push([i, falloff(Math.sqrt(d2) / reach)]);
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(normalOfPlane).negate(), point);
    grab = {
      id,
      point: point.clone(),
      plane,
      base,
      ids: Uint32Array.from(near, ([i]) => i),
      weights: Float32Array.from(near, ([, w]) => w),
      offset: new THREE.Vector3(),
      target: new THREE.Vector3(),
      released: false,
    };
    canvas.classList.add('is-grabbing');
  }

  /** Where the pointer is (already aimed by aimAt) decides how far the grabbed spot is pulled. */
  function pull() {
    if (!raycaster.ray.intersectPlane(grab.plane, pullPoint)) return;
    grab.target.subVectors(pullPoint, grab.point);
    const length = grab.target.length();
    if (length > FACE_LIFT.maxPull) grab.target.multiplyScalar(FACE_LIFT.maxPull / length);
  }

  function applyGrab() {
    const { base, ids, weights, offset } = grab;
    const p = position.array;
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k] * 3;
      const w = weights[k];
      p[i] = base[i] + offset.x * w;
      p[i + 1] = base[i + 1] + offset.y * w;
      p[i + 2] = base[i + 2] + offset.z * w;
    }
    if (offset.lengthSq() > 1e-10) deformed = true; // (a click that doesn't move anything leaves the head as it was)
    commit();
  }

  const letGo = (event) => {
    if (!grab || event.pointerId !== grab.id) return;
    grab.released = true; // the surface keeps easing to where the pointer let go, then stays there
    canvas.classList.remove('is-grabbing');
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  };

  // Capture phase on the parent: this runs before the orbit controls (which listen on the canvas itself) get to see the
  // press, so a press that lands on the head can be kept from also starting an orbit.
  host.addEventListener(
    'pointerdown',
    (event) => {
      if (!running || !event.isPrimary || event.button !== 0 || event.ctrlKey || (grab && !grab.released)) return;
      const hit = pick(event);
      if (!hit) return; // empty space: the orbit controls take it
      event.stopPropagation();
      if (grab) {
        // the last drag was still easing in to where it let go: finish it off so the new one starts from the true surface
        grab.offset.copy(grab.target);
        applyGrab();
        grab = null;
      }
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer is already gone; the drag just won't outlive the canvas */
      }
      beginGrab(hit.point, event.pointerId);
    },
    true,
  );
  canvas.addEventListener('pointermove', (event) => {
    if (grab && !grab.released && event.pointerId === grab.id) {
      aimAt(event);
      pull();
    } else if (event.pointerType === 'mouse') {
      hover = { clientX: event.clientX, clientY: event.clientY };
    }
  });
  canvas.addEventListener('pointerup', letGo);
  canvas.addEventListener('pointercancel', letGo);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    canvas.classList.remove('is-over-head');
  });
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!grab || grab.released) reset(); // (a long press on a phone shouldn't undo the stretch that is being made)
  });

  // ---- reset ----
  /** Bring back the original head: eased over FACE_LIFT.resetMs, or straight away with { animate: false }. */
  function reset({ animate = true } = {}) {
    grab = null;
    canvas.classList.remove('is-grabbing');
    if (!deformed) return;
    if (!animate || reducedMotion) {
      position.array.set(restPositions);
      normal.array.set(restNormals);
      position.needsUpdate = normal.needsUpdate = true;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      deformed = false;
      resetting = null;
      return;
    }
    resetting = { from: position.array.slice(), time: 0 };
  }

  // ---- frame ----
  /** Advance everything by `dt` seconds. (The render loop calls this; so can a test.) */
  function step(dt) {
    clock += dt;
    driftLight();
    controls.update(dt);

    if (grab) {
      grab.offset.lerp(grab.target, 1 - Math.exp(-dt * FACE_LIFT.follow));
      if (grab.released && grab.offset.distanceToSquared(grab.target) < 1e-8) grab.offset.copy(grab.target);
      applyGrab();
      if (grab.released && grab.offset.equals(grab.target)) grab = null;
    } else if (resetting) {
      resetting.time += dt * 1000;
      const k = easeOutCubic(Math.min(resetting.time / FACE_LIFT.resetMs, 1));
      const { from } = resetting;
      const p = position.array;
      for (let i = 0; i < p.length; i++) p[i] = from[i] + (restPositions[i] - from[i]) * k;
      commit();
      if (k >= 1) {
        position.array.set(restPositions);
        normal.array.set(restNormals); // exactly the file's own, not a recomputed copy
        normal.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        resetting = null;
        deformed = false;
      }
    }

    if (hover && !grab) {
      canvas.classList.toggle('is-over-head', !!pick(hover));
      hover = null;
    }
  }

  function renderNow() {
    renderer.render(scene, camera);
  }

  let last = 0;
  const tick = (now) => {
    step(Math.min(Math.max((now - last) / 1000, 0), 0.1));
    last = now;
    renderNow();
  };

  return {
    mesh,
    camera,
    controls,
    step,
    render: renderNow,
    reset,
    get deformed() {
      return deformed || !!grab;
    },
    get running() {
      return running;
    },

    /** Begin drawing: call once the page is on screen. The canvas fades itself in after the first frame. */
    start() {
      running = true;
      resize();
      last = performance.now();
      step(0);
      renderNow(); // the first frame is already painted (and its texture uploaded) before anything fades in
      canvas.classList.add('is-ready');
      renderer.setAnimationLoop(tick);
    },

    /** Stop drawing (the last frame stays on screen while the page fades out) and let go of anything held. */
    stop() {
      running = false;
      renderer.setAnimationLoop(null);
      if (grab) {
        canvas.classList.remove('is-grabbing');
        grab = null;
      }
      hover = null;
      canvas.classList.remove('is-over-head');
    },
  };
}
