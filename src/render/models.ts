// Original low-poly models built from primitives with baked vertex colours.
// Characters face +z. Heights are in metres for a ~1.75 m human.

import * as THREE from 'three';
import { box, cap, cone, cyl, ico, jitter, merge, sph, torus, type Part } from './geo';
import { InstancedRig, type BoneDef } from './rig';
import type { WeaponId } from '../core/weapons';
import type { EnemyType } from '../core/enemies';
import type { BossLook } from '../core/bosses';

export function charMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

// ------------------------------------------------------------------ weapons

export function gunGeometry(id: WeaponId): THREE.BufferGeometry {
  const steel = 0x2b2e33, dark = 0x1c1d20, wood = 0x7a4e2c, olive = 0x56603a, light = 0x8e959c;
  const p: Part[] = [];
  switch (id) {
    case 'rifle':
      p.push(
        { geo: box(0.07, 0.11, 0.42), color: steel, pos: [0, 0, 0.12] },
        { geo: box(0.06, 0.08, 0.2), color: wood, pos: [0, -0.01, 0.38] },
        { geo: cyl(0.016, 0.016, 0.24, 6), color: dark, pos: [0, 0.02, 0.58], rot: [Math.PI / 2, 0, 0] },
        { geo: box(0.05, 0.16, 0.07), color: dark, pos: [0, -0.11, 0.17], rot: [0.35, 0, 0] },
        { geo: box(0.06, 0.1, 0.2), color: wood, pos: [0, -0.03, -0.17] },
        { geo: box(0.04, 0.05, 0.12), color: dark, pos: [0, 0.08, 0.1] },
      );
      break;
    case 'shotgun':
      p.push(
        { geo: box(0.07, 0.09, 0.32), color: steel, pos: [0, 0, 0.1] },
        { geo: cyl(0.022, 0.022, 0.5, 7), color: dark, pos: [0, 0.03, 0.5], rot: [Math.PI / 2, 0, 0] },
        { geo: cyl(0.02, 0.02, 0.4, 7), color: dark, pos: [0, -0.02, 0.45], rot: [Math.PI / 2, 0, 0] },
        { geo: box(0.065, 0.07, 0.16), color: wood, pos: [0, -0.02, 0.42] },
        { geo: box(0.06, 0.12, 0.26), color: wood, pos: [0, -0.04, -0.17], rot: [-0.12, 0, 0] },
      );
      break;
    case 'hmg':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.push({ geo: cyl(0.014, 0.014, 0.6, 5), color: dark, pos: [Math.cos(a) * 0.045, Math.sin(a) * 0.045 + 0.02, 0.48], rot: [Math.PI / 2, 0, 0] });
      }
      p.push(
        { geo: cyl(0.075, 0.075, 0.08, 10), color: light, pos: [0, 0.02, 0.62], rot: [Math.PI / 2, 0, 0] },
        { geo: cyl(0.085, 0.085, 0.3, 10), color: steel, pos: [0, 0.02, 0.1], rot: [Math.PI / 2, 0, 0] },
        { geo: box(0.16, 0.16, 0.18), color: olive, pos: [0.09, -0.08, -0.02] },
        { geo: box(0.05, 0.1, 0.14), color: dark, pos: [0, 0.12, 0.05] },
      );
      break;
    case 'launcher':
      p.push(
        { geo: cyl(0.075, 0.075, 0.7, 10), color: olive, pos: [0, 0.03, 0.2], rot: [Math.PI / 2, 0, 0] },
        { geo: cyl(0.085, 0.07, 0.08, 10), color: dark, pos: [0, 0.03, 0.57], rot: [Math.PI / 2, 0, 0] },
        { geo: box(0.05, 0.13, 0.06), color: dark, pos: [0, -0.1, 0.1] },
        { geo: box(0.04, 0.08, 0.1), color: dark, pos: [0.06, 0.11, 0.18] },
        { geo: box(0.08, 0.03, 0.03), color: 0xd04a2a, pos: [0, 0.03, 0.6] },
      );
      break;
    case 'railgun':
      p.push(
        { geo: box(0.09, 0.12, 0.5), color: 0x2a3440, pos: [0, 0, 0.15] },
        { geo: box(0.05, 0.05, 0.42), color: 0x1a2028, pos: [0, 0.03, 0.55] },
        { geo: box(0.06, 0.14, 0.18), color: 0x2a3440, pos: [0, -0.04, -0.18] },
      );
      for (let i = 0; i < 4; i++) p.push({ geo: torus(0.05, 0.012), color: 0x6ff0ff, pos: [0, 0.03, 0.38 + i * 0.09] });
      p.push({ geo: box(0.1, 0.03, 0.3), color: 0x6ff0ff, pos: [0, 0.075, 0.12] });
      break;
  }
  return merge(p);
}

// ------------------------------------------------------------------ soldier

const SKIN = 0xc8946e;

