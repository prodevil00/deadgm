// Instanced "rigs": characters made of a few body-part meshes. Each part type is one
// InstancedMesh, so 120 soldiers cost ~5 draw calls. Limbs are animated procedurally by
// composing per-bone rotations on top of the character root transform.

import * as THREE from 'three';

export type BoneKey = 'legL' | 'legR' | 'armL' | 'armR' | 'torso' | 'head' | 'gun';

export interface BoneDef {
  part: number;                      // index into parts
  key: BoneKey;
  joint: [number, number, number];   // pivot in character space (metres, unscaled)
}

export interface Pose {
  x: number; y: number; z: number;
  yaw: number;
  scale: number;
  lean: number;      // forward lean (rad) of the whole body around the feet
  fall: number;      // 0..1 death fall backwards
  roll: number;      // sideways roll during death
  bob: number;       // vertical offset
  rot: Record<BoneKey, [number, number, number]>;
  torsoYaw: number;
  tint: THREE.Color | null;   // per-instance colour override (hit flash / variants)
  tintParts: number[] | null; // which part indices get the tint (null = all)
  colors: (THREE.Color | null)[] | null; // per-part base colours (variants)
}

export function makePose(): Pose {
  return {
    x: 0, y: 0, z: 0, yaw: 0, scale: 1, lean: 0, fall: 0, roll: 0, bob: 0, torsoYaw: 0,
    rot: { legL: [0, 0, 0], legR: [0, 0, 0], armL: [0, 0, 0], armR: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], gun: [0, 0, 0] },
    tint: null, tintParts: null, colors: null,
  };
}

const _root = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _upper = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _white = new THREE.Color(1, 1, 1);
const UPPER: Record<BoneKey, boolean> = { legL: false, legR: false, armL: true, armR: true, torso: true, head: true, gun: true };

export class InstancedRig {
  readonly meshes: THREE.InstancedMesh[];
  private bones: BoneDef[];
  private counts: number[];
  private perChar: number[]; // instances per character for each part mesh
  private cursor = 0;
  readonly capacity: number;
  private hipY: number;

  constructor(parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[], bones: BoneDef[], capacity: number, hipY = 0.9) {
    this.bones = bones;
    this.capacity = capacity;
    this.hipY = hipY;
    this.perChar = parts.map((_, i) => bones.filter((b) => b.part === i).length);
    this.counts = parts.map(() => 0);
    this.meshes = parts.map((p, i) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, capacity * this.perChar[i]));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, _white);
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      return m;
    });
  }

  begin(): void {
    this.cursor = 0;
    this.counts.fill(0);
  }

  /** Adds one character with the given pose. Returns false when capacity is exhausted. */
  add(p: Pose): boolean {
    if (this.cursor >= this.capacity) return false;
    this.cursor++;
    // root: position, yaw, then death fall / lean around the feet, then scale
    _root.makeTranslation(p.x, p.y + p.bob, p.z);
    _e.set(0, p.yaw, 0);
    _tmp.makeRotationFromEuler(_e);
    _root.multiply(_tmp);
    if (p.fall !== 0 || p.lean !== 0 || p.roll !== 0) {
      _e.set(-p.fall * 1.5 + p.lean, 0, p.roll * p.fall);
      _tmp.makeRotationFromEuler(_e);
      _root.multiply(_tmp);
    }
    if (p.scale !== 1) _root.multiply(_tmp.makeScale(p.scale, p.scale, p.scale));
    // upper body frame: rotates around the hip with torso yaw
    _upper.copy(_root);
    if (p.torsoYaw !== 0) {
      _upper.multiply(_tmp.makeTranslation(0, this.hipY, 0));
      _e.set(0, p.torsoYaw, 0);
      _upper.multiply(_rot.makeRotationFromEuler(_e));
      _upper.multiply(_tmp.makeTranslation(0, -this.hipY, 0));
    }
    for (const b of this.bones) {
      const mesh = this.meshes[b.part];
      const idx = this.counts[b.part]++;
      const r = p.rot[b.key];
      _tmp.copy(UPPER[b.key] ? _upper : _root);
      _tmp.multiply(_rot.makeTranslation(b.joint[0], b.joint[1], b.joint[2]));
      if (r[0] !== 0 || r[1] !== 0 || r[2] !== 0) {
        _e.set(r[0], r[1], r[2]);
        _tmp.multiply(_rot.makeRotationFromEuler(_e));
      }
      mesh.setMatrixAt(idx, _tmp);
      const base = p.colors?.[b.part] ?? _white;
      if (p.tint && (!p.tintParts || p.tintParts.includes(b.part))) mesh.setColorAt(idx, p.tint);
      else mesh.setColorAt(idx, base);
    }
    return true;
  }

  end(): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      m.count = this.counts[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  setVisible(v: boolean): void {
    for (const m of this.meshes) m.visible = v;
  }

  setShadows(cast: boolean): void {
    for (const m of this.meshes) m.castShadow = cast;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
  }
}
