// Geometry helpers: build multi-coloured low-poly models by merging primitives with baked
// vertex colours. One merged geometry = one draw call, regardless of how many parts it has.

import * as THREE from 'three';

export interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Merges parts into one non-indexed geometry with position, normal, uv and color attributes. */
export function merge(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    _e.set(...(p.rot ?? [0, 0, 0]));
    _q.setFromEuler(_e);
    _m.compose(new THREE.Vector3(...(p.pos ?? [0, 0, 0])), _q, new THREE.Vector3(...(p.scale ?? [1, 1, 1])));
    g.applyMatrix4(_m);
    if (!g.attributes.normal) g.computeVertexNormals();
    _c.set(p.color).convertSRGBToLinear();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      if (U) uv.push(U.getX(i), U.getY(i)); else uv.push(0, 0);
      col.push(_c.r, _c.g, _c.b);
    }
    g.dispose();
    if (g !== p.geo) p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const sph = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const cap = (r: number, len: number, seg = 6) => new THREE.CapsuleGeometry(r, len, 3, seg);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
export const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
export const torus = (r: number, t: number) => new THREE.TorusGeometry(r, t, 6, 12);

/** Jitters vertices of a geometry for an organic / rocky look (deterministic). */
export function jitter(g: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const P = g.attributes.position;
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const offsets = new Map<string, [number, number, number]>();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 0; i < P.count; i++) {
    const k = key(P.getX(i), P.getY(i), P.getZ(i));
    let o = offsets.get(k);
    if (!o) { o = [rnd() * amount, rnd() * amount, rnd() * amount]; offsets.set(k, o); }
    P.setXYZ(i, P.getX(i) + o[0], P.getY(i) + o[1], P.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}