export function soldierRig(capacity: number, mat: THREE.Material, civilian = false): InstancedRig {
  if (civilian) return civilianRig(capacity, mat);
  const jeans = 0x6a7488, boot = 0x6a4a30, shirt = 0xe8c070, vest = 0x8a6a4c, capC = 0xe2542e, pack = 0x7f8a56;
  const leg = merge([
    { geo: box(0.17, 0.5, 0.2), color: jeans, pos: [0, -0.25, 0] },
    { geo: box(0.16, 0.4, 0.18), color: jeans, pos: [0, -0.62, 0.01] },
    { geo: box(0.19, 0.13, 0.3), color: boot, pos: [0, -0.86, 0.05] },
  ]);
  const torso = merge([
    { geo: box(0.38, 0.2, 0.24), color: 0x3a2a1e, pos: [0, 0.04, 0] },
    { geo: box(0.44, 0.5, 0.26), color: shirt, pos: [0, 0.38, 0] },
    // plaid stripes on the flannel shirt
    { geo: box(0.445, 0.04, 0.265), color: 0xb87a34, pos: [0, 0.22, 0] },
    { geo: box(0.445, 0.04, 0.265), color: 0xb87a34, pos: [0, 0.36, 0] },
    { geo: box(0.47, 0.4, 0.29), color: vest, pos: [0, 0.42, 0], scale: [1, 1, 1] },
    { geo: box(0.2, 0.42, 0.295), color: shirt, pos: [0, 0.42, 0.003] },
    { geo: box(0.32, 0.36, 0.15), color: pack, pos: [0, 0.44, -0.21] },
    { geo: box(0.34, 0.1, 0.17), color: 0x5e6a40, pos: [0, 0.6, -0.21] },
    { geo: cyl(0.06, 0.07, 0.1, 6), color: SKIN, pos: [0, 0.68, 0] },
  ]);
  const head = merge([
    { geo: sph(0.125, 10, 8), color: SKIN, pos: [0, 0.09, 0], scale: [1, 1.08, 1] },
    { geo: sph(0.135, 10, 6), color: capC, pos: [0, 0.14, -0.005], scale: [1, 0.62, 1.05] },
    { geo: box(0.2, 0.025, 0.13), color: capC, pos: [0, 0.135, 0.13] },
    { geo: box(0.17, 0.04, 0.02), color: 0x6a4a30, pos: [0, 0.04, 0.12] }, // beard
  ]);
  const arm = merge([
    { geo: cap(0.068, 0.3, 5), color: shirt, pos: [0, -0.2, 0] },
    { geo: cap(0.058, 0.2, 5), color: SKIN, pos: [0, -0.46, 0] },
    { geo: sph(0.06, 6, 5), color: SKIN, pos: [0, -0.6, 0] },
  ]);
  const parts = [
    { geo: leg, mat }, { geo: torso, mat }, { geo: head, mat }, { geo: arm, mat }, { geo: gunGeometry('rifle'), mat },
  ];
  const bones: BoneDef[] = [
    { part: 0, key: 'legL', joint: [-0.11, 0.92, 0] },
    { part: 0, key: 'legR', joint: [0.11, 0.92, 0] },
    { part: 1, key: 'torso', joint: [0, 0.9, 0] },
    { part: 2, key: 'head', joint: [0, 1.62, 0] },
    { part: 3, key: 'armL', joint: [-0.27, 1.38, 0] },
    { part: 3, key: 'armR', joint: [0.27, 1.38, 0] },
    { part: 4, key: 'gun', joint: [0.06, 1.2, 0.22] },
  ];
  return new InstancedRig(parts, bones, capacity);
}

/** Unarmed civilians waiting for rescue: light shirts, no vest, bare heads. */
function civilianRig(capacity: number, mat: THREE.Material): InstancedRig {
  const pants = 0x4a6a9a, shirt = 0xf2f2f2, hair = 0x4a3020;
  const leg = merge([
    { geo: box(0.16, 0.5, 0.19), color: pants, pos: [0, -0.25, 0] },
    { geo: box(0.15, 0.4, 0.17), color: pants, pos: [0, -0.62, 0.01] },
    { geo: box(0.18, 0.12, 0.28), color: 0xe8e8e8, pos: [0, -0.86, 0.05] },
  ]);
  const torso = merge([
    { geo: box(0.36, 0.2, 0.23), color: pants, pos: [0, 0.04, 0] },
    { geo: box(0.42, 0.5, 0.25), color: shirt, pos: [0, 0.38, 0] },
    { geo: cyl(0.06, 0.07, 0.1, 6), color: SKIN, pos: [0, 0.68, 0] },
  ]);
  const head = merge([
    { geo: sph(0.125, 10, 8), color: SKIN, pos: [0, 0.09, 0], scale: [1, 1.08, 1] },
    { geo: sph(0.13, 10, 6), color: hair, pos: [0, 0.15, -0.02], scale: [1.02, 0.6, 1.05] },
  ]);
  const arm = merge([
    { geo: cap(0.062, 0.3, 5), color: shirt, pos: [0, -0.2, 0] },
    { geo: cap(0.052, 0.2, 5), color: SKIN, pos: [0, -0.46, 0] },
    { geo: sph(0.055, 6, 5), color: SKIN, pos: [0, -0.6, 0] },
  ]);
  return new InstancedRig([{ geo: leg, mat }, { geo: torso, mat }, { geo: head, mat }, { geo: arm, mat }], [
    { part: 0, key: 'legL', joint: [-0.1, 0.92, 0] },
    { part: 0, key: 'legR', joint: [0.1, 0.92, 0] },
    { part: 1, key: 'torso', joint: [0, 0.9, 0] },
    { part: 2, key: 'head', joint: [0, 1.62, 0] },
    { part: 3, key: 'armL', joint: [-0.26, 1.38, 0] },
    { part: 3, key: 'armR', joint: [0.26, 1.38, 0] },
  ], capacity);
}

