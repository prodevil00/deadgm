// Pooled visual effects: GPU-billboarded particles, tracers, ground decals and telegraph markers.
// Every pool has a fixed capacity — nothing grows unbounded during a run.

import * as THREE from 'three';
import { flashTexture, radialTexture, scorchTexture, splatTexture } from './textures';

// ------------------------------------------------------------------ particles

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size0: number; size1: number;
  r: number; g: number; b: number; a0: number; a1: number;
  grav: number; drag: number; rot: number; spin: number;
  floor: boolean;
}

const PVERT = `
attribute vec3 iPos; attribute vec4 iColor; attribute vec2 iSizeRot;
varying vec2 vUv; varying vec4 vColor;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSizeRot.y), s = sin(iSizeRot.y);
  vec2 p = position.xy * iSizeRot.x;
  mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const PFRAG = `
uniform sampler2D map; varying vec2 vUv; varying vec4 vColor;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <fog_fragment>
}`;

export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private ps: P[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private sr: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  readonly capacity: number;

  constructor(capacity: number, texture: THREE.Texture, additive: boolean) {
    this.capacity = capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.sr = new Float32Array(capacity * 2);
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iSizeRot', new THREE.InstancedBufferAttribute(this.sr, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture } }]),
      vertexShader: PVERT,
      fragmentShader: PFRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = texture;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 5 : 4;
  }

  spawn(o: Partial<P> & { x: number; y: number; z: number }): void {
    if (this.ps.length >= this.capacity) this.ps.shift(); // recycle oldest
    this.ps.push({
      vx: 0, vy: 0, vz: 0, life: 0, max: 0.5, size0: 0.5, size1: 0.5, r: 1, g: 1, b: 1, a0: 1, a1: 0,
      grav: 0, drag: 0, rot: Math.random() * 6.28, spin: 0, floor: false, ...o,
    });
  }

  update(dt: number): void {
    let n = 0;
    const ps = this.ps;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0.05) { p.y = 0.05; p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dt;
      ps[n++] = p;
    }
    ps.length = n;
    for (let i = 0; i < n; i++) {
      const p = ps[i];
      const t = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r; this.col[i * 4 + 1] = p.g; this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a0 + (p.a1 - p.a0) * t;
      this.sr[i * 2] = p.size0 + (p.size1 - p.size0) * t;
      this.sr[i * 2 + 1] = p.rot;
    }
    this.geo.instanceCount = n;
    (this.geo.attributes.iPos as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.iColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.iSizeRot as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void { this.ps.length = 0; this.geo.instanceCount = 0; }
  get count(): number { return this.ps.length; }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ tracers

export class Tracers {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 0, 1);
  private c = new THREE.Color();
  private n = 0;
  constructor(capacity: number) {
    const g = new THREE.BoxGeometry(0.06, 0.06, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 6;
  }
  begin(): void { this.n = 0; }
  add(x: number, y: number, z: number, vx: number, vz: number, len: number, width: number, color: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    const sp = Math.hypot(vx, vz) || 1;
    this.v.set(vx / sp, 0, vz / sp);
    this.q.setFromUnitVectors(this.up, this.v);
    this.s.set(width, width, len);
    this.m.compose(new THREE.Vector3(x - (vx / sp) * len * 0.5, y, z - (vz / sp) * len * 0.5), this.q, this.s);
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ------------------------------------------------------------------ decals

export class Decals {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private next: number[] = [];
  private age: number[][] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private textures: THREE.Texture[];
  constructor(capacity: number) {
    this.textures = [splatTexture('#6a0d0a', 3), splatTexture('#58100c', 9), scorchTexture(), splatTexture('#5a8a1a', 5)];
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const t of this.textures) {
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const im = new THREE.InstancedMesh(g, mat, capacity);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 1;
      this.meshes.push(im);
      this.next.push(0);
      this.age.push([]);
      this.group.add(im);
    }
  }
  /** kind: 0/1 blood, 2 scorch, 3 acid */
  add(kind: number, x: number, z: number, size: number): void {
    const im = this.meshes[kind];
    const cap = im.instanceMatrix.count;
    const i = this.next[kind];
    this.next[kind] = (i + 1) % cap;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    this.m.compose(new THREE.Vector3(x, 0.02 + kind * 0.002, z), this.q, new THREE.Vector3(size, 1, size));
    im.setMatrixAt(i, this.m);
    im.count = Math.max(im.count, i + 1);
    im.instanceMatrix.needsUpdate = true;
  }
  clear(): void {
    for (let k = 0; k < this.meshes.length; k++) { this.meshes[k].count = 0; this.next[k] = 0; }
  }
  dispose(): void {
    for (const im of this.meshes) { (im.material as THREE.Material).dispose(); im.dispose(); }
    this.meshes[0]?.geometry.dispose();
    for (const t of this.textures) t.dispose();
  }
}

// ------------------------------------------------------------------ telegraph markers

const TVERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const TFRAG = `
uniform float progress; uniform float time; uniform vec3 color; uniform float shape; varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float a = 0.0;
  if (shape < 0.5) {
    float r = length(p);
    if (r > 1.0) discard;
    float edge = smoothstep(0.86, 0.94, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float fill = step(r, progress) * 0.3;
    float pulse = 0.18 + 0.12 * sin(time * 14.0);
    a = max(edge * 0.95, fill) + pulse * (1.0 - r);
  } else {
    float ex = smoothstep(0.82, 0.95, abs(p.x));
    float fill = step(vUv.y, progress) * 0.28;
    float stripes = step(0.5, fract((vUv.y * 9.0 - time * 1.5))) * 0.12;
    a = max(ex * 0.9, fill) + stripes;
  }
  gl_FragColor = vec4(color, a);
}`;

export class TelegraphPool {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; used: boolean }[] = [];
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  constructor(capacity: number) {
    for (let i = 0; i < capacity; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { progress: { value: 0 }, time: { value: 0 }, color: { value: new THREE.Color(0xff2a2a) }, shape: { value: 0 } },
        vertexShader: TVERT, fragmentShader: TFRAG, transparent: true, depthWrite: false, depthTest: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7; // drawn over characters so danger zones stay readable under big squads
      this.group.add(mesh);
      this.items.push({ mesh, mat, used: false });
    }
  }
  begin(): void { for (const it of this.items) it.used = false; }
  circle(x: number, z: number, r: number, progress: number, time: number, friendly: boolean): void {
    const it = this.items.find((i) => !i.used);
    if (!it) return;
    it.used = true;
    it.mesh.visible = true;
    it.mesh.position.set(x, 0.04, z);
    it.mesh.scale.set(r * 2, 1, r * 2);
    it.mat.uniforms.progress.value = progress;
    it.mat.uniforms.time.value = time;
    it.mat.uniforms.shape.value = 0;
    (it.mat.uniforms.color.value as THREE.Color).set(friendly ? 0xffc23a : 0xff2a2a);
  }
  strip(x: number, z0: number, halfW: number, len: number, progress: number, time: number): void {
    const it = this.items.find((i) => !i.used);
    if (!it) return;
    it.used = true;
    it.mesh.visible = true;
    it.mesh.position.set(x, 0.04, z0 + len / 2);
    it.mesh.scale.set(halfW * 2, 1, len);
    it.mesh.rotation.y = Math.PI; // uv.y grows toward the squad
    it.mat.uniforms.progress.value = progress;
    it.mat.uniforms.time.value = time;
    it.mat.uniforms.shape.value = 1;
    (it.mat.uniforms.color.value as THREE.Color).set(0xff2a2a);
  }
  end(): void { for (const it of this.items) if (!it.used) it.mesh.visible = false; }
  dispose(): void {
    this.geo.dispose();
    for (const it of this.items) it.mat.dispose();
  }
}

// ------------------------------------------------------------------ shared textures

export function fxTextures() {
  return {
    glow: radialTexture('rgba(255,255,255,1)'),
    flash: flashTexture(),
    smoke: radialTexture('rgba(255,255,255,0.85)'),
  };
}
