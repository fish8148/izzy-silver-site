import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CLICK_SLOP_PX, THINGS } from '../config.js';
import { tilt } from '../ui/tilt.js';

/**
 * My things: a handful of 3D objects floating around like they're loose in a space station.
 *
 * - Everything lives on one flat plane in front of the camera, measured in CSS pixels (y down), so a pointer position *is* a
 *   position in the physics. The camera is set up so that plane maps 1:1 onto the screen.
 * - Objects drift on their own, tumble slowly, bounce off invisible walls at the screen's edges and off each other.
 * - Drag one and let go: it keeps the speed and direction it was let go with, and slowly settles back to a drift.
 * - The header is a wall too: objects bounce off its rectangle so they never drift behind the text. It used to drift
 *   around as one more body itself, but the router now keeps every page's header pinned in place (so hovering it to
 *   open the page menu is reliable) — `start()`'s `static` option (on by default) keeps it from ever floating away.
 * - Click one (a press that hardly moves) and the rest fade away while it swings over to the left, big, spinning slowly
 *   (drag it to spin it). The page shows its text; `back()` floats it home and the others return.
 * - On a phone, tilting it pushes everything (see ui/tilt.js). Only *changes* in tilt count, so a phone held at any
 *   angle is still and things float normally.
 *
 * The shapes are placeholders: give a thing a `model` (a .glb in public/) and it takes the shape's place.
 */

const BASE = import.meta.env.BASE_URL;
const FOV = 30;
const RAD = Math.PI / 180;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const { clamp, lerp } = THREE.MathUtils;
const smooth = (t) => THREE.MathUtils.smootherstep(t, 0, 1);
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const rand = (min, max) => min + Math.random() * (max - min);

// ---- what the things look like ------------------------------------------------------------------------------------------
const SHAPES = {
  box: () => new RoundedBoxGeometry(1.3, 0.9, 0.75, 5, 0.13),
  sphere: () => new THREE.SphereGeometry(1, 48, 32),
  torus: () => new THREE.TorusGeometry(0.72, 0.3, 32, 72),
  cone: () => new THREE.ConeGeometry(0.75, 1.5, 56),
  dodecahedron: () => new THREE.DodecahedronGeometry(1, 0),
  cylinder: () => new THREE.CylinderGeometry(0.62, 0.62, 1.3, 56),
};

/** Every shape is centred and scaled so it just fits inside a sphere of radius 1: then "radius" means the same for all. */
function shapeGeometry(name) {
  const geometry = (SHAPES[name] ?? SHAPES.sphere)();
  geometry.center();
  geometry.computeBoundingSphere();
  const fit = 1 / geometry.boundingSphere.radius;
  geometry.scale(fit, fit, fit);
  return geometry;
}

const models = new Map(); // url -> Promise<Group> (centred, one unit in radius)

function loadModel(url) {
  if (!models.has(url)) {
    models.set(
      url,
      new GLTFLoader().loadAsync(`${BASE}${url}`).then((gltf) => {
        const sphere = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere());
        gltf.scene.position.sub(sphere.center);
        const wrapper = new THREE.Group();
        wrapper.add(gltf.scene);
        wrapper.scale.setScalar(1 / sphere.radius);
        return wrapper;
      }),
    );
  }
  return models.get(url);
}

async function buildVisual(thing) {
  const materials = [];
  const group = new THREE.Group(); // scaled to the object's on-screen radius
  let visual = null;
  if (thing.model) {
    try {
      visual = (await loadModel(thing.model)).clone(true);
      visual.traverse((node) => {
        if (!node.isMesh) return;
        // (its own copies, so fading one thing never touches another)
        node.material = Array.isArray(node.material) ? node.material.map((m) => m.clone()) : node.material.clone();
        materials.push(...[node.material].flat());
      });
    } catch (error) {
      console.warn(`Couldn't load ${thing.model}; using the ${thing.shape} instead`, error);
    }
  }
  if (!visual) {
    const material = new THREE.MeshStandardMaterial({
      color: thing.color ?? '#cccccc',
      roughness: 0.42,
      metalness: 0.08,
      flatShading: thing.shape === 'dodecahedron',
    });
    materials.push(material);
    visual = new THREE.Mesh(shapeGeometry(thing.shape), material);
  }
  group.add(visual);
  return { group, materials };
}