// ------------------------------------------------------------------ zombies

export function zombieRig(type: EnemyType, capacity: number, mat: THREE.Material): InstancedRig {
  const skin = 0xb8c2a8, blood = 0x7a1a14, dark = 0x2b2a28;
  if (type === 'heavy') {
    const legs = merge([
      { geo: box(0.3, 0.52, 0.32), color: 0x4a4038, pos: [0, -0.24, 0] },
      { geo: box(0.26, 0.38, 0.28), color: 0xcaa9a0, pos: [0, -0.64, 0.02] },
      { geo: box(0.3, 0.14, 0.38), color: 0x8f7068, pos: [0, -0.86, 0.06] },
    ]);
    const torso = merge([
      { geo: box(0.62, 0.3, 0.42), color: 0x4a4038, pos: [0, 0.05, 0] },
      { geo: jitter(sph(0.45, 10, 8), 0.04, 3), color: 0xd6b0a6, pos: [0, 0.48, 0.02], scale: [1.15, 0.95, 0.85] },
      { geo: jitter(sph(0.3, 8, 6), 0.04, 5), color: 0xc49a90, pos: [0, 0.62, -0.18], scale: [1.4, 0.7, 0.8] },
      { geo: box(0.2, 0.12, 0.05), color: blood, pos: [0.12, 0.45, 0.38] },
      { geo: box(0.08, 0.3, 0.04), color: 0x8a3a5a, pos: [-0.15, 0.5, 0.39] },
    ]);
    const head = merge([
      { geo: jitter(sph(0.16, 8, 6), 0.02, 9), color: 0xc49a90, pos: [0, 0.06, 0.08] },
      { geo: box(0.14, 0.04, 0.03), color: 0x220c0a, pos: [0, 0.07, 0.23] },
      { geo: box(0.12, 0.05, 0.04), color: 0x5a1010, pos: [0, -0.04, 0.21] },
    ]);
    const arm = merge([
      { geo: jitter(cap(0.14, 0.32, 6), 0.02, 4), color: 0xd0a69c, pos: [0, -0.24, 0] },
      { geo: jitter(cap(0.13, 0.26, 6), 0.02, 7), color: 0xc49a90, pos: [0, -0.56, 0.02] },
      { geo: sph(0.15, 7, 6), color: 0xa87e74, pos: [0, -0.78, 0.04] },
    ]);
    return new InstancedRig([{ geo: legs, mat }, { geo: torso, mat }, { geo: head, mat }, { geo: arm, mat }], [
      { part: 0, key: 'legL', joint: [-0.18, 0.92, 0] },
      { part: 0, key: 'legR', joint: [0.18, 0.92, 0] },
      { part: 1, key: 'torso', joint: [0, 0.88, 0] },
      { part: 2, key: 'head', joint: [0, 1.62, 0.12] },
      { part: 3, key: 'armL', joint: [-0.52, 1.45, 0] },
      { part: 3, key: 'armR', joint: [0.52, 1.45, 0] },
    ], capacity);
  }
  if (type === 'elite') {
    const legs = merge([
      { geo: box(0.17, 0.5, 0.19), color: 0x3d3a2e, pos: [0, -0.25, 0] },
      { geo: box(0.15, 0.4, 0.17), color: skin, pos: [0, -0.64, 0] },
    ]);
    const torso = merge([
      { geo: box(0.36, 0.2, 0.24), color: 0x3d3a2e, pos: [0, 0.04, 0] },
      { geo: sph(0.34, 10, 8), color: 0x9fb06a, pos: [0, 0.38, 0.06], scale: [1, 1.05, 1.1] },
      { geo: sph(0.11, 6, 5), color: 0xc8ff5a, pos: [0.18, 0.45, 0.3] },
      { geo: sph(0.09, 6, 5), color: 0xc8ff5a, pos: [-0.16, 0.3, 0.32] },
      { geo: sph(0.08, 6, 5), color: 0xc8ff5a, pos: [-0.05, 0.6, 0.28] },
      { geo: sph(0.12, 6, 5), color: 0xb9ef4a, pos: [0.05, 0.55, -0.26] },
    ]);
    const head = merge([
      { geo: sph(0.13, 8, 6), color: 0x9fb06a, pos: [0, 0.07, 0.02] },
      { geo: cyl(0.06, 0.09, 0.12, 7), color: 0x3a5a10, pos: [0, 0.0, 0.14], rot: [Math.PI / 2, 0, 0] },
      { geo: box(0.1, 0.03, 0.02), color: 0xe8ff7a, pos: [0, 0.12, 0.12] },
    ]);
    const arm = merge([
      { geo: cap(0.06, 0.32, 5), color: 0x9fb06a, pos: [0, -0.22, 0] },
      { geo: cap(0.05, 0.24, 5), color: 0x8a9a5a, pos: [0, -0.5, 0] },
    ]);
    return new InstancedRig([{ geo: legs, mat }, { geo: torso, mat }, { geo: head, mat }, { geo: arm, mat }], [
      { part: 0, key: 'legL', joint: [-0.1, 0.9, 0] },
      { part: 0, key: 'legR', joint: [0.1, 0.9, 0] },
      { part: 1, key: 'torso', joint: [0, 0.88, 0] },
      { part: 2, key: 'head', joint: [0, 1.58, 0.1] },
      { part: 3, key: 'armL', joint: [-0.33, 1.32, 0] },
      { part: 3, key: 'armR', joint: [0.33, 1.32, 0] },
    ], capacity);
  }
  const armored = type === 'armored';
  const pants = 0xd8d8d8; // tinted per instance
  const shirtC = 0xf0f0f0; // tinted per instance
  const legs = merge([
    { geo: box(0.16, 0.5, 0.19), color: pants, pos: [0, -0.25, 0] },
    { geo: box(0.15, 0.4, 0.17), color: armored ? 0x9a9a9a : pants, pos: [0, -0.63, 0] },
    { geo: box(0.17, 0.12, 0.27), color: armored ? 0x3a3a3a : 0x6a6a6a, pos: [0, -0.86, 0.04] },
  ]);
  const torsoParts: Part[] = [
    { geo: box(0.36, 0.2, 0.23), color: pants, pos: [0, 0.04, 0] },
    { geo: box(0.42, 0.5, 0.25), color: shirtC, pos: [0, 0.38, 0] },
    { geo: box(0.16, 0.14, 0.02), color: blood, pos: [0.08, 0.42, 0.13] },
    { geo: box(0.1, 0.22, 0.02), color: blood, pos: [-0.1, 0.28, 0.13] },
    { geo: box(0.42, 0.06, 0.255), color: 0x9a9a9a, pos: [0, 0.14, 0] },
    { geo: cyl(0.06, 0.07, 0.1, 6), color: skin, pos: [0, 0.66, 0] },
  ];
  if (armored) {
    torsoParts.push(
      { geo: box(0.48, 0.42, 0.32), color: 0x2f3946, pos: [0, 0.42, 0] },
      { geo: box(0.5, 0.08, 0.34), color: 0x1f262f, pos: [0, 0.55, 0] },
      { geo: box(0.2, 0.12, 0.02), color: 0xd8d8d8, pos: [0, 0.45, 0.165] },
      { geo: box(0.22, 0.1, 0.3), color: 0x2f3946, pos: [-0.3, 0.58, 0] },
      { geo: box(0.22, 0.1, 0.3), color: 0x2f3946, pos: [0.3, 0.58, 0] },
    );
  }
  const torso = merge(torsoParts);
  const headParts: Part[] = [
    { geo: jitter(sph(0.125, 9, 7), 0.012, 2), color: skin, pos: [0, 0.08, 0] },
    { geo: box(0.05, 0.03, 0.02), color: 0x1a0a08, pos: [-0.045, 0.1, 0.115] },
    { geo: box(0.05, 0.03, 0.02), color: 0x1a0a08, pos: [0.045, 0.1, 0.115] },
    { geo: box(0.09, 0.04, 0.03), color: 0x4a1210, pos: [0, 0.0, 0.11] },
    { geo: sph(0.13, 8, 5), color: dark, pos: [0, 0.14, -0.02], scale: [1, 0.5, 1] },
  ];
  if (armored) {
    headParts.push(
      { geo: sph(0.155, 10, 7), color: 0x2f3946, pos: [0, 0.12, 0], scale: [1, 0.85, 1.05] },
      { geo: box(0.24, 0.1, 0.03), color: 0x6c8aa0, pos: [0, 0.08, 0.14] },
    );
  }
  const head = merge(headParts);
  const arm = merge([
    { geo: cap(0.062, 0.28, 5), color: armored ? 0x2f3946 : shirtC, pos: [0, -0.19, 0] },
    { geo: cap(0.052, 0.22, 5), color: skin, pos: [0, -0.45, 0] },
    { geo: sph(0.055, 6, 5), color: 0x9aa58c, pos: [0, -0.6, 0] },
  ]);
  return new InstancedRig([{ geo: legs, mat }, { geo: torso, mat }, { geo: head, mat }, { geo: arm, mat }], [
    { part: 0, key: 'legL', joint: [-0.1, 0.92, 0] },
    { part: 0, key: 'legR', joint: [0.1, 0.92, 0] },
    { part: 1, key: 'torso', joint: [0, 0.9, 0] },
    { part: 2, key: 'head', joint: [0, 1.6, 0] },
    { part: 3, key: 'armL', joint: [-0.27, 1.36, 0] },
    { part: 3, key: 'armR', joint: [0.27, 1.36, 0] },
  ], capacity);
}

