// The desert highway environment: sky, terrain, road, barriers, props and lighting.
// Built once per mission; everything static is instanced and merged.

import * as THREE from 'three';
import { BARRIER_X, ROAD_HALF } from '../core/constants';
import { hash01 } from '../core/rng';
import type { TimeOfDay } from '../core/types';
import {
  barrierGeometry, bushGeometry, cactusGeometry, carGeometry, mesaGeometry, poleGeometry, rockGeometry,
  tankGeometry, tireGeometry, truckGeometry,
} from './models';
import { concreteTexture, roadTexture, sandTexture } from './textures';

export interface Lighting {
  skyTop: number; skyHorizon: number; sun: number; sunIntensity: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  fog: number; fogNear: number; fogFar: number; sunDir: [number, number, number]; exposure: number;
}

export const LIGHTING: Record<TimeOfDay, Lighting> = {
  noon: { skyTop: 0x3f86d8, skyHorizon: 0xf3dcb4, sun: 0xfff1d6, sunIntensity: 2.6, hemiSky: 0xbfd8ff, hemiGround: 0xc29a6a, hemiIntensity: 1.6, fog: 0xead2aa, fogNear: 90, fogFar: 260, sunDir: [-0.45, 1, -0.35], exposure: 1.0 },
  afternoon: { skyTop: 0x4a86cc, skyHorizon: 0xf7d2a0, sun: 0xffe2b0, sunIntensity: 2.5, hemiSky: 0xc6d6f2, hemiGround: 0xc8955e, hemiIntensity: 1.55, fog: 0xf0cf9e, fogNear: 85, fogFar: 250, sunDir: [-0.7, 0.8, -0.2], exposure: 1.0 },
  sunset: { skyTop: 0x47578f, skyHorizon: 0xffa064, sun: 0xffb27a, sunIntensity: 2.3, hemiSky: 0xb0a8d0, hemiGround: 0xb47a52, hemiIntensity: 1.45, fog: 0xf0a878, fogNear: 80, fogFar: 240, sunDir: [-0.9, 0.45, 0.25], exposure: 1.05 },
  dusk: { skyTop: 0x242c58, skyHorizon: 0xd2785e, sun: 0xff9a6a, sunIntensity: 1.9, hemiSky: 0x8a8ac0, hemiGround: 0x8a5a44, hemiIntensity: 1.4, fog: 0xa86a5c, fogNear: 70, fogFar: 210, sunDir: [0.8, 0.4, 0.3], exposure: 1.15 },
  storm: { skyTop: 0x6b6a6a, skyHorizon: 0xc9a77e, sun: 0xffe2c0, sunIntensity: 1.8, hemiSky: 0xc0b8b0, hemiGround: 0xa07a58, hemiIntensity: 1.5, fog: 0xbf9c74, fogNear: 45, fogFar: 160, sunDir: [-0.3, 0.9, -0.5], exposure: 1.05 },
};

export interface WorldOptions {
  length: number;
  seed: number;
  time: TimeOfDay;
  shadows: boolean;
  density: number; // 0.5 low .. 1 high
}

export class World {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: THREE.Mesh;
  readonly fog: THREE.Fog;
  readonly lighting: Lighting;
  private disposables: { dispose(): void }[] = [];

  constructor(opts: WorldOptions) {
    const L = (this.lighting = LIGHTING[opts.time]);
    const total = opts.length + 160;

    // ---- sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(L.skyTop) },
        horizon: { value: new THREE.Color(L.skyHorizon) },
        sunDir: { value: new THREE.Vector3(...L.sunDir).normalize() },
        sunCol: { value: new THREE.Color(L.sun) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0); c += sunCol * (pow(s, 64.0) * 1.2 + pow(s, 6.0) * 0.18);
          c = mix(c, horizon * 0.92, smoothstep(0.0, -0.08, vDir.y)); gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.track(skyMat, this.sky.geometry);

    this.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);