// ---- the world -------------------------------------------------------------------------------------------------------------
/**
 * @param {{ canvas: HTMLCanvasElement, things: object[], onSelect?: (thing) => void, onDeselect?: () => void }} options
 *        the canvas fills its parent, and its size is the size of the world
 */
export async function createFloatingThings({ canvas, things, onSelect = () => {}, onDeselect = () => {} }) {
  const host = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);

  // A soft studio environment for the reflections, a key light for form, and the same faint teal edge as the home screen.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff3e6, 1.15);
  key.position.set(-700, 1000, 1300);
  const rim = new THREE.DirectionalLight(0x3fe0c5, 0.5);
  rim.position.set(1000, 300, -900);
  scene.add(key, rim);

  // ---- the bodies ----
  const bodies = await Promise.all(
    things.map(async (thing, index) => {
      const { group, materials } = await buildVisual(thing);
      const body = {
        thing,
        index,
        group,
        materials,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: 1, // how big it's drawn, px
        cr: 1, // how big it is to the others (a bit inside the drawing: shapes don't fill their circle)
        m: 1,
        q: new THREE.Quaternion().random(),
        w: new THREE.Vector3(), // where it's tumbling
        idleW: new THREE.Vector3(),
        spin: 1, // 0..1: how much of its tumble is on (it's off while it's the one that's open)
        appear: 0, // 0..1, the pop in when the page opens
        delay: 0.2 + index * 0.11,
        hover: 0,
        alpha: 1,
        dragged: false,
        tx: 0, // where the pointer wants it, while it is being dragged
        ty: 0,
      };
      group.userData.body = body;
      scene.add(group);
      return body;
    }),
  );

  // The header: one more floating thing, but a rectangle that lives in the DOM (see start()).
  const header = {
    floater: null,
    label: null,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hw: 0,
    hh: 0,
    m: 1,
    rest: { x: 0, y: 0 }, // where the router put it: centre, px
    mode: 'home', // home (sitting at rest) | homing (gliding there) | float
    static: false, // true: a wall the objects bounce off of, but it never drifts (the router now keeps it hoverable)
    wait: 0, // seconds still to sit at rest after the page opens, so it can finish arriving
    t: 0,
    from: { x: 0, y: 0 },
    resolve: null,
  };

  let W = 0;
  let H = 0;
  let running = false;
  let closing = false; // the page is leaving: the header must stay (or get) home so the router can measure it
  let time = 0;
  let sel = null; // the open object: { body, t, dir, yaw, pitch, yawVel, resolve }
  let drag = null;
  let hover = null;
  let hoverBody = null;
  const push = { ax: 0, ay: 0 }; // what the phone's tilt is pushing with right now, px/s^2

  const scale = () => Math.min(W, H);

  // ---- layout ----
  function sizeBodies() {
    let total = 0;
    for (const b of bodies) {
      b.r = Math.min(THINGS.size * H, THINGS.sizeWide * W) * (b.thing.size ?? 1);
      b.cr = b.r * 0.9;
      b.m = b.r * b.r;
      total += b.m;
    }
    header.m = (total / Math.max(bodies.length, 1)) * THINGS.headerMass;
  }

  /** Where the design has them: a loose cluster on the right (landscape), or spread over the whole screen (portrait). */
  function slots() {
    const landscape = W / H >= 0.9;
    const base = landscape
      ? [[0.505, 0.47], [0.75, 0.29], [0.57, 0.79], [0.775, 0.68], [0.92, 0.48]]
      : [[0.32, 0.22], [0.7, 0.3], [0.3, 0.5], [0.7, 0.58], [0.48, 0.76]];
    const out = base.slice(0, bodies.length);
    while (out.length < bodies.length) out.push(landscape ? [rand(0.45, 0.95), rand(0.12, 0.88)] : [rand(0.15, 0.85), rand(0.1, 0.75)]);
    return out;
  }

  function layout() {
    const spots = slots();
    bodies.forEach((b, i) => {
      b.x = (spots[i][0] + rand(-0.015, 0.015)) * W;
      b.y = (spots[i][1] + rand(-0.015, 0.015)) * H;
      launch(b, ...THINGS.drift);
      b.idleW.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(reducedMotion ? 0 : rand(0.22, 0.5));
      b.w.copy(b.idleW);
      b.spin = 1;
      b.appear = 0;
      b.hover = 0;
      b.dragged = false;
    });
    for (let pass = 0; pass < 60; pass++) {
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) separate(bodies[i], bodies[j]);
      bodies.forEach((b) => walls(b, b.cr, b.cr, 0, THINGS.left * W));
    }
  }

  /** Send a body off in a random direction at a random speed within [lo, hi] (screen heights per second). */
  function launch(b, lo, hi) {
    const angle = rand(0, Math.PI * 2);
    const speed = reducedMotion ? 0 : rand(lo, hi) * scale();
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
  }

  function separate(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = a.cr + b.cr;
    const d = Math.hypot(dx, dy) || 0.001;
    if (d >= min) return;
    const push = (min - d) / 2;
    a.x -= (dx / d) * push;
    a.y -= (dy / d) * push;
    b.x += (dx / d) * push;
    b.y += (dy / d) * push;
  }

  // ---- the header ----
  /**
   * Read where the router has put the header (at rest, before any drifting) and how big it is. This measures the floater,
   * not the label: the router animates the label (it may still be growing into place when this runs, after a switch from
   * the page menu), but the floater only ever sits at the header's final spot, wrapped tight around the text.
   */
  function measureHeader() {
    const { floater, label } = header;
    if (!label) return;
    const held = floater.style.transform;
    floater.style.transform = '';
    const box = floater.getBoundingClientRect();
    floater.style.transform = held;
    const stage = host.parentElement.getBoundingClientRect(); // the page itself: the stage slides in, the page doesn't
    header.hw = box.width / 2;
    header.hh = box.height / 2;
    header.rest.x = box.left - stage.left + header.hw;
    header.rest.y = box.top - stage.top + header.hh;
  }

  const placeHeader = () => {
    if (!header.floater) return;
    const dx = header.x - header.rest.x;
    const dy = header.y - header.rest.y;
    header.floater.style.transform = dx || dy ? `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)` : '';
  };

  /** Glide the header back to where the router put it. Resolves once it's there. */
  function headerHome() {
    if (header.mode === 'home') return Promise.resolve();
    header.mode = 'homing';
    header.t = 0;
    header.from.x = header.x;
    header.from.y = header.y;
    header.vx = header.vy = 0;
    return new Promise((resolve) => {
      header.resolve = resolve;
    });
  }

  const headerFloat = () => {
    header.mode = 'float';
    const angle = rand(0, Math.PI * 2);
    const [lo, hi] = THINGS.headerDrift;
    const speed = reducedMotion ? 0 : rand(lo, hi) * scale();
    header.vx = Math.cos(angle) * speed;
    header.vy = Math.sin(angle) * speed;
  };

  // ---- physics ----
  function walls(b, rx, ry, bounce, minX = 0) {
    if (b.x < minX + rx) {
      b.x = minX + rx;
      if (b.vx < 0) b.vx *= -bounce;
    } else if (b.x > W - rx) {
      b.x = W - rx;
      if (b.vx > 0) b.vx *= -bounce;
    }
    if (b.y < ry) {
      b.y = ry;
      if (b.vy < 0) b.vy *= -bounce;
    } else if (b.y > H - ry) {
      b.y = H - ry;
      if (b.vy > 0) b.vy *= -bounce;
    }
  }

  /** Two things in space: push them apart and swap momentum along the line between them. `ia` / `ib` are 1 / mass (0 = immovable). */
  function bump(a, b, nx, ny, overlap, ia, ib) {
    const total = ia + ib;
    if (!total) return;
    const push = overlap / total;
    a.x -= nx * push * ia;
    a.y -= ny * push * ia;
    b.x += nx * push * ib;
    b.y += ny * push * ib;
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing < 0) {
      const j = (-(1 + THINGS.bounce) * closing) / total;
      a.vx -= j * ia * nx;
      a.vy -= j * ia * ny;
      b.vx += j * ib * nx;
      b.vy += j * ib * ny;
    }
  }

  function collide(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = a.cr + b.cr;
    if (dx * dx + dy * dy >= min * min) return;
    const d = Math.hypot(dx, dy) || 0.001;
    bump(a, b, dx / d, dy / d, min - d, a.dragged ? 0 : 1 / a.m, b.dragged ? 0 : 1 / b.m);
  }

  /** A round thing against the header's rectangle. The header is `a`, the round thing `b`; the normal points from the box out. */
  function collideHeader(c) {
    const h = header;
    const nearX = clamp(c.x, h.x - h.hw, h.x + h.hw);
    const nearY = clamp(c.y, h.y - h.hh, h.y + h.hh);
    const dx = c.x - nearX;
    const dy = c.y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= c.cr * c.cr) return;
    let nx;
    let ny;
    let depth; // how far the circle's centre is from the box's surface (negative when it's inside)
    if (d2 > 1e-6) {
      depth = Math.sqrt(d2);
      nx = dx / depth;
      ny = dy / depth;
    } else {
      const gaps = [c.x - (h.x - h.hw), h.x + h.hw - c.x, c.y - (h.y - h.hh), h.y + h.hh - c.y];
      const side = gaps.indexOf(Math.min(...gaps));
      [nx, ny] = [[-1, 0], [1, 0], [0, -1], [0, 1]][side];
      depth = -gaps[side];
    }
    const ia = h.mode === 'float' ? 1 / h.m : 0;
    bump(h, c, nx, ny, c.cr - depth, ia, c.dragged ? 0 : 1 / c.m);
  }

  /** Give a body a bit of spin in the direction it was thrown. */
  function kick(b, vx, vy) {
    const k = 0.55 / Math.max(b.r, 1);
    b.w.x = clamp(b.w.x + vy * k, -7, 7);
    b.w.y = clamp(b.w.y - vx * k, -7, 7);
  }

  function cruise(b, dt, lo, hi) {
    const speed = Math.hypot(b.vx, b.vy);
    if (reducedMotion) {
      const k = Math.exp(-2 * dt);
      b.vx *= k;
      b.vy *= k;
    } else if (speed < lo) {
      if (speed < 0.01) {
        const angle = rand(0, Math.PI * 2);
        b.vx = Math.cos(angle) * lo;
        b.vy = Math.sin(angle) * lo;
      } else {
        const k = 1 + (lo / speed - 1) * Math.min(1, 0.9 * dt); // a slow ease up to the minimum drift, in the same direction
        b.vx *= k;
        b.vy *= k;
      }
    } else if (speed > hi) {
      const k = Math.max(hi / speed, Math.exp(-THINGS.damping * dt)); // thrown fast: keeps going, slowly settles
      b.vx *= k;
      b.vy *= k;
    }
  }

  function physics(dt) {
    const S = scale();
    const wander = 0.05 * S * dt; // a little random nudging so the paths never look ruled

    if (!sel) {
      for (const b of bodies) {
        if (b.dragged) {
          // the pointer has it: ease toward where the pointer wants it, and remember how fast that is (for what it bumps into)
          const follow = 1 - Math.exp(-dt * 30);
          const nx = clamp(lerp(b.x, b.tx, follow), THINGS.left * W + b.cr, W - b.cr);
          const ny = clamp(lerp(b.y, b.ty, follow), b.cr, H - b.cr);
          b.vx = lerp(b.vx, (nx - b.x) / Math.max(dt, 1e-4), 0.5);
          b.vy = lerp(b.vy, (ny - b.y) / Math.max(dt, 1e-4), 0.5);
          b.x = nx;
          b.y = ny;
          continue;
        }
        b.vx += push.ax * dt + rand(-wander, wander);
        b.vy += push.ay * dt + rand(-wander, wander);
        cruise(b, dt, THINGS.drift[0] * S, THINGS.drift[1] * S);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
    }

    if (header.mode === 'float') {
      header.vx += push.ax * dt + rand(-wander, wander) * 0.5;
      header.vy += push.ay * dt + rand(-wander, wander) * 0.5;
      cruise(header, dt, THINGS.headerDrift[0] * S, THINGS.headerDrift[1] * S);
      header.x += header.vx * dt;
      header.y += header.vy * dt;
    }

    if (!sel) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
        if (header.label) bodies.forEach(collideHeader);
        bodies.forEach((b) => !b.dragged && walls(b, b.cr, b.cr, THINGS.bounce, THINGS.left * W));
        if (header.mode === 'float') walls(header, header.hw, header.hh, THINGS.bounce);
      }
    } else if (header.mode === 'float') {
      walls(header, header.hw, header.hh, THINGS.bounce);
    }
  }

  // ---- the open object ----
  /** Where the open object goes, and how big it gets: to the left of the screen (landscape), or up top (portrait). */
  function detailPose() {
    if (W / H >= 0.9) return { x: 0.31 * W, y: 0.47 * H, r: Math.min(0.25 * H, 0.21 * W) };
    return { x: 0.5 * W, y: 0.3 * H, r: Math.min(0.2 * H, 0.34 * W) };
  }

  const detailBase = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, -0.55, 0.12)); // a three-quarter view
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const qDetail = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3(1, 0, 0);

  function select(body) {
    if (sel || !running) return;
    sel = { body, t: 0, dir: 1, yaw: 0, pitch: 0, yawVel: 0.45, resolve: null };
    body.vx = body.vy = 0;
    headerHome();
    onSelect(body.thing);
  }

  function deselect() {
    if (!sel || sel.dir < 0) return Promise.resolve();
    sel.dir = -1;
    onDeselect();
    return new Promise((resolve) => {
      sel.resolve = resolve;
    });
  }

  function updateSelection(dt) {
    if (!sel) return;
    sel.t = clamp(sel.t + (sel.dir * dt) / (sel.dir > 0 ? THINGS.open : THINGS.close), 0, 1);
    if (!(drag && drag.spin)) {
      sel.yaw += sel.yawVel * dt;
      sel.yawVel = lerp(sel.yawVel, reducedMotion ? 0 : 0.45, 1 - Math.exp(-dt * 1.2));
      sel.pitch *= Math.exp(-dt * 0.35);
    }
    if (sel.dir < 0 && sel.t <= 0) {
      sel.body.spin = 0; // its tumble picks up again from a standstill
      const { resolve } = sel;
      sel = null;
      if (header.label && !header.static && header.mode !== 'float' && !closing) headerFloat();
      resolve?.();
    }
  }

  // ---- phone tilt ----
  function updateTilt() {
    const dev = tilt.read();
    push.ax = dev.x * THINGS.tilt * scale();
    push.ay = dev.y * THINGS.tilt * scale();
  }

  // ---- pointer ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * W) / (rect.width || W), y: ((event.clientY - rect.top) * H) / (rect.height || H) };
  };

  /** The object under a point on the screen (the drawn shape, not its bounding circle), or null. */
  function pickAt(x, y) {
    ndc.set((x / W) * 2 - 1, 1 - (y / H) * 2);
    raycaster.setFromCamera(ndc, camera);
    const groups = bodies.filter((b) => b.group.visible && b.alpha > 0.5).map((b) => b.group);
    for (const hit of raycaster.intersectObjects(groups, true)) {
      let node = hit.object;
      while (node && !node.userData.body) node = node.parent;
      if (node) return node.userData.body;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!running || !event.isPrimary || event.button !== 0 || drag) return;
    const p = local(event);
    const hit = pickAt(p.x, p.y);
    const now = performance.now();
    drag = { id: event.pointerId, body: null, spin: false, sx: p.x, sy: p.y, t0: now, moved: false, samples: [{ t: now, x: p.x, y: p.y }], last: p, spinRate: 0 };
    if (!sel && hit) {
      drag.body = hit;
      hit.dragged = true; // it stops drifting the moment it's held
      hit.vx = hit.vy = 0;
      hit.tx = hit.x;
      hit.ty = hit.y;
      drag.ox = hit.x - p.x;
      drag.oy = hit.y - p.y;
    } else if (sel && sel.dir > 0 && hit === sel.body) {
      drag.spin = true;
    }
    if (drag.body || drag.spin) canvas.classList.add('is-dragging');
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer is already gone: the drag just won't follow the pointer off the canvas */
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = local(event);
    if (!drag || event.pointerId !== drag.id) {
      if (event.pointerType === 'mouse') hover = p;
      return;
    }
    const now = performance.now();
    if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > CLICK_SLOP_PX) drag.moved = true;
    if (drag.body && drag.moved) {
      drag.body.tx = p.x + drag.ox;
      drag.body.ty = p.y + drag.oy;
    }
    if (drag.spin && sel) {
      const dt = Math.max((now - drag.samples[drag.samples.length - 1].t) / 1000, 0.004);
      sel.yaw += (p.x - drag.last.x) * 0.011;
      sel.pitch = clamp(sel.pitch + (p.y - drag.last.y) * 0.011, -1.1, 1.1);
      drag.spinRate = lerp(drag.spinRate, ((p.x - drag.last.x) * 0.011) / dt, 0.4);
    }
    drag.samples.push({ t: now, x: p.x, y: p.y });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 110) drag.samples.shift();
    drag.last = p;
  });

  const letGo = (event, cancelled) => {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    canvas.classList.remove('is-dragging');
    const now = performance.now();
    const isClick = !d.moved && !cancelled && now - d.t0 < 600;

    if (d.body) {
      d.body.dragged = false;
      if (isClick) return select(d.body);
      // Thrown: it leaves at the pointer's speed over the last ~0.1 s, and keeps that speed and direction.
      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const span = (last.t - first.t) / 1000;
      let vx = 0;
      let vy = 0;
      if (span > 0.012 && now - last.t < 90) {
        vx = (last.x - first.x) / span;
        vy = (last.y - first.y) / span;
      } // (held still before letting go: it just floats on)
      const cap = THINGS.maxSpeed * scale();
      const speed = Math.hypot(vx, vy);
      if (speed > cap) {
        vx *= cap / speed;
        vy *= cap / speed;
      }
      d.body.vx = vx;
      d.body.vy = vy;
      kick(d.body, vx, vy);
    } else if (d.spin && sel) {
      sel.yawVel = clamp(d.moved && now - d.samples[d.samples.length - 1].t < 90 ? d.spinRate : 0, -7, 7);
    } else if (sel && isClick) {
      deselect(); // a tap on the empty space around it
    }
  };
  canvas.addEventListener('pointerup', (event) => letGo(event, false));
  canvas.addEventListener('pointercancel', (event) => letGo(event, true));
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    hoverBody = null;
    canvas.classList.remove('is-over-thing');
  });

  // ---- frame ----
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    // A hidden page measures 0, and setting a canvas's size wipes it even to the same values: only act on a real change.
    if (!w || !h || (w === W && h === H)) return;
    const first = !W;
    const sx = first ? 1 : w / W;
    const sy = first ? 1 : h / H;
    const ratio = first ? 1 : Math.min(w, h) / Math.min(W, H);
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0, h / 2 / Math.tan((FOV / 2) * RAD)); // exactly far enough that the plane the things live on is 1 px per unit
    camera.updateProjectionMatrix();
    for (const b of bodies) {
      b.x *= sx;
      b.y *= sy;
      b.vx *= ratio;
      b.vy *= ratio;
    }
    header.x *= sx;
    header.y *= sy;
    sizeBodies();
    if (header.label) measureHeader();
    if (first) layout();
    draw();
  }
  new ResizeObserver(resize).observe(host);

  function updateHeader(dt) {
    if (!header.label) return;
    if (header.mode === 'home' && header.wait > 0) {
      header.wait -= dt;
      if (header.wait <= 0) {
        header.wait = 0;
        if (!header.static && !sel && !closing) headerFloat();
      }
    } else if (header.mode === 'homing') {
      header.t = Math.min(header.t + dt / 0.45, 1);
      const k = smooth(header.t);
      header.x = lerp(header.from.x, header.rest.x, k);
      header.y = lerp(header.from.y, header.rest.y, k);
      if (header.t >= 1) {
        header.mode = 'home';
        header.floater.style.transform = '';
        header.resolve?.();
        header.resolve = null;
      }
    }
    if (header.mode !== 'home') placeHeader();
  }

  const dq = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  function step(dt) {
    time += dt;
    updateTilt();
    updateHeader(dt);
    physics(dt);
    updateSelection(dt);

    for (const b of bodies) {
      if (time > b.delay) b.appear = Math.min(b.appear + dt / 0.75, 1);
      const wanted = (b === hoverBody && !sel) || b.dragged ? 1 : 0;
      b.hover = lerp(b.hover, wanted, 1 - Math.exp(-dt * 12));
      if (sel && sel.body === b) continue; // an open object holds still in its own tumble (see draw)
      b.spin = Math.min(b.spin + dt / 1.2, 1);
      b.w.lerp(b.idleW, 1 - Math.exp(-dt * 0.6));
      const angle = b.w.length() * dt * b.spin;
      if (angle > 1e-6) {
        dq.setFromAxisAngle(axis.copy(b.w).normalize(), angle);
        b.q.premultiply(dq).normalize();
      }
    }

    if (hover && !drag) {
      hoverBody = pickAt(hover.x, hover.y);
      canvas.classList.toggle('is-over-thing', !!hoverBody && (!sel || hoverBody === sel.body));
      hover = null;
    }
  }

  function draw() {
    if (!W) return;
    const pose = sel ? detailPose() : null;
    for (const b of bodies) {
      const open = sel && sel.body === b;
      const e = sel ? smooth(sel.t) : 0;
      b.alpha = sel && !open ? 1 - e : 1;

      let x = b.x;
      let y = b.y;
      let r = b.r;
      b.group.quaternion.copy(b.q);
      if (open) {
        x = lerp(b.x, pose.x, e);
        y = lerp(b.y, pose.y, e);
        r = lerp(b.r, pose.r, e);
        qYaw.setFromAxisAngle(up, sel.yaw);
        qPitch.setFromAxisAngle(right, sel.pitch);
        qDetail.copy(qYaw).multiply(qPitch).multiply(detailBase);
        b.group.quaternion.slerp(qDetail, e);
      }

      b.group.visible = b.alpha > 0.003 && b.appear > 0;
      b.group.position.set(x - W / 2, H / 2 - y, open ? e * 60 : 0); // (a little nearer the camera, so it's in front while it moves)
      b.group.scale.setScalar(r * easeOutBack(b.appear) * (1 + 0.06 * b.hover));
      const see = b.alpha < 0.999;
      for (const material of b.materials) {
        material.opacity = b.alpha;
        if (material.transparent !== see) {
          material.transparent = see;
          material.needsUpdate = true;
        }
      }
    }
    renderer.render(scene, camera);
  }

  let last = 0;
  const tick = (now) => {
    step(Math.min(Math.max((now - last) / 1000, 0), 0.05));
    last = now;
    draw();
  };

  return {
    bodies,
    header,
    get tilt() {
      return { ax: push.ax, ay: push.ay };
    },
    step,
    draw,
    select: (id) => {
      const body = bodies.find((b) => b.thing.id === id);
      if (body) select(body);
    },
    get selected() {
      return sel && sel.dir > 0 ? sel.body.thing : null;
    },

    /**
     * The page is on screen: bring everything in fresh and start drifting.
     * `headerEls` are the router's header: its floater and the label inside it. The router now keeps the header
     * pinned in place (so hovering it to open the page menu is reliable), so by default it's `static`: the objects
     * still bounce off its rectangle, but it never drifts away from where the router put it.
     */
    start(headerEls, { static: staticHeader = true } = {}) {
      running = true;
      closing = false;
      sel = null;
      drag = null;
      header.floater = headerEls.floater ?? null;
      header.label = headerEls.label ?? null;
      header.static = staticHeader;
      if (header.floater) header.floater.style.transform = '';
      resize();
      time = 0;
      layout();
      measureHeader();
      header.x = header.rest.x;
      header.y = header.rest.y;
      header.mode = 'home';
      header.wait = 1.4;
      push.ax = push.ay = 0;
      tilt.recenter(); // however the phone is held as the page opens is "normal"
      if (tilt.supported && !tilt.needsPermission) tilt.enable(); // (iPhones have to be asked from a tap: see the page)
      last = performance.now();
      step(0);
      draw();
      canvas.classList.add('is-ready');
      renderer.setAnimationLoop(tick);
    },

    /** The page is starting to leave: close anything open and glide the header back to where the router expects it. */
    settle() {
      closing = true;
      deselect(); // (the page hides its text; the object doesn't need to finish floating back, the page is going)
      return Promise.race([headerHome(), new Promise((resolve) => setTimeout(resolve, 900))]);
    },

    /** Back out of the open object. Returns whether there was one to back out of. */
    back() {
      if (!sel || sel.dir < 0) return false;
      deselect();
      return true;
    },

    stop() {
      running = false;
      renderer.setAnimationLoop(null);
      if (drag) {
        drag.body && (drag.body.dragged = false);
        drag = null;
      }
      hover = null;
      hoverBody = null;
      canvas.classList.remove('is-over-thing', 'is-dragging');
      if (header.floater) header.floater.style.transform = '';
      header.mode = 'home';
      header.wait = 0;
      header.resolve?.();
      header.resolve = null;
    },
  };
}