// ------------------------------------------------------------------ boss

export interface BossModel {
  root: THREE.Group;      // world placement
  body: THREE.Group;      // lean / bob
  hips: THREE.Group;
  legL: THREE.Group; legR: THREE.Group;
  torso: THREE.Group;
  armL: THREE.Group; armR: THREE.Group;
  head: THREE.Group;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  glow: THREE.Mesh;       // ground glow / telegraph halo
  flashMat: THREE.MeshLambertMaterial;
}

export function buildBoss(look: BossLook, dressTex: THREE.Texture | null): BossModel {
  const geometries: THREE.BufferGeometry[] = [];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const flashMat = mat; // emissive is driven on this material for hit flashes
  const materials: THREE.Material[] = [mat];
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material = mat) => {
    geometries.push(g);
    const x = new THREE.Mesh(g, m);
    x.castShadow = true;
    return x;
  };
  const S = look.skin, O = look.outfit, A = look.outfitAlt, H = look.hair, X = look.accent;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.set(0, 0.92, 0);
  body.add(hips);

  // legs: chunky, with socks and shoes for the matron
  const legGeo = (side: number) => {
    const parts: Part[] = [
      { geo: jitter(cap(0.17, 0.36, 7), 0.015, 3 + side), color: S, pos: [0, -0.28, 0] },
      { geo: jitter(cap(0.15, 0.28, 7), 0.015, 5 + side), color: S, pos: [0, -0.62, 0.01] },
    ];
    if (look.style === 'apron') {
      parts.push({ geo: cyl(0.15, 0.14, 0.18, 8), color: 0xf0f0f0, pos: [0, -0.74, 0.01] });
      parts.push({ geo: box(0.2, 0.12, 0.32), color: 0xc8303a, pos: [0, -0.88, 0.06] });
    } else if (look.style === 'armor') {
      parts.push({ geo: box(0.3, 0.5, 0.32), color: O, pos: [0, -0.6, 0.02] });
      parts.push({ geo: box(0.32, 0.14, 0.4), color: 0x222428, pos: [0, -0.88, 0.06] });
    } else {
      parts.push({ geo: box(0.28, 0.4, 0.3), color: O, pos: [0, -0.25, 0] });
      parts.push({ geo: box(0.22, 0.12, 0.34), color: 0x3a2a22, pos: [0, -0.88, 0.06] });
    }
    return merge(parts);
  };
  const legL = new THREE.Group(); legL.position.set(-0.2, 0, 0); legL.add(mesh(legGeo(0))); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.2, 0, 0); legR.add(mesh(legGeo(1))); hips.add(legR);

  const torso = new THREE.Group();
  torso.position.set(0, 0.9, 0);
  body.add(torso);
  const tParts: Part[] = [];
  if (look.style === 'apron') {
    // big belly + polka dress (textured skirt added separately) + white apron frills
    tParts.push(
      { geo: jitter(sph(0.48, 12, 10), 0.02, 11), color: O, pos: [0, 0.42, 0.04], scale: [1.05, 1, 0.92] },
      { geo: jitter(sph(0.36, 10, 8), 0.02, 12), color: O, pos: [0, 0.82, 0], scale: [1.25, 0.8, 0.9] },
      { geo: box(0.34, 0.5, 0.05), color: A, pos: [0, 0.48, 0.47], rot: [-0.25, 0, 0] },
      { geo: box(0.06, 0.5, 0.05), color: A, pos: [-0.2, 0.86, 0.3], rot: [-0.3, 0, 0.15] },
      { geo: box(0.06, 0.5, 0.05), color: A, pos: [0.2, 0.86, 0.3], rot: [-0.3, 0, -0.15] },
      { geo: jitter(sph(0.2, 8, 6), 0.02, 13), color: S, pos: [0, 1.02, 0.08], scale: [1.4, 0.6, 0.9] },
    );
  } else if (look.style === 'hulk') {
    tParts.push(
      { geo: jitter(sph(0.5, 12, 10), 0.05, 21), color: S, pos: [0, 0.5, 0], scale: [1.25, 1.05, 0.9] },
      { geo: jitter(sph(0.42, 10, 8), 0.05, 22), color: S, pos: [0, 0.95, -0.08], scale: [1.6, 0.8, 0.95] },
      { geo: box(0.7, 0.32, 0.5), color: O, pos: [0, 0.02, 0] },
      { geo: jitter(sph(0.14, 6, 5), 0.02, 23), color: X, pos: [0.28, 0.7, 0.38] },
      { geo: jitter(sph(0.11, 6, 5), 0.02, 24), color: X, pos: [-0.3, 0.42, 0.4] },
      { geo: jitter(sph(0.18, 6, 5), 0.03, 25), color: A, pos: [-0.2, 1.1, -0.3] },
      { geo: box(0.05, 0.4, 0.04), color: 0x5a2a3a, pos: [0.05, 0.6, 0.46], rot: [0, 0, 0.3] },
    );
  } else if (look.style === 'armor') {
    tParts.push(
      { geo: jitter(sph(0.46, 10, 8), 0.03, 31), color: S, pos: [0, 0.48, 0], scale: [1.2, 1.05, 0.95] },
      { geo: box(1.0, 0.7, 0.72), color: O, pos: [0, 0.6, 0] },
      { geo: box(1.04, 0.12, 0.76), color: A, pos: [0, 0.32, 0] },
      { geo: box(1.04, 0.12, 0.76), color: A, pos: [0, 0.86, 0] },
      { geo: box(0.42, 0.28, 0.6), color: O, pos: [-0.6, 1.0, 0], rot: [0, 0, 0.25] },
      { geo: box(0.42, 0.28, 0.6), color: O, pos: [0.6, 1.0, 0], rot: [0, 0, -0.25] },
      { geo: box(0.3, 0.16, 0.04), color: X, pos: [0, 0.62, 0.37] },
      { geo: box(0.7, 0.3, 0.5), color: 0x2a2c30, pos: [0, 0.02, 0] },
    );
  } else {
    tParts.push(
      { geo: jitter(sph(0.46, 12, 10), 0.03, 41), color: O, pos: [0, 0.5, 0], scale: [1.1, 1.1, 0.9] },
      { geo: jitter(sph(0.34, 10, 8), 0.02, 42), color: O, pos: [0, 0.9, 0], scale: [1.35, 0.8, 0.9] },
      { geo: box(0.5, 0.06, 0.06), color: A, pos: [0, 0.32, 0.42] },
      { geo: box(0.06, 0.6, 0.06), color: A, pos: [0, 0.6, 0.43] },
      { geo: jitter(sph(0.12, 6, 5), 0.02, 43), color: X, pos: [0.25, 0.6, 0.38] },
      { geo: jitter(sph(0.1, 6, 5), 0.02, 44), color: X, pos: [-0.28, 0.75, 0.33] },
      { geo: box(1.2, 1.3, 0.06), color: 0x2a0f22, pos: [0, 0.5, -0.42], rot: [0.12, 0, 0] },
    );
  }
  torso.add(mesh(merge(tParts)));
  // skirt (matron & queen)
  if (look.style === 'apron' || look.style === 'queen') {
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      prof.push(new THREE.Vector2(0.42 + t * 0.42 + Math.sin(t * Math.PI) * 0.05, 0.25 - t * 0.62));
    }
    const skirtGeo = new THREE.LatheGeometry(prof, 18);
    const skirtMat = new THREE.MeshLambertMaterial({ map: dressTex, color: dressTex ? 0xffffff : O, side: THREE.DoubleSide });
    materials.push(skirtMat);
    const skirt = mesh(skirtGeo, skirtMat);
    skirt.position.set(0, 0.12, 0);
    torso.add(skirt);
    if (look.style === 'apron') {
      const frill = mesh(new THREE.TorusGeometry(0.85, 0.06, 5, 22), new THREE.MeshLambertMaterial({ color: A }));
      materials.push(frill.material as THREE.Material);
      frill.rotation.x = Math.PI / 2;
      frill.position.set(0, -0.36, 0);
      torso.add(frill);
    }
  }

  const armGeo = (side: number) => merge([
    { geo: jitter(cap(look.style === 'hulk' ? 0.19 : 0.15, 0.34, 7), 0.015, 50 + side), color: look.style === 'armor' ? O : S, pos: [0, -0.26, 0] },
    { geo: jitter(cap(look.style === 'hulk' ? 0.17 : 0.13, 0.32, 7), 0.015, 52 + side), color: S, pos: [0, -0.62, 0.02] },
    { geo: jitter(sph(look.style === 'hulk' ? 0.19 : 0.14, 7, 6), 0.02, 54 + side), color: S, pos: [0, -0.86, 0.04] },
    ...(look.style === 'apron' ? [{ geo: cyl(0.16, 0.18, 0.18, 8), color: O, pos: [0, -0.06, 0] as [number, number, number] }] : []),
  ]);
  const sx = look.style === 'armor' ? 0.66 : look.style === 'hulk' ? 0.66 : 0.58;
  const armL = new THREE.Group(); armL.position.set(-sx, 0.96, 0); armL.add(mesh(armGeo(0))); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(sx, 0.96, 0); armR.add(mesh(armGeo(1))); torso.add(armR);

  const head = new THREE.Group();
  head.position.set(0, 1.14, 0.06);
  torso.add(head);
  const hParts: Part[] = [
    { geo: jitter(sph(0.24, 12, 10), 0.012, 61), color: S, pos: [0, 0.18, 0], scale: [1, 1.05, 0.98] },
    { geo: box(0.07, 0.04, 0.03), color: 0x1a0606, pos: [-0.08, 0.22, 0.22] },
    { geo: box(0.07, 0.04, 0.03), color: 0x1a0606, pos: [0.08, 0.22, 0.22] },
    { geo: box(0.05, 0.02, 0.02), color: 0xffe08a, pos: [-0.08, 0.22, 0.235] },
    { geo: box(0.05, 0.02, 0.02), color: 0xffe08a, pos: [0.08, 0.22, 0.235] },
    { geo: box(0.2, 0.05, 0.03), color: 0x3a0808, pos: [0, 0.07, 0.22] },
    { geo: box(0.16, 0.025, 0.025), color: 0xe8e0c8, pos: [0, 0.09, 0.235] },
  ];
  if (look.style === 'apron') {
    hParts.push(
      { geo: jitter(sph(0.25, 10, 8), 0.02, 62), color: H, pos: [0, 0.27, -0.04], scale: [1.06, 0.75, 1.06] },
      { geo: jitter(sph(0.12, 8, 6), 0.02, 63), color: H, pos: [0, 0.42, -0.12] },
      { geo: sph(0.05, 6, 5), color: X, pos: [0.12, 0.38, 0.05] },
    );
  } else if (look.style === 'hulk') {
    hParts.push({ geo: jitter(sph(0.16, 8, 6), 0.03, 64), color: A, pos: [0.12, 0.34, -0.06] });
  } else if (look.style === 'armor') {
    hParts.push(
      { geo: sph(0.28, 12, 8), color: O, pos: [0, 0.24, -0.01], scale: [1, 0.9, 1.05] },
      { geo: box(0.44, 0.08, 0.06), color: X, pos: [0, 0.22, 0.25] },
    );
  } else {
    hParts.push(
      { geo: jitter(sph(0.26, 10, 8), 0.02, 65), color: H, pos: [0, 0.26, -0.05], scale: [1.05, 0.8, 1.1] },
      { geo: cyl(0.2, 0.24, 0.14, 8), color: A, pos: [0, 0.46, 0] },
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      hParts.push({ geo: cone(0.04, 0.16, 5), color: A, pos: [Math.cos(a) * 0.2, 0.6, Math.sin(a) * 0.2] });
      hParts.push({ geo: sph(0.03, 5, 4), color: X, pos: [Math.cos(a) * 0.21, 0.5, Math.sin(a) * 0.21] });
    }
  }
  head.add(mesh(merge(hParts)));

  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0, depthWrite: false });
  materials.push(glowMat);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), glowMat);
  geometries.push(glow.geometry);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  root.add(glow);

  return { root, body, hips, legL, legR, torso, armL, armR, head, materials, geometries, glow, flashMat };
}

