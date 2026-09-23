/**
 * Prepares the raw Blender/Mixamo export for the web.
 *
 *   npm run prep:character                       # uses ../izzy_w_animation_rigging_2.glb
 *   npm run prep:character -- path/to/in.glb     # custom input
 *
 * Why this exists: the Blender export contains one armature PER clip (20 of them),
 * but the mesh is only skinned to the first one. Played as-is, only the first clip
 * would move the character. This script:
 *
 *   1. retargets every clip onto the mesh's skeleton (all rigs share the same bones),
 *   2. deletes the orphaned armatures/skins,
 *   3. drops unused textures, dedupes and resamples the animation curves,
 *   4. converts textures to WebP and meshopt-compresses the geometry.
 *
 * The original file is never modified. Output goes to public/character.glb,
 * which is committed so deploys don't need to run this script.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const input = resolve(process.argv[2] ?? '../izzy_w_animation_rigging_2.glb');
const output = resolve(process.argv[3] ?? 'public/character.glb');
const mb = (path) => (statSync(path).size / 1048576).toFixed(2) + ' MB';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// --- 1. find the armature the mesh is skinned to -------------------------------
const hasMesh = (node) => !!node.getMesh() || node.listChildren().some(hasMesh);
const armatures = scene.listChildren();
const primary = armatures.find(hasMesh);
if (!primary) throw new Error('No armature containing a mesh was found.');

// Bones in depth-first order (mesh nodes skipped). Every armature has the same
// hierarchy, so index N in one rig is the same bone as index N in another.
const bonesOf = (armature) => {
  const out = [];
  const walk = (node) => {
    for (const child of node.listChildren()) {
      if (child.getMesh()) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(armature);
  return out;
};
const primaryBones = bonesOf(primary);
console.log(`Primary armature "${primary.getName()}": ${primaryBones.length} bones`);

// --- 2. build old-bone -> primary-bone map, sanity-checking the rigs ----------
// Note: the mesh is bound in its own pose (arms/fingers differ from the generic Mixamo
// T-pose the clip rigs rest in). That is fine: every clip animates all 33 bones, so the
// displayed pose comes entirely from the clip. What MUST match is bone length (translation),
// except the Hips, which every clip animates as root motion anyway.
const retarget = new Map();
const others = armatures.filter((a) => a !== primary && !hasMesh(a));
for (const armature of others) {
  const bones = bonesOf(armature);
  if (bones.length !== primaryBones.length) {
    throw new Error(`Armature "${armature.getName()}" has ${bones.length} bones, expected ${primaryBones.length}.`);
  }
  bones.forEach((bone, i) => {
    const target = primaryBones[i];
    if (bone.getName() !== target.getName()) {
      throw new Error(`Bone mismatch in "${armature.getName()}": ${bone.getName()} vs ${target.getName()}`);
    }
    retarget.set(bone, target);
    if (i === 0) return; // Hips: animated root motion
    const a = bone.getTranslation();
    const b = target.getTranslation();
    const drift = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (drift > 0.01) console.warn(`  ! "${armature.getName()}" bone ${bone.getName()} offset differs by ${drift.toFixed(3)} cm`);
  });
}
console.log(`Mapped ${others.length} clip rigs onto the primary skeleton`);

// --- 3. point every animation channel at the primary skeleton -----------------
let moved = 0;
for (const animation of root.listAnimations()) {
  const before = new Set(animation.listChannels().map((c) => c.getTargetNode()));
  for (const channel of animation.listChannels()) {
    const target = retarget.get(channel.getTargetNode());
    if (target) {
      channel.setTargetNode(target);
      moved++;
    }
  }
  const stillOnPrimary = [...before].every((n) => retarget.has(n) || primaryBones.includes(n));
  console.log(`  clip "${animation.getName()}" -> ${stillOnPrimary ? 'primary skeleton' : 'UNMAPPED TARGETS'}`);
}
console.log(`Retargeted ${moved} channels`);

// --- 4. delete the now-unused armatures and skins -----------------------------
const primarySkin = primary.listChildren().find((n) => n.getMesh())?.getSkin();
for (const skin of root.listSkins()) if (skin !== primarySkin) skin.dispose();
const disposeTree = (node) => {
  node.listChildren().forEach(disposeTree);
  node.dispose();
};
others.forEach(disposeTree);

// --- 5. optimise --------------------------------------------------------------
await doc.transform(
  prune(),
  dedup(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 90 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);

await io.write(output, doc);
console.log(`\n${input}\n  ${mb(input)}  ->  ${output}\n  ${mb(output)}`);
console.log(`Clips: ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
