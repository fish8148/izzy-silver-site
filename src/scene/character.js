import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Loads character.glb and returns everything the rest of the app needs:
 * the scene graph, an AnimationMixer, a name -> AnimationAction lookup, and a few bones.
 */
export async function loadCharacter(url, onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder); // the GLB is meshopt-compressed (see scripts/prepare-character.mjs)
  const gltf = await loader.loadAsync(url, onProgress);

  const root = gltf.scene;
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    // Bounds are computed in the bind pose; animated poses (kicks, freezes) can leave them.
    object.frustumCulled = false;
    if (object.material.map) object.material.map.anisotropy = 8;
  });

  // Bones by short name ("Head", "LeftHand", …). GLTFLoader sanitises "mixamorig:Head" to "mixamorig_Head".
  const bones = {};
  root.traverse((object) => {
    if (object.isBone) bones[object.name.replace(/^mixamorig[_:]?/, '')] = object;
  });

  // Standing height, measured in the bind pose.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;

  // name -> clipAction lookup
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

  return { root, mixer, actions, clips: gltf.animations, bones, height, floorOffset: -box.min.y };
}

/**
 * Invisible capsules that follow the skeleton, used for click / hover hit-testing.
 * Raycasting the 130k-vertex skinned mesh directly would stall the main thread on every
 * mouse move; ~20 capsules are effectively free and follow every animation automatically.
 */
export function createHitProxies(bones, root) {
  // [boneA, boneB, radius in metres]
  const spec = [
    ['Hips', 'Spine2', 0.17],
    ['Spine2', 'Neck', 0.16],
    ['Neck', 'Head', 0.07],
    ['Head', 'HeadTop_End', 0.12],
    ['LeftUpLeg', 'RightUpLeg', 0.1],
    ['Spine2', 'LeftArm', 0.075],
    ['Spine2', 'RightArm', 0.075],
    ['LeftArm', 'LeftForeArm', 0.06],
    ['LeftForeArm', 'LeftHand', 0.05],
    ['LeftHand', 'LeftHandIndex4', 0.055],
    ['RightArm', 'RightForeArm', 0.06],
    ['RightForeArm', 'RightHand', 0.05],
    ['RightHand', 'RightHandIndex4', 0.055],
    ['LeftUpLeg', 'LeftLeg', 0.1],
    ['LeftLeg', 'LeftFoot', 0.075],
    ['LeftFoot', 'LeftToeBase', 0.06],
    ['RightUpLeg', 'RightLeg', 0.1],
    ['RightLeg', 'RightFoot', 0.075],
    ['RightFoot', 'RightToeBase', 0.06],
  ];

  const material = new THREE.MeshBasicMaterial({ color: 0xff3366, wireframe: true, visible: false });
  const group = new THREE.Group();
  const segments = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  root.updateMatrixWorld(true);
  for (const [nameA, nameB, radius] of spec) {
    const boneA = bones[nameA];
    const boneB = bones[nameB];
    if (!boneA || !boneB) continue;
    boneA.getWorldPosition(a);
    boneB.getWorldPosition(b);
    // Bone length is constant, so the capsule geometry is built once.
    const length = Math.max(a.distanceTo(b) - radius * 2, 0.01);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 3, 10), material);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    segments.push({ boneA, boneB, mesh });
  }

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  return {
    group,
    /** Snap the capsules onto the current pose. Call right before raycasting. */
    update() {
      for (const { boneA, boneB, mesh } of segments) {
        boneA.getWorldPosition(a);
        boneB.getWorldPosition(b);
        dir.subVectors(b, a);
        if (dir.lengthSq() < 1e-10) dir.copy(up);
        dir.normalize();
        quat.setFromUnitVectors(up, dir);
        mesh.matrix.compose(a.lerp(b, 0.5), quat, one);
        mesh.matrixWorld.copy(mesh.matrix);
      }
    },
    /** Visualise the hit volumes (append ?hit to the URL). */
    setVisible(visible) {
      material.visible = visible;
    },
  };
}

/**
 * Some Mixamo clips are authored at a fixed hip height and never touch the floor
 * (the hurricane kick floats ~0.45 m up). For each named clip, measure how far its lowest
 * foot stays above the floor so the animator can drop such clips back down.
 * Call after the root has been placed on the floor.
 */
export function measureGroundLift(character, names, { threshold = 0.08, samples = 24 } = {}) {
  const { root, mixer, actions, bones } = character;
  const v = new THREE.Vector3();
  const lowestToe = () => {
    root.updateMatrixWorld(true);
    return Math.min(bones.LeftToe_End.getWorldPosition(v).y, bones.RightToe_End.getWorldPosition(v).y);
  };

  mixer.stopAllAction();
  mixer.update(0);
  const restingToeHeight = lowestToe(); // toe bone height when the sole touches the floor

  const lift = {};
  for (const name of names) {
    const action = actions[name];
    if (!action) continue;
    action.reset().play();
    action.paused = false;
    let lowest = Infinity;
    for (let i = 0; i < samples; i++) {
      action.time = (action.getClip().duration * i) / samples;
      mixer.update(0);
      lowest = Math.min(lowest, lowestToe());
    }
    action.stop();
    const gap = lowest - restingToeHeight;
    lift[name] = gap > threshold ? gap : 0;
  }
  mixer.stopAllAction();
  mixer.update(0);
  return lift;
}

/**
 * Some clips carry their own travel: a swing that lands metres away, a climb that ends standing on a ledge. To make one
 * END at the centre of the screen we need to know where its last frame puts the character. For each { clip, anchor } this
 * measures that last frame against the idle pose and returns how far to shift the character so the two match:
 * { [clip]: { x, y, z } } in metres. `anchor` is 'xyz' (also match the height of the feet) or 'xz' (only the spot).
 * Call after the root has been placed on the floor.
 */
export function measureAnchors(character, specs, restClip) {
  const { root, mixer, actions, bones } = character;
  const v = new THREE.Vector3();
  const pose = (name, time) => {
    mixer.stopAllAction();
    const action = actions[name];
    action.reset().play();
    action.paused = false;
    action.time = time;
    mixer.update(0);
    root.updateMatrixWorld(true);
    const hips = bones.Hips.getWorldPosition(v.clone());
    const toe = Math.min(bones.LeftToe_End.getWorldPosition(v).y, bones.RightToe_End.getWorldPosition(v).y);
    action.stop();
    return { hips, toe };
  };

  const rest = pose(restClip, 0);
  const anchors = {};
  for (const { clip, anchor } of specs) {
    const action = actions[clip];
    if (!action || !anchor) continue;
    const end = pose(clip, action.getClip().duration - 1e-3);
    anchors[clip] = {
      x: rest.hips.x - end.hips.x,
      y: anchor.includes('y') ? rest.toe - end.toe : 0,
      z: rest.hips.z - end.hips.z,
    };
  }
  mixer.stopAllAction();
  mixer.update(0);
  return anchors;
}