// ------------------------------------------------------------------ props

export function cactusGeometry(seed: number): THREE.BufferGeometry {
  const g = 0x4f7a3a, d = 0x3c6230;
  const h = 1.6 + (seed % 5) * 0.35;
  const parts: Part[] = [
    { geo: cap(0.2, h, 7), color: g, pos: [0, h / 2 + 0.1, 0] },
    { geo: cap(0.13, 0.55, 6), color: d, pos: [0.36, h * 0.55, 0] },
    { geo: cap(0.13, 0.4, 6), color: g, pos: [0.2, h * 0.45, 0], rot: [0, 0, Math.PI / 2] },
  ];
  if (seed % 2 === 0) {
    parts.push({ geo: cap(0.12, 0.5, 6), color: d, pos: [-0.33, h * 0.7, 0] });
    parts.push({ geo: cap(0.12, 0.34, 6), color: g, pos: [-0.18, h * 0.62, 0], rot: [0, 0, Math.PI / 2] });
  }
  return merge(parts);
}

export function rockGeometry(seed: number): THREE.BufferGeometry {
  return merge([
    { geo: jitter(ico(0.6, 0), 0.18, seed), color: 0xa9825c, pos: [0, 0.25, 0], scale: [1.3, 0.7, 1] },
    { geo: jitter(ico(0.35, 0), 0.1, seed + 1), color: 0x8f6c4c, pos: [0.55, 0.12, 0.2], scale: [1, 0.7, 1] },
  ]);
}