    // ---- lights
    this.hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(L.sun, L.sunIntensity);
    this.sun.position.set(...L.sunDir).multiplyScalar(40);
    if (opts.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -18; c.right = 18; c.top = 30; c.bottom = -14; c.near = 1; c.far = 120;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.group.add(this.sun, this.sun.target);

    // ---- ground (sand) with gentle dunes away from the road
    const sandTex = sandTexture();
    sandTex.repeat.set(40, (total / 280) * 40);
    const groundGeo = new THREE.PlaneGeometry(560, total + 400, 70, Math.ceil((total + 400) / 10));
    groundGeo.rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      const away = Math.max(0, Math.abs(x) - 11);
      const h = away > 0 ? (Math.sin(x * 0.045 + z * 0.02) * 1.6 + Math.sin(z * 0.07 - x * 0.03) * 1.1 + 1.4) * Math.min(1, away / 25) : -0.02;
      gp.setY(i, h - 0.05);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshLambertMaterial({ map: sandTex, color: 0xffffff });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.z = total / 2 - 60;
    ground.receiveShadow = opts.shadows;
    this.group.add(ground);
    this.track(sandTex, groundGeo, groundMat);

    // ---- road surface
    const roadTex = roadTexture();
    const roadW = ROAD_HALF * 2 + 0.9;
    roadTex.repeat.set(1, total / 9);
    const roadGeo = new THREE.PlaneGeometry(roadW, total);
    roadGeo.rotateX(-Math.PI / 2);
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.position.set(0, 0.01, total / 2 - 60);
    road.receiveShadow = opts.shadows;
    this.group.add(road);
    this.track(roadTex, roadGeo, roadMat);
    // gravel shoulders
    const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x9a8264 });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(1.6, total);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, shoulderMat);
      m.position.set(s * (roadW / 2 + 0.75), 0.005, total / 2 - 60);
      m.receiveShadow = opts.shadows;
      this.group.add(m);
      this.track(g);
    }
    this.track(shoulderMat);

    // ---- concrete edge barriers (instanced)
    const barGeo = barrierGeometry();
    const conTex = concreteTexture();
    const barMat = new THREE.MeshLambertMaterial({ map: conTex });
    const segs = Math.ceil(total / 3);
    const bars = new THREE.InstancedMesh(barGeo, barMat, segs * 2);
    const m4 = new THREE.Matrix4();
    let bi = 0;
    for (let i = 0; i < segs; i++) {
      const z = -60 + i * 3 + 1.5;
      for (const s of [-1, 1]) {
        m4.makeTranslation(s * BARRIER_X, 0, z);
        bars.setMatrixAt(bi++, m4);
      }
    }
    bars.castShadow = opts.shadows;
    bars.receiveShadow = opts.shadows;
    this.group.add(bars);
    this.track(barGeo, barMat, conTex, bars);

    // ---- props
    const rnd = (i: number, k: number) => hash01(opts.seed * 7919 + i * 131 + k * 17);
    const charMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.track(charMat);
    const scatter = (geos: THREE.BufferGeometry[], count: number, place: (i: number, m: THREE.Matrix4) => void, shadow = true) => {
      const per = Math.ceil(count / geos.length);
      geos.forEach((g, gi) => {
        const im = new THREE.InstancedMesh(g, charMat, per);
        for (let i = 0; i < per; i++) place(gi * per + i, m4), im.setMatrixAt(i, m4);
        im.castShadow = shadow && opts.shadows;
        im.receiveShadow = false;
        this.group.add(im);
        this.track(g, im);
      });
    };
    const side = (i: number, k: number, near: number, far: number) => (rnd(i, k) < 0.5 ? -1 : 1) * (near + rnd(i, k + 1) * (far - near));
    const q = new THREE.Quaternion();
    const place = (m: THREE.Matrix4, x: number, z: number, yaw: number, s: number, y = 0) =>
      m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s));
    const dens = opts.density;

    scatter([cactusGeometry(1), cactusGeometry(2), cactusGeometry(3), cactusGeometry(4)], Math.round((total / 5) * dens), (i, m) => {
      place(m, side(i, 1, 8.5, 60), -60 + rnd(i, 3) * total, rnd(i, 4) * 6, 0.8 + rnd(i, 5) * 0.7);
    });
    scatter([rockGeometry(3), rockGeometry(8), rockGeometry(13)], Math.round((total / 6) * dens), (i, m) => {
      place(m, side(i, 11, 7.5, 70), -60 + rnd(i, 13) * total, rnd(i, 14) * 6, 0.5 + rnd(i, 15) * 1.6, -0.1);
    });
    scatter([bushGeometry(1), bushGeometry(2)], Math.round((total / 2.2) * dens), (i, m) => {
      place(m, side(i, 21, 7, 45), -60 + rnd(i, 23) * total, rnd(i, 24) * 6, 0.7 + rnd(i, 25) * 0.9);
    }, false);
    scatter([tireGeometry()], Math.round((total / 25) * dens), (i, m) => {
      place(m, side(i, 31, 6.8, 14), -60 + rnd(i, 33) * total, rnd(i, 34) * 6, 1);
    }, false);
    scatter([poleGeometry()], Math.ceil(total / 30), (i, m) => {
      place(m, -9.5, -60 + i * 30, 0, 1);
    });
    // wrecks on the shoulder (abandoned cars, trucks, tanks) — the reference's "highway of the dead"
    scatter([carGeometry(0), carGeometry(1), carGeometry(2)], Math.round((total / 22) * dens), (i, m) => {
      const s = rnd(i, 41) < 0.5 ? -1 : 1;
      place(m, s * (8 + rnd(i, 42) * 6), -40 + rnd(i, 43) * total, (rnd(i, 44) - 0.5) * 1.2 + (s < 0 ? 0 : Math.PI), 1);
    });
    scatter([truckGeometry()], Math.round((total / 90) * dens) + 1, (i, m) => {
      const s = rnd(i, 51) < 0.5 ? -1 : 1;
      place(m, s * (10 + rnd(i, 52) * 5), -20 + rnd(i, 53) * total, (rnd(i, 54) - 0.5) * 0.8, 1);
    });
    scatter([tankGeometry()], Math.round((total / 160) * dens) + 1, (i, m) => {
      const s = rnd(i, 61) < 0.5 ? -1 : 1;
      place(m, s * (13 + rnd(i, 62) * 6), rnd(i, 63) * total, rnd(i, 64) * 6, 1);
    });
    // distant mesas on the horizon
    scatter([mesaGeometry(1), mesaGeometry(2), mesaGeometry(3)], 30, (i, m) => {
      const s = i % 2 === 0 ? -1 : 1;
      const z = -60 + (i / 30) * (total + 200);
      m.compose(new THREE.Vector3(s * (110 + rnd(i, 71) * 70), -2, z), q.identity(), new THREE.Vector3(18 + rnd(i, 72) * 26, 10 + rnd(i, 73) * 22, 14 + rnd(i, 74) * 20));
    }, false);
  }

  /** Keeps sky, sun and shadow camera centred on the action. */
  follow(x: number, z: number): void {
    this.sky.position.set(x, 0, z);
    const d = this.lighting.sunDir;
    this.sun.position.set(x + d[0] * 40, d[1] * 40, z + 8 + d[2] * 40);
    this.sun.target.position.set(x, 0, z + 8);
  }

  private track(...items: { dispose(): void }[]): void {
    this.disposables.push(...items);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.group.clear();
  }
}