export function bushGeometry(seed: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    parts.push({ geo: cyl(0.01, 0.025, 0.7, 3), color: 0x7a6a3a, pos: [Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12], rot: [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6] });
  }
  parts.push({ geo: jitter(ico(0.32, 0), 0.08, seed), color: 0x8a8a4a, pos: [0, 0.22, 0], scale: [1.2, 0.6, 1.2] });
  return merge(parts);
}

export function carGeometry(kind: 0 | 1 | 2): THREE.BufferGeometry {
  const rust = [0x8a5a3a, 0x6f6a5e, 0x7a3a2a][kind];
  const dark = 0x2a2522, glass = 0x3a4a52;
  const parts: Part[] = [
    { geo: box(1.8, 0.55, 4.2), color: rust, pos: [0, 0.6, 0] },
    { geo: box(1.6, 0.5, 2.0), color: rust, pos: [0, 1.12, -0.2] },
    { geo: box(1.62, 0.36, 1.7), color: glass, pos: [0, 1.12, -0.2], scale: [1, 1, 1] },
    { geo: box(1.82, 0.12, 4.22), color: dark, pos: [0, 0.38, 0] },
    { geo: box(1.7, 0.18, 0.1), color: 0x9a9a92, pos: [0, 0.5, 2.12] },
  ];
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    parts.push({ geo: cyl(0.34, 0.34, 0.24, 10), color: 0x1a1a1a, pos: [x, 0.3, z], rot: [0, 0, Math.PI / 2] });
  }
  return merge(parts);
}

export function truckGeometry(): THREE.BufferGeometry {
  const olive = 0x5d6342, dark = 0x2a2b26, canvasC = 0x7b7350;
  const parts: Part[] = [
    { geo: box(2.3, 1.3, 2.0), color: olive, pos: [0, 1.4, 2.4] },
    { geo: box(2.0, 0.5, 1.2), color: 0x34403f, pos: [0, 1.75, 2.85] },
    { geo: box(2.4, 0.5, 6.6), color: dark, pos: [0, 0.75, 0] },
    { geo: box(2.4, 0.6, 4.4), color: olive, pos: [0, 1.25, -1.1] },
    { geo: box(2.3, 1.4, 4.2), color: canvasC, pos: [0, 2.2, -1.1] },
    { geo: box(2.42, 0.1, 4.25), color: 0x5a5438, pos: [0, 2.9, -1.1] },
  ];
  for (const z of [2.3, -0.4, -2.4]) for (const x of [-1.1, 1.1]) {
    parts.push({ geo: cyl(0.5, 0.5, 0.36, 12), color: 0x1a1a1a, pos: [x, 0.5, z], rot: [0, 0, Math.PI / 2] });
  }
  return merge(parts);
}

export function tankGeometry(): THREE.BufferGeometry {
  const c = 0x6b6f4a, d = 0x2f3226;
  return merge([
    { geo: box(2.8, 0.9, 5.2), color: c, pos: [0, 1.0, 0] },
    { geo: box(3.1, 0.7, 5.6), color: d, pos: [0, 0.45, 0] },
    { geo: cyl(1.0, 1.15, 0.7, 10), color: c, pos: [0, 1.8, -0.3] },
    { geo: cyl(0.12, 0.12, 3.2, 8), color: d, pos: [0, 1.85, 1.6], rot: [Math.PI / 2 - 0.15, 0, 0] },
  ]);
}

export function containerGeometry(): THREE.BufferGeometry {
  const c = 0x9a3b2a;
  const parts: Part[] = [{ geo: box(1, 1, 1), color: c, pos: [0, 0.5, 0] }];
  return merge(parts);
}

export function barrierGeometry(): THREE.BufferGeometry {
  // jersey barrier profile
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0); shape.lineTo(0.3, 0); shape.lineTo(0.12, 0.3); shape.lineTo(0.09, 0.8); shape.lineTo(-0.09, 0.8); shape.lineTo(-0.12, 0.3); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false });
  g.translate(0, 0, -1.45);
  return g;
}

export function crateGeometry(): THREE.BufferGeometry {
  // barrel-shaped crate like the reference ("wooden barrel with a number")
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(0.62 + Math.sin(t * Math.PI) * 0.1, t * 1.25));
  }
  const g = new THREE.LatheGeometry(prof, 18);
  return g;
}

export function poleGeometry(): THREE.BufferGeometry {
  return merge([
    { geo: cyl(0.08, 0.1, 7, 6), color: 0x5a4632, pos: [0, 3.5, 0] },
    { geo: box(1.6, 0.1, 0.1), color: 0x5a4632, pos: [0, 6.6, 0] },
  ]);
}

export function tireGeometry(): THREE.BufferGeometry {
  return merge([{ geo: new THREE.TorusGeometry(0.4, 0.17, 6, 12), color: 0x1d1d1d, pos: [0, 0.17, 0], rot: [Math.PI / 2, 0, 0] }]);
}

export function mesaGeometry(seed: number): THREE.BufferGeometry {
  const g = jitter(new THREE.CylinderGeometry(1, 1.3, 1, 9, 3), 0.08, seed);
  const parts: Part[] = [{ geo: g, color: 0xc08a5c, pos: [0, 0.5, 0] }];
  return merge(parts);
}

export function survivorSign(): THREE.BufferGeometry {
  return merge([{ geo: box(0.05, 1.4, 0.05), color: 0x5a4632, pos: [0, 0.7, 0] }]);
}
