// GameView: owns the WebGL renderer, camera and all per-mission visuals. It reads the
// simulation each frame (never writes to it) and turns SimEvents into effects.

import * as THREE from 'three';
import { MAX_SQUAD, ROAD_HALF, SOLDIER_SPACING } from '../core/constants';
import { formationDepth, formationHalfWidth } from '../core/formation';
import { gateColor, gateLabel, gateSubLabel } from '../core/gates';
import type { Crate, Enemy, Gate, SimEvent, Simulation } from '../core/sim';
import type { EnemyType } from '../core/enemies';
import { WEAPONS, type WeaponId } from '../core/weapons';
import type { CrateReward } from '../core/types';
import { Decals, fxTextures, ParticleSystem, TelegraphPool, Tracers } from './fx';
import { buildBoss, charMaterial, containerGeometry, crateGeometry, gunGeometry, soldierRig, truckGeometry, carGeometry, zombieRig, barrierGeometry, type BossModel } from './models';
import { makePose, type InstancedRig, type Pose } from './rig';
import { GateLabel, NumberLabel, polkaTexture, textTexture, woodTexture, concreteTexture, radialTexture } from './textures';
import { World } from './world';
import { FloatText } from './floattext';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityProfile {
  dpr: number; shadows: boolean; particles: number; density: number; blobShadows: boolean; fpsCap: number;
}

export function qualityProfile(q: QualityLevel): QualityProfile {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
  switch (q) {
    case 'low': return { dpr: Math.min(dpr, 1), shadows: false, particles: 260, density: 0.4, blobShadows: true, fpsCap: 30 };
    case 'medium': return { dpr: Math.min(dpr, 1.5), shadows: false, particles: 650, density: 0.7, blobShadows: true, fpsCap: 60 };
    case 'high': return { dpr: Math.min(dpr, 2), shadows: true, particles: 1100, density: 1, blobShadows: false, fpsCap: 60 };
  }
}

interface GateVis { gate: Gate; group: THREE.Group; panel: THREE.Mesh; label: GateLabel; mat: THREE.MeshBasicMaterial; value: number; t: number; glow: THREE.Mesh }
interface CrateVis { crate: Crate; group: THREE.Group; barrel: THREE.Mesh; label: NumberLabel; sprite: THREE.Sprite; icon: THREE.Object3D; ring: THREE.Mesh; shown: number; t: number }

const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const RED = new THREE.Color(1, 0.35, 0.3);
const WHITE = new THREE.Color(2.2, 2.2, 2.2);
const GOLD = new THREE.Color(1.9, 1.55, 0.7);
const CYAN = new THREE.Color(0.75, 1.4, 1.7);

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly float: FloatText;
  private profile: QualityProfile;
  private quality: QualityLevel;

  // shared, long-lived resources
  private charMat = charMaterial();
  private soldiers: InstancedRig;
  private civilians: InstancedRig;
  private zombies: Record<EnemyType, InstancedRig>;
  private gunGeos: Record<WeaponId, THREE.BufferGeometry>;
  private currentGun: WeaponId = 'rifle';
  private additive: ParticleSystem;
  private alpha: ParticleSystem;
  private tracers = new Tracers(420);
  private decals = new Decals(60);
  private telegraphs = new TelegraphPool(20);
  private blobs: THREE.InstancedMesh;
  private bars: THREE.InstancedMesh;
  private shield: THREE.Mesh;
  private texs = fxTextures();
  private woodTex = woodTexture();
  private concreteTex = concreteTexture();
  private crateGeo = crateGeometry();
  private crateMat: THREE.MeshLambertMaterial;
  private poses: Pose[] = [];

  // per mission
  private world: World | null = null;
  private missionGroup = new THREE.Group();
  private missionDisposables: { dispose(): void }[] = [];
  private gates = new Map<number, GateVis>();
  private crates = new Map<number, CrateVis>();
  private barrelMeshes = new Map<number, THREE.Object3D>();
  private survivorSigns = new Map<number, THREE.Sprite>();
  private fireSpots: { x: number; z: number; w: number; d: number; acid: boolean }[] = [];
  private boss: BossModel | null = null;
  private bossHitCooldown = 0;
  private bossDmgAcc = 0;
  private bossDmgT = 0;
  private sim: Simulation | null = null;

  // camera
  private camPos = new THREE.Vector3(0, 10, -10);
  private camLook = new THREE.Vector3(0, 0, 10);
  private shake = 0;
  shakeEnabled = true;
  private time = 0;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, quality: QualityLevel, floatLayer: HTMLElement) {
    this.quality = quality;
    this.profile = qualityProfile(quality);
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false, alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.profile.dpr);
    this.camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.3, 500);
    this.float = new FloatText(floatLayer, this.camera);

    this.soldiers = soldierRig(MAX_SQUAD + 70, this.charMat);
    this.civilians = soldierRig(40, this.charMat, true);
    this.zombies = {
      walker: zombieRig('walker', 170, this.charMat),
      runner: zombieRig('runner', 120, this.charMat),
      armored: zombieRig('armored', 90, this.charMat),
      heavy: zombieRig('heavy', 12, this.charMat),
      elite: zombieRig('elite', 16, this.charMat),
    };
    this.gunGeos = { rifle: gunGeometry('rifle'), shotgun: gunGeometry('shotgun'), hmg: gunGeometry('hmg'), launcher: gunGeometry('launcher'), railgun: gunGeometry('railgun') };
    this.soldiers.meshes[4].geometry.dispose();
    this.soldiers.meshes[4].geometry = this.gunGeos.rifle;
    for (const rig of [this.soldiers, this.civilians, ...Object.values(this.zombies)]) {
      for (const m of rig.meshes) this.scene.add(m);
    }
    this.additive = new ParticleSystem(this.profile.particles, this.texs.glow, true);
    this.alpha = new ParticleSystem(this.profile.particles, this.texs.smoke, false);
    this.scene.add(this.additive.mesh, this.alpha.mesh, this.tracers.mesh, this.decals.group, this.telegraphs.group, this.missionGroup);

    const blobTex = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0xffffff });
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobMat, 520);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.scene.add(this.blobs);

    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    this.bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), barMat, 120);
    this.bars.setColorAt(0, tmpC.set(0xffffff));
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.renderOrder = 20;
    this.scene.add(this.bars);

    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shieldMat);
    this.shield.visible = false;
    this.scene.add(this.shield);

    this.crateMat = new THREE.MeshLambertMaterial({ map: this.woodTex });
    for (let i = 0; i < MAX_SQUAD + 200; i++) this.poses.push(makePose());
    this.applyQuality(quality);
  }

  // ------------------------------------------------------------------ setup

  applyQuality(q: QualityLevel): void {
    this.quality = q;
    this.profile = qualityProfile(q);
    this.renderer.setPixelRatio(this.profile.dpr);
    this.renderer.shadowMap.enabled = this.profile.shadows;
    this.soldiers.setShadows(this.profile.shadows);
    for (const z of Object.values(this.zombies)) z.setShadows(this.profile.shadows);
    this.blobs.visible = this.profile.blobShadows;
    this.resize(this.width, this.height);
  }

  get fpsCap(): number { return this.profile.fpsCap; }
  get qualityLevel(): QualityLevel { return this.quality; }

  resize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    this.camera.aspect = aspect;
    // keep ~54° of horizontal view on any phone; portrait gets a taller vertical FOV
    const hfov = THREE.MathUtils.degToRad(aspect < 1 ? 58 : 70);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    this.camera.fov = THREE.MathUtils.clamp(vfov, 40, 82);
    this.camera.updateProjectionMatrix();
  }

  /** Builds all visuals for a new run. Disposes the previous mission first. */
  load(sim: Simulation, quality = this.quality): void {
    this.unload();
    this.sim = sim;
    const m = sim.mission;
    this.world = new World({ length: m.length + (m.boss ? 60 : 0), seed: m.seed, time: m.time, shadows: this.profile.shadows, density: this.profile.density });
    this.scene.add(this.world.group);
    this.scene.fog = this.world.fog;
    this.renderer.toneMappingExposure = this.world.lighting.exposure;
    this.applyQuality(quality);

    for (const g of sim.gates) this.buildGate(g);
    for (const c of sim.crates) this.buildCrate(c);
    for (const w of sim.walls) this.buildWall(w.x, w.z, w.w, w.d, w.kind);
    for (const h of sim.hazards) this.buildHazard(h.x, h.z, h.w, h.d, h.kind);
    for (const s of sim.survivors) this.buildSurvivorSign(s.id, s.x, s.z, s.n);
    for (const b of sim.barrels) this.buildBarrel(b.id, b.x, b.z);
    if (m.boss) this.buildFinish(m.length, true); else this.buildFinish(m.length, false);
    this.setGun(sim.weapon);
    this.camPos.set(sim.squadX * 0.5, 12, sim.squadZ - 12);
    this.camLook.set(0, 0, sim.squadZ + 12);
  }

  unload(): void {
    for (const d of this.missionDisposables) d.dispose();
    this.missionDisposables = [];
    for (const g of this.gates.values()) g.label.dispose();
    for (const c of this.crates.values()) c.label.dispose();
    this.gates.clear();
    this.crates.clear();
    this.barrelMeshes.clear();
    this.survivorSigns.clear();
    this.fireSpots = [];
    this.missionGroup.clear();
    if (this.boss) {
      this.scene.remove(this.boss.root);
      for (const g of this.boss.geometries) g.dispose();
      for (const m of this.boss.materials) m.dispose();
      this.boss = null;
    }
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
      this.world = null;
    }
    this.additive.clear();
    this.alpha.clear();
    this.decals.clear();
    this.float.clear();
    this.sim = null;
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.missionDisposables.push(x);
    return x;
  }

  private buildGate(g: Gate): void {
    const group = new THREE.Group();
    const width = g.xMax - g.xMin;
    const cx = (g.xMin + g.xMax) / 2;
    group.position.set(cx, 0, g.z);
    const col = gateColor(g.spec);
    const label = new GateLabel();
    label.draw(gateLabel(g.spec), gateSubLabel(g.spec), col, !!g.spec.grow);
    const mat = this.own(new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    const panelGeo = this.own(new THREE.PlaneGeometry(width - 0.35, 2.0));
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.position.set(0, 1.45, 0);
    panel.rotation.y = Math.PI; // readable from the squad's side
    panel.renderOrder = 3;
    group.add(panel);
    const postMat = this.own(new THREE.MeshLambertMaterial({ color: tmpC.set(col).lerp(new THREE.Color(0xffffff), 0.35), emissive: new THREE.Color(col).multiplyScalar(0.35) }));
    const postGeo = this.own(new THREE.BoxGeometry(0.16, 2.7, 0.16));
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set((s * (width - 0.16)) / 2, 1.35, 0);
      post.castShadow = this.profile.shadows;
      group.add(post);
    }
    const topGeo = this.own(new THREE.BoxGeometry(width, 0.14, 0.18));
    const top = new THREE.Mesh(topGeo, postMat);
    top.position.set(0, 2.62, 0);
    group.add(top);
    const glowMat = this.own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    const glowGeo = this.own(new THREE.PlaneGeometry(width - 0.2, 2.6).rotateX(-Math.PI / 2));
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0.03, -0.6);
    glow.renderOrder = 2;
    group.add(glow);
    this.missionGroup.add(group);
    this.gates.set(g.id, { gate: g, group, panel, label, mat, value: g.spec.value, t: 0, glow });
  }

  private rewardIcon(r: CrateReward): THREE.Object3D {
    if (r.kind === 'weapon') {
      const grp = new THREE.Group();
      const geo = this.gunGeos[r.weapon];
      const m = new THREE.Mesh(geo, this.charMat);
      const outlineMat = this.own(new THREE.MeshBasicMaterial({ color: 0x5dff5a, side: THREE.BackSide }));
      const o = new THREE.Mesh(geo, outlineMat);
      o.scale.setScalar(1.12);
      grp.add(o, m);
      grp.scale.setScalar(2.6);
      grp.rotation.y = Math.PI / 2;
      return grp;
    }
    const text: Record<CrateReward['kind'], string> = {
      weapon: '', upgrade: 'GUN↑', recruit: `+${'n' in r ? r.n : ''}`, ammo: 'AMMO', boost: 'DMG×', shield: 'SHIELD', airstrike: 'STRIKE', scrap: 'SCRAP',
    };
    const color: Record<CrateReward['kind'], string> = {
      weapon: '#fff', upgrade: '#ff7ad1', recruit: '#ffd34a', ammo: '#ffe08a', boost: '#ff9a3a', shield: '#7fe8ff', airstrike: '#ffcf3a', scrap: '#c8d0d8',
    };
    const t = this.own(textTexture(text[r.kind], color[r.kind], 58));
    const s = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: t, depthWrite: false })));
    s.scale.set(2.4, 1.2, 1);
    return s;
  }

  private buildCrate(c: Crate): void {
    const group = new THREE.Group();
    group.position.set(c.x, 0, c.z);
    const barrel = new THREE.Mesh(this.crateGeo, this.crateMat);
    barrel.castShadow = this.profile.shadows;
    group.add(barrel);
    const lidGeo = this.own(new THREE.CircleGeometry(0.66, 18).rotateX(-Math.PI / 2));
    const lid = new THREE.Mesh(lidGeo, this.crateMat);
    lid.position.y = 1.25;
    barrel.add(lid);
    const label = new NumberLabel();
    label.draw(String(c.hits));
    const sprite = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: label.texture, depthWrite: false })));
    sprite.scale.set(2.3, 1.55, 1);
    sprite.position.set(0, 0.85, -0.7);
    sprite.renderOrder = 8;
    group.add(sprite);
    const icon = this.rewardIcon(c.reward);
    icon.position.set(0, 2.5, 0);
    group.add(icon);
    const ringMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(this.own(new THREE.TorusGeometry(0.75, 0.05, 6, 28)), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.55;
    group.add(ring);
    this.missionGroup.add(group);
    this.crates.set(c.id, { crate: c, group, barrel, label, sprite, icon, ring, shown: c.hits, t: 0 });
  }

  private buildWall(x: number, z: number, w: number, d: number, kind: string): void {
    let obj: THREE.Object3D;
    if (kind === 'barrier') {
      const geo = this.own(barrierGeometry());
      const mat = this.own(new THREE.MeshLambertMaterial({ map: this.concreteTex, color: 0xffd9a0 }));
      const n = Math.max(1, Math.round(w / 1.0));
      const im = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      for (let i = 0; i < n; i++) {
        m4.compose(new THREE.Vector3(-w / 2 + (i + 0.5) * (w / n), 0, 0), q, new THREE.Vector3(1.1, 1.15, (w / n) / 2.9));
        im.setMatrixAt(i, m4);
      }
      im.castShadow = this.profile.shadows;
      obj = im;
    } else if (kind === 'container') {
      const geo = this.own(containerGeometry());
      const mesh = new THREE.Mesh(geo, this.charMat);
      mesh.scale.set(w, 2.5, d);
      mesh.castShadow = this.profile.shadows;
      obj = mesh;
      // ribs
      const ribGeo = this.own(new THREE.BoxGeometry(w + 0.06, 2.4, 0.08));
      const ribMat = this.own(new THREE.MeshLambertMaterial({ color: 0x7a2a1e }));
      const grp = new THREE.Group();
      grp.add(mesh);
      for (let i = 0; i <= Math.floor(d / 0.8); i++) {
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.set(0, 1.25, -d / 2 + i * 0.8);
        grp.add(rib);
      }
      obj = grp;
    } else if (kind === 'truck') {
      const mesh = new THREE.Mesh(this.own(truckGeometry()), this.charMat);
      mesh.scale.set(w / 2.4, 1, d / 6.6);
      mesh.castShadow = this.profile.shadows;
      obj = mesh;
    } else {
      const mesh = new THREE.Mesh(this.own(carGeometry(1)), this.charMat);
      mesh.scale.set(w / 1.85, 1, d / 4.2);
      mesh.rotation.y = 0.05;
      mesh.castShadow = this.profile.shadows;
      obj = mesh;
    }
    obj.position.set(x, 0, z);
    this.missionGroup.add(obj);
  }

  private buildHazard(x: number, z: number, w: number, d: number, kind: 'fire' | 'acid'): void {
    const acid = kind === 'acid';
    const mat = this.own(new THREE.MeshBasicMaterial({ map: this.texs.glow, color: acid ? 0x7aff3a : 0xff6a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const geo = this.own(new THREE.PlaneGeometry(w * 1.25, d * 1.3).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.05, z);
    m.renderOrder = 2;
    this.missionGroup.add(m);
    this.decals.add(acid ? 3 : 2, x, z, Math.max(w, d) * 1.1);
    if (!acid) {
      const wreck = new THREE.Mesh(this.own(carGeometry(2)), this.charMat);
      wreck.position.set(x, 0, z);
      wreck.scale.set(Math.min(1.2, w / 2.2), 0.8, Math.min(1.1, d / 4.4));
      wreck.rotation.y = 0.4;
      this.missionGroup.add(wreck);
    }
    this.fireSpots.push({ x, z, w, d, acid });
  }

  private buildSurvivorSign(id: number, x: number, z: number, n: number): void {
    const t = this.own(textTexture(`+${n}`, '#ffd34a', 80));
    const s = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: t, depthWrite: false })));
    s.scale.set(2.2, 1.1, 1);
    s.position.set(x, 2.6, z);
    s.renderOrder = 8;
    this.missionGroup.add(s);
    this.survivorSigns.set(id, s);
  }

  private buildBarrel(id: number, x: number, z: number): void {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 12)), this.own(new THREE.MeshLambertMaterial({ color: 0xc8261e })));
    body.position.y = 0.48;
    const band = new THREE.Mesh(this.own(new THREE.CylinderGeometry(0.335, 0.335, 0.16, 12)), this.own(new THREE.MeshLambertMaterial({ color: 0xf2c230 })));
    band.position.y = 0.6;
    grp.add(body, band);
    grp.position.set(x, 0, z);
    body.castShadow = this.profile.shadows;
    this.missionGroup.add(grp);
    this.barrelMeshes.set(id, grp);
  }

  private buildFinish(z: number, boss: boolean): void {
    // checkpoint arch (normal missions) or a toll-plaza arena line (boss missions)
    const col = boss ? 0xc8261e : 0x2fb84a;
    const postMat = this.own(new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
    const bannerMat = this.own(new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.3) }));
    const postGeo = this.own(new THREE.BoxGeometry(0.4, 5, 0.4));
    const az = boss ? z - 9 : z;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(s * (ROAD_HALF + 0.9), 2.5, az);
      this.missionGroup.add(p);
    }
    const banner = new THREE.Mesh(this.own(new THREE.BoxGeometry(ROAD_HALF * 2 + 2.2, 0.9, 0.2)), bannerMat);
    banner.position.set(0, 4.6, az);
    this.missionGroup.add(banner);
    const t = this.own(textTexture(boss ? 'BOSS ARENA' : 'SAFE ZONE', '#ffffff', 58));
    const s = new THREE.Sprite(this.own(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false })));
    s.scale.set(4.4, 2.2, 1);
    s.renderOrder = 9;
    s.position.set(0, 4.65, az - 0.3);
    this.missionGroup.add(s);
    if (boss) {
      // painted stop line and scattered wrecks around the arena
      const line = new THREE.Mesh(this.own(new THREE.PlaneGeometry(ROAD_HALF * 2, 0.5).rotateX(-Math.PI / 2)), this.own(new THREE.MeshBasicMaterial({ color: 0xd8261a, transparent: true, opacity: 0.8 })));
      line.position.set(0, 0.03, z + 0.6);
      this.missionGroup.add(line);
    }
    if (!boss) {
      // a waiting convoy at the safe zone
      const truck = new THREE.Mesh(this.own(truckGeometry()), this.charMat);
      truck.position.set(-2.4, 0, z + 14);
      const truck2 = truck.clone();
      truck2.position.set(2.4, 0, z + 18);
      this.missionGroup.add(truck, truck2);
    }
  }

  private setGun(w: WeaponId): void {
    if (w === this.currentGun) return;
    this.currentGun = w;
    this.soldiers.meshes[4].geometry = this.gunGeos[w];
  }

  // ------------------------------------------------------------------ per frame

  /** Renders one frame. `dt` is the real frame time (s). */
  frame(sim: Simulation, dt: number): void {
    this.time += dt;
    if (sim !== this.sim) return;
    this.setGun(sim.weapon);
    this.updateCamera(sim, dt);
    this.world?.follow(sim.squadX, sim.squadZ);

    this.drawCharacters(sim, dt);
    this.drawBoss(sim, dt);
    this.drawGates(sim, dt);
    this.drawCrates(sim, dt);
    this.drawMisc(sim, dt);
    this.drawProjectiles(sim);
    this.drawTelegraphs(sim);
    this.additive.update(dt);
    this.alpha.update(dt);
    this.float.update(dt, this.width, this.height);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(sim: Simulation, dt: number): void {
    const n = sim.count;
    const grow = Math.min(1, Math.max(0, (formationDepth(n) - 1) / 7));
    const bossOn = !!sim.boss && (sim.phase === 'boss' || (sim.boss && sim.mission.length - sim.squadZ < 30));
    const height = 12.5 + grow * 4 + (bossOn ? 3 : 0);
    const back = 7.6 + grow * 3.6 + (bossOn ? 1.5 : 0);
    const ahead = 11 + (bossOn ? 7 : 0);
    const tx = sim.squadX * 0.55;
    const target = tmpV.set(tx, height, sim.squadZ - back);
    const k = 1 - Math.exp(-dt * 4.5);
    this.camPos.lerp(target, k);
    const look = new THREE.Vector3(sim.squadX * 0.32, 0.6, sim.squadZ + ahead);
    if (bossOn && sim.boss) look.z = Math.min(sim.boss.z - 2, sim.squadZ + ahead + 4);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 5));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0 && this.shakeEnabled) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.camera.lookAt(this.camLook);
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  private drawCharacters(sim: Simulation, dt: number): void {
    const rig = this.soldiers;
    rig.begin();
    let blob = 0;
    const m4 = new THREE.Matrix4();
    const addBlob = (x: number, z: number, r: number) => {
      if (!this.profile.blobShadows || blob >= 520) return;
      m4.makeScale(r, 1, r).setPosition(x, 0.025, z);
      this.blobs.setMatrixAt(blob++, m4);
    };
    let flashes = 0;
    const shieldOn = sim.shieldT > 0;
    const boost = sim.boostT > 0;
    const pi = { i: 0 };
    const nextPose = () => {
      const p = this.poses[pi.i++ % this.poses.length];
      p.tint = null; p.tintParts = null; p.colors = null; p.fall = 0; p.lean = 0; p.roll = 0; p.bob = 0; p.scale = 1; p.torsoYaw = 0; p.y = 0;
      return p;
    };
    const muzzleColor = WEAPONS[sim.weapon].tracer;
    for (const s of sim.soldiers) {
      const p = nextPose();
      p.x = s.x; p.z = s.z; p.yaw = 0; p.scale = CHAR_SCALE;
      const moving = sim.speed > 0.5 || sim.ended;
      const sw = Math.sin(s.walk) * (moving ? 0.75 : 0.18);
      p.rot.legL[0] = sw; p.rot.legL[1] = 0; p.rot.legL[2] = 0;
      p.rot.legR[0] = -sw; p.rot.legR[1] = 0; p.rot.legR[2] = 0;
      p.bob = Math.abs(Math.cos(s.walk)) * (moving ? 0.06 : 0.015);
      const victory = sim.phase === 'won';
      if (victory) {
        // cheer: guns up
        const c = Math.sin(this.time * 8 + s.id) * 0.2;
        p.rot.armL[0] = -2.7 + c; p.rot.armL[1] = 0; p.rot.armL[2] = 0.2;
        p.rot.armR[0] = -2.7 - c; p.rot.armR[1] = 0; p.rot.armR[2] = -0.2;
        p.rot.gun[0] = -1.4; p.rot.gun[1] = 0; p.rot.gun[2] = 0;
        p.rot.torso[0] = 0; p.rot.torso[1] = 0; p.rot.torso[2] = 0;
        p.rot.head[0] = -0.3; p.rot.head[1] = 0; p.rot.head[2] = 0;
      } else {
        p.torsoYaw = Math.max(-0.9, Math.min(0.9, s.aimYaw));
        const rc = s.recoil * 0.16;
        p.rot.armL[0] = -1.42 + rc; p.rot.armL[1] = 0; p.rot.armL[2] = 0.52;
        p.rot.armR[0] = -1.22 + rc; p.rot.armR[1] = 0; p.rot.armR[2] = -0.32;
        p.rot.gun[0] = -rc * 0.6; p.rot.gun[1] = 0; p.rot.gun[2] = 0;
        p.rot.torso[0] = 0.08 - rc * 0.3; p.rot.torso[1] = 0; p.rot.torso[2] = 0;
        p.rot.head[0] = 0; p.rot.head[1] = 0; p.rot.head[2] = 0;
      }
      if (s.spawnT > 0) p.tint = tmpC.copy(GOLD).lerp(WHITE, 0).clone();
      else if (s.hitT > 0) p.tint = RED;
      else if (shieldOn) { p.tint = CYAN; p.tintParts = [1, 2]; }
      else if (boost) { p.tint = GOLD; p.tintParts = [4]; }
      rig.add(p);
      addBlob(s.x, s.z, 0.75);
      if (s.recoil > 0.93 && flashes < 26) {
        flashes++;
        const yaw = p.torsoYaw;
        const fx = s.x + (Math.sin(yaw) * 0.95 + Math.cos(yaw) * 0.06) * CHAR_SCALE;
        const fz = s.z + Math.cos(yaw) * 0.95 * CHAR_SCALE;
        this.additive.spawn({ x: fx, y: 1.25 * CHAR_SCALE, z: fz, max: 0.06, size0: 0.55, size1: 0.3, r: 1, g: 0.8, b: 0.45, a0: 1, a1: 0.2 });
        if (flashes < 8) this.additive.spawn({ x: fx, y: 1.25 * CHAR_SCALE, z: fz, max: 0.08, size0: 1.2, size1: 0.8, r: ((muzzleColor >> 16) & 255) / 255, g: ((muzzleColor >> 8) & 255) / 255 * 0.8, b: 0.2, a0: 0.4, a1: 0 });
      }
    }
    // fallen soldiers
    for (const f of sim.fallen) {
      const p = nextPose();
      p.x = f.x; p.z = f.z; p.yaw = f.yaw; p.scale = CHAR_SCALE;
      p.fall = easeOut(Math.min(1, f.t / 0.45));
      p.y = f.t > 1.3 ? -(f.t - 1.3) * 0.5 : 0;
      p.rot.legL[0] = 0.2; p.rot.legR[0] = -0.1; p.rot.armL[0] = -2.4; p.rot.armL[2] = 0.3; p.rot.armR[0] = -2.2; p.rot.armR[2] = -0.4;
      p.rot.gun[0] = 0.4; p.rot.torso[0] = 0; p.rot.head[0] = -0.3;
      p.tint = RED; p.tintParts = [1];
      rig.add(p);
    }
    rig.end();
    if (shieldOn && sim.count) {
      const hw = formationHalfWidth(sim.count) + 0.7;
      const dep = formationDepth(sim.count) + 1.2;
      this.shield.visible = true;
      this.shield.position.set(sim.squadX, 0, sim.squadZ - dep / 2 + 0.4);
      this.shield.scale.set(hw, 2.2, dep / 2 + 0.6);
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.06 * Math.sin(this.time * 6) + (sim.shieldT < 1.5 ? 0.08 * Math.sin(this.time * 30) : 0);
    } else this.shield.visible = false;

    // survivors waiting on the road: civilians waving for help
    const civ = this.civilians;
    civ.begin();
    for (const s of sim.survivors) {
      const sign = this.survivorSigns.get(s.id);
      if (sign) sign.visible = !s.taken;
      if (s.taken || s.z - sim.squadZ > 90) continue;
      for (let i = 0; i < s.n; i++) {
        const p = nextPose();
        const a = (i / s.n) * Math.PI * 2;
        p.x = s.x + Math.cos(a) * 0.55 * Math.min(1, s.n / 3);
        p.z = s.z + Math.sin(a) * 0.5;
        p.yaw = Math.PI;
        p.scale = CHAR_SCALE;
        const wave = Math.sin(this.time * 9 + i * 1.7);
        p.rot.armL[0] = -2.9; p.rot.armL[1] = 0; p.rot.armL[2] = 0.4 + wave * 0.35;
        p.rot.armR[0] = -2.9; p.rot.armR[1] = 0; p.rot.armR[2] = -0.4 - wave * 0.35;
        p.rot.legL[0] = 0; p.rot.legR[0] = 0; p.rot.torso[0] = 0; p.rot.head[0] = -0.25; p.rot.gun[0] = 0;
        p.bob = Math.abs(Math.sin(this.time * 6 + i)) * 0.12;
        p.colors = CIV_COLORS[(s.id + i) % CIV_COLORS.length];
        civ.add(p);
        addBlob(p.x, p.z, 0.7);
      }
    }
    civ.end();

    // zombies, one rig per archetype
    for (const r of Object.values(this.zombies)) r.begin();
    const barM = new THREE.Matrix4();
    let bars = 0;
    const camQ = this.camera.quaternion;
    for (const e of sim.enemies) {
      const rig2 = this.zombies[e.type];
      const p = nextPose();
      this.zombiePose(e, p, sim);
      rig2.add(p);
      if (e.state !== 'dying') addBlob(e.x, e.z, e.def.radius * 2.1);
      // health bars for damaged or dangerous enemies
      const show = e.state !== 'dying' && (e.hp < e.maxHp || e.type === 'heavy' || e.type === 'elite') && e.z - sim.squadZ < 45;
      if (show && bars < 58) {
        const w = e.type === 'heavy' ? 1.6 : e.type === 'elite' ? 1.1 : 0.7;
        const y = 1.95 * e.def.scale * CHAR_SCALE + 0.25;
        const frac = Math.max(0, e.hp / e.maxHp);
        barM.compose(tmpV.set(e.x, y, e.z), camQ, new THREE.Vector3(w + 0.06, 0.16, 1));
        this.bars.setMatrixAt(bars, barM);
        this.bars.setColorAt(bars++, tmpC.setRGB(0.1, 0.05, 0.05));
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
        const off = (-w / 2) * (1 - frac);
        barM.compose(new THREE.Vector3(e.x + right.x * off, y + right.y * off, e.z + right.z * off), camQ, new THREE.Vector3(Math.max(0.001, w * frac), 0.1, 1));
        this.bars.setMatrixAt(bars, barM);
        this.bars.setColorAt(bars++, e.type === 'armored' ? tmpC.setRGB(0.55, 0.75, 1) : tmpC.setRGB(0.95, 0.15, 0.12));
      }
    }
    for (const r of Object.values(this.zombies)) r.end();
    this.bars.count = bars;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
    this.blobs.count = blob;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  private zombiePose(e: Enemy, p: Pose, sim: Simulation): void {
    p.x = e.x; p.z = e.z; p.yaw = e.yaw; p.scale = e.def.scale * CHAR_SCALE;
    const v = e.variant;
    const chase = e.state === 'chase' || e.state === 'engaged';
    const runner = e.type === 'runner';
    const amp = e.state === 'idle' ? 0.25 : runner ? 1.0 : e.type === 'heavy' ? 0.45 : 0.55;
    const sw = Math.sin(e.walk) * amp;
    p.rot.legL[0] = sw; p.rot.legL[1] = 0; p.rot.legL[2] = 0;
    p.rot.legR[0] = -sw; p.rot.legR[1] = 0; p.rot.legR[2] = 0;
    p.bob = Math.abs(Math.cos(e.walk)) * (runner ? 0.08 : 0.04) * e.def.scale;
    const lean = e.state === 'idle' ? 0.05 : runner ? 0.42 : e.type === 'heavy' ? 0.18 : 0.2;
    p.lean = lean;
    const sway = Math.sin(e.walk * 0.5 + v * 6) * 0.2;
    if (chase && e.type !== 'elite') {
      p.rot.armL[0] = -1.45 + sway; p.rot.armL[1] = 0; p.rot.armL[2] = 0.12;
      p.rot.armR[0] = -1.35 - sway; p.rot.armR[1] = 0; p.rot.armR[2] = -0.12;
    } else {
      p.rot.armL[0] = sway * 0.6 - 0.1; p.rot.armL[1] = 0; p.rot.armL[2] = 0.15;
      p.rot.armR[0] = -sway * 0.6 - 0.1; p.rot.armR[1] = 0; p.rot.armR[2] = -0.15;
    }
    p.rot.torso[0] = 0; p.rot.torso[1] = Math.sin(e.walk * 0.5) * 0.12; p.rot.torso[2] = Math.sin(e.walk) * 0.06;
    p.rot.head[0] = 0.15 + Math.sin(e.walk * 0.7 + v * 4) * 0.12; p.rot.head[1] = 0; p.rot.head[2] = (v - 0.5) * 0.6;
    p.rot.gun[0] = 0;
    if (e.windT > 0) {
      // telegraphed attack wind-up: arms raised high, leaning back
      const k = 1 - e.windT / (e.type === 'heavy' ? 0.95 : 1.25);
      p.rot.armL[0] = -2.9 * Math.min(1, k * 2); p.rot.armR[0] = -2.9 * Math.min(1, k * 2);
      p.lean = -0.25 * k;
      p.rot.head[0] = -0.4 * k;
    }
    if (e.hitT > 0) { p.lean -= 0.18; p.tint = WHITE; }
    if (e.state === 'dying') {
      p.fall = easeOut(Math.min(1, e.dieT / 0.42));
      p.roll = (v - 0.5) * 0.8;
      p.y = e.dieT > 0.9 ? -(e.dieT - 0.9) * 0.55 * e.def.scale : 0;
      p.rot.armL[0] = -2.6; p.rot.armR[0] = -2.4;
      p.tint = null;
    }
    // per-instance variety: shirt / pants / skin tints for walkers and runners
    if (e.type === 'walker' || e.type === 'runner') {
      const shirts = runner ? RUNNER_SHIRTS : SHIRTS;
      p.colors = [PANTS[Math.floor(v * 97) % PANTS.length], shirts[Math.floor(v * 53) % shirts.length], SKINS[Math.floor(v * 31) % SKINS.length], shirts[Math.floor(v * 53) % shirts.length]];
    } else if (e.type === 'armored') {
      p.colors = [PANTS[0], ARMOR_SHIRT, SKINS[1], WHITE_C];
    } else p.colors = null;
    if (e.hitT > 0 && e.state !== 'dying') p.tint = WHITE;
    void sim;
  }

  private drawBoss(sim: Simulation, dt: number): void {
    const b = sim.boss;
    if (!b) return;
    if (!this.boss) {
      const look = b.def.look;
      const dress = look.style === 'apron' ? this.own(polkaTexture('#d8483a', '#f4eadc')) : look.style === 'queen' ? this.own(polkaTexture('#5a1f4a', '#e8c45a')) : null;
      this.boss = buildBoss(look, dress);
      this.boss.root.scale.setScalar(b.def.scale * BOSS_VISUAL);
      this.scene.add(this.boss.root);
    }
    const M = this.boss;
    M.root.position.set(b.x, 0, b.z);
    M.root.rotation.y = Math.PI + Math.atan2(sim.squadX - b.x, 30) * 0.3;
    const t = b.animT;
    const w = b.walk;
    // defaults
    let lean = 0.05, bob = Math.abs(Math.sin(w)) * 0.03;
    let legL = Math.sin(w) * 0.32, legR = -Math.sin(w) * 0.32;
    let armL: [number, number, number] = [Math.sin(w) * 0.25 - 0.2, 0, 0.25];
    let armR: [number, number, number] = [-Math.sin(w) * 0.25 - 0.2, 0, -0.25];
    let head: [number, number, number] = [0.05, 0, 0];
    let rootY = 0, fall = 0;
    const k = b.animDur > 0 ? Math.min(1, t / b.animDur) : 0;
    switch (b.anim) {
      case 'idle':
        legL = legR = 0; armL = [-0.15 + Math.sin(this.time * 1.5) * 0.08, 0, 0.3]; armR = [-0.15 - Math.sin(this.time * 1.5) * 0.08, 0, -0.3];
        bob = Math.sin(this.time * 2) * 0.02;
        break;
      case 'roar':
        lean = -0.22 * Math.sin(Math.min(1, k * 1.4) * Math.PI);
        armL = [-0.6, 0, 1.3 * Math.min(1, k * 3)]; armR = [-0.6, 0, -1.3 * Math.min(1, k * 3)];
        head = [-0.5 * Math.min(1, k * 3), 0, 0];
        legL = legR = 0;
        break;
      case 'slam': {
        const up = Math.min(1, k / 0.75);
        const down = k > 0.75 ? (k - 0.75) / 0.25 : 0;
        armL = [-2.9 * up + 2.1 * down, 0, 0.25]; armR = [-2.9 * up + 2.1 * down, 0, -0.25];
        lean = -0.2 * up + 0.55 * down;
        head = [-0.3 * up + 0.4 * down, 0, 0];
        legL = legR = 0;
        break;
      }
      case 'throw':
        armR = [k < 0.7 ? -2.6 * (k / 0.7) : -2.6 + 3.2 * ((k - 0.7) / 0.3), 0, -0.2];
        armL = [-0.6, 0, 0.5];
        lean = k < 0.7 ? -0.15 : 0.3;
        legL = legR = 0;
        break;
      case 'spit':
        head = [k < 0.75 ? -0.7 * (k / 0.75) : 0.6, 0, 0];
        lean = k < 0.75 ? -0.25 : 0.35;
        armL = [-0.3, 0, 0.6]; armR = [-0.3, 0, -0.6];
        legL = legR = 0;
        break;
      case 'charge':
        lean = 0.5; legL = Math.sin(w * 2.2) * 0.8; legR = -legL;
        armL = [0.6, 0, 0.3]; armR = [0.6, 0, -0.3];
        break;
      case 'stomp':
        legR = k < 0.6 ? -1.0 * (k / 0.6) : -1.0 + 1.0 * ((k - 0.6) / 0.4);
        legL = 0;
        armL = [-0.8, 0, 0.9]; armR = [-0.8, 0, -0.9];
        break;
      case 'dying':
        fall = easeOut(Math.min(1, t / 1.3));
        rootY = t > 1.6 ? -(t - 1.6) * 0.5 : 0;
        armL = [-2.2, 0, 0.8]; armR = [-2.0, 0, -0.9];
        break;
      case 'walk':
        break;
    }
    if (b.staggerT > 0 && b.anim !== 'dying') { lean -= 0.18; head[0] -= 0.2; }
    M.body.rotation.x = lean - fall * 1.45;
    M.body.position.y = bob + rootY;
    M.legL.rotation.x = legL; M.legR.rotation.x = legR;
    M.armL.rotation.set(armL[0], armL[1], armL[2]);
    M.armR.rotation.set(armR[0], armR[1], armR[2]);
    M.head.rotation.set(head[0], head[1], head[2]);
    // hit flash
    this.bossHitCooldown -= dt;
    const flash = b.hitT > 0 ? 0.45 : 0;
    M.flashMat.emissive.setRGB(flash, flash * 0.25, flash * 0.2);
    for (const m of M.materials) if ((m as THREE.MeshLambertMaterial).emissive && m !== M.flashMat) (m as THREE.MeshLambertMaterial).emissive.setRGB(flash, flash * 0.25, flash * 0.2);
    // red halo while an attack is pending
    const gm = M.glow.material as THREE.MeshBasicMaterial;
    gm.opacity = b.pending && !b.dead ? 0.35 + 0.25 * Math.sin(this.time * 18) : Math.max(0, gm.opacity - dt * 2);
    M.glow.scale.setScalar(1.6);
    // accumulated boss damage numbers
    this.bossDmgT -= dt;
    if (this.bossDmgAcc > 0 && this.bossDmgT <= 0) {
      this.float.spawn(b.x + (Math.random() - 0.5) * 2.5, b.def.scale * 1.4 + Math.random(), b.z - b.def.radius, `-${Math.round(this.bossDmgAcc)}`, 'dmg-boss');
      this.bossDmgAcc = 0;
      this.bossDmgT = 0.16;
    }
  }

  private drawGates(sim: Simulation, dt: number): void {
    for (const v of this.gates.values()) {
      const g = v.gate;
      if (g.spec.value !== v.value) {
        v.value = g.spec.value;
        v.label.draw(gateLabel(g.spec), gateSubLabel(g.spec), gateColor(g.spec), !!g.spec.grow);
        this.updateGateColors(v);
      }
      if (g.used) {
        v.t += dt;
        const k = Math.min(1, v.t / 0.55);
        if (g.chosen) {
          const kk = Math.min(1, v.t / 0.22);
          v.panel.scale.set(1 + kk * 0.15, 1 + kk * 0.15, 1);
          v.mat.opacity = 0.9 * (1 - kk);
          v.group.position.y = -k * 3;
        } else {
          v.mat.opacity = 0.9 * (1 - k);
          v.group.position.y = -k * 3;
        }
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k);
        if (k >= 1) v.group.visible = false;
      } else {
        v.mat.opacity = 0.82 + (g.flash > 0 ? 0.18 : 0) + Math.sin(this.time * 3 + g.id) * 0.04;
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(this.time * 4 + g.id) * 0.08;
        v.group.visible = g.z - sim.squadZ < 120;
      }
    }
  }

  private updateGateColors(v: GateVis): void {
    const col = gateColor(v.gate.spec);
    (v.glow.material as THREE.MeshBasicMaterial).color.set(col);
    v.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
      if (m && (m as THREE.Material) !== v.mat && m.emissive) {
        m.color.set(col).lerp(new THREE.Color(0xffffff), 0.35);
        m.emissive.set(col).multiplyScalar(0.35);
      }
    });
  }

  private drawCrates(sim: Simulation, dt: number): void {
    for (const v of this.crates.values()) {
      const c = v.crate;
      v.group.visible = c.z - sim.squadZ < 110 && c.z - sim.squadZ > -20;
      if (!v.group.visible) continue;
      if (c.state === 'closed') {
        if (c.hits !== v.shown) {
          v.shown = c.hits;
          v.label.draw(String(c.hits));
        }
        v.icon.rotation.y += dt * 1.4;
        v.icon.position.y = 2.5 + Math.sin(this.time * 2.5 + c.id) * 0.12;
        v.ring.rotation.z += dt;
        const f = c.flash > 0 ? 1.08 : 1;
        v.barrel.scale.set(f, 1, f);
        this.crateMat.emissive.setRGB(0, 0, 0);
      } else {
        v.t += dt;
        v.sprite.visible = false;
        v.ring.visible = false;
        const k = Math.min(1, v.t / 0.6);
        if (c.state === 'open') {
          v.icon.position.y = 2.35 + k * 3;
          v.icon.scale.multiplyScalar(1 + dt * 0.6);
          v.icon.visible = k < 1;
          v.barrel.scale.set(1 + k * 0.4, 1 - k, 1 + k * 0.4);
          v.barrel.visible = k < 1;
        } else {
          v.icon.visible = false;
          v.barrel.scale.set(1 + k * 0.3, Math.max(0.15, 1 - k), 1 + k * 0.3);
        }
      }
    }
  }

  private drawMisc(sim: Simulation, dt: number): void {
    for (const b of sim.barrels) {
      const m = this.barrelMeshes.get(b.id);
      if (m) m.visible = !b.exploded;
    }
    // flames / acid bubbles from hazards near the camera
    for (const f of this.fireSpots) {
      if (Math.abs(f.z - sim.squadZ) > 70) continue;
      const n = this.profile.particles > 500 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const x = f.x + (Math.random() - 0.5) * f.w, z = f.z + (Math.random() - 0.5) * f.d;
        if (f.acid) {
          this.additive.spawn({ x, y: 0.1, z, vy: 0.6, max: 0.8, size0: 0.3, size1: 0.6, r: 0.5, g: 1, b: 0.2, a0: 0.6, a1: 0 });
        } else {
          this.additive.spawn({ x, y: 0.2, z, vy: 2.5 + Math.random() * 2, max: 0.6, size0: 1.0, size1: 0.3, r: 1, g: 0.45, b: 0.12, a0: 0.9, a1: 0 });
          if (Math.random() < 0.25) this.alpha.spawn({ x, y: 1.5, z, vy: 1.6, vx: 0.4, max: 1.8, size0: 1, size1: 3, r: 0.12, g: 0.1, b: 0.09, a0: 0.45, a1: 0 });
        }
      }
    }
    // weapon boost aura / squad golden glow ring when recruiting
    void dt;
  }

  private drawProjectiles(sim: Simulation): void {
    this.tracers.begin();
    let smoke = 0;
    sim.forEachBullet((x, z, vx, vz, w) => {
      const d = WEAPONS[w];
      if (w === 'launcher') {
        this.tracers.add(x, 1.2, z, vx, vz, 0.6, 0.16, 0xffa040);
        if (smoke++ < 12) this.alpha.spawn({ x, y: 1.2, z, max: 0.5, size0: 0.25, size1: 0.8, r: 0.6, g: 0.58, b: 0.55, a0: 0.5, a1: 0 });
      } else if (w === 'railgun') {
        this.tracers.add(x, 1.2, z, vx, vz, 3.2, 0.09, d.tracer);
      } else {
        this.tracers.add(x, 1.2, z, vx, vz, w === 'shotgun' ? 0.7 : 1.3, w === 'hmg' ? 0.07 : 0.055, d.tracer);
      }
    });
    this.tracers.end();
  }

  private drawTelegraphs(sim: Simulation): void {
    this.telegraphs.begin();
    for (const t of sim.telegraphs) {
      const p = Math.min(1, t.t / t.dur);
      const z = sim.squadZ + t.dz;
      if (t.kind === 'circle') this.telegraphs.circle(t.x, z, t.r, p, this.time, t.friendly);
      else this.telegraphs.strip(t.x, z, t.r, t.len, p, this.time);
    }
    this.telegraphs.end();
  }

  // ------------------------------------------------------------------ events → effects

  handle(events: SimEvent[], sim: Simulation): void {
    let floats = 0;
    for (const e of events) {
      switch (e.t) {
        case 'hit':
          if (e.target === 'enemy') {
            this.alpha.spawn({ x: e.x, y: e.y * 0.8, z: e.z, vx: (Math.random() - 0.5) * 2, vy: 1.5, vz: 1, grav: 6, max: 0.35, size0: 0.25, size1: 0.45, r: 0.55, g: 0.05, b: 0.04, a0: 0.9, a1: 0 });
            if (floats < 5 && (e.big || Math.random() < 0.18)) { floats++; this.float.spawn(e.x, e.y + 0.3, e.z, `-${Math.round(e.dmg)}`, e.big ? 'dmg-big' : 'dmg'); }
          } else if (e.target === 'boss') {
            this.bossDmgAcc += e.dmg;
            if (Math.random() < 0.35) this.additive.spawn({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: 2, vz: -1, grav: 8, max: 0.25, size0: 0.35, size1: 0.1, r: 1, g: 0.7, b: 0.3 });
            if (Math.random() < 0.3) this.alpha.spawn({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: 1, grav: 5, max: 0.4, size0: 0.5, size1: 0.8, r: 0.5, g: 0.04, b: 0.03, a0: 0.8, a1: 0 });
          } else if (e.target === 'crate') {
            this.alpha.spawn({ x: e.x, y: e.y, z: e.z - 0.3, vx: (Math.random() - 0.5) * 3, vy: 2.5, vz: -1.5, grav: 10, max: 0.5, size0: 0.15, size1: 0.12, r: 0.55, g: 0.35, b: 0.18, a0: 1, a1: 0.6, floor: true });
          } else if (e.target === 'gate') {
            this.additive.spawn({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 2, vy: 1, vz: -1, max: 0.25, size0: 0.4, size1: 0.1, r: 0.8, g: 0.9, b: 1 });
          } else {
            this.additive.spawn({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 3, vy: 2, vz: -1, grav: 9, max: 0.2, size0: 0.25, size1: 0.05, r: 1, g: 0.8, b: 0.4 });
          }
          break;
        case 'kill': {
          const big = e.enemy === 'heavy' || e.enemy === 'elite';
          if (!e.consumed) this.decals.add(Math.random() < 0.5 ? 0 : 1, e.x, e.z, big ? 2.6 : 1.1 + Math.random() * 0.5);
          const n = big ? 16 : e.consumed ? 6 : 5;
          for (let i = 0; i < n; i++) {
            this.alpha.spawn({ x: e.x, y: big ? 1.8 : 1, z: e.z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, grav: 9, max: 0.6, size0: big ? 0.5 : 0.3, size1: 0.15, r: 0.5, g: 0.03, b: 0.02, a0: 1, a1: 0.3, floor: true });
          }
          if (e.enemy === 'elite') for (let i = 0; i < 8; i++) this.additive.spawn({ x: e.x, y: 1.4, z: e.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 5, grav: 8, max: 0.6, size0: 0.5, size1: 0.2, r: 0.5, g: 1, b: 0.2 });
          if (big) this.addShake(0.25);
          break;
        }
        case 'soldierDown':
          for (let i = 0; i < 5; i++) this.alpha.spawn({ x: e.x, y: 1, z: e.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, grav: 9, max: 0.5, size0: 0.3, size1: 0.12, r: 0.6, g: 0.05, b: 0.04, a0: 1, a1: 0.2 });
          if (e.cause === 'crush' || e.cause === 'blast') this.addShake(0.08);
          break;
        case 'recruit':
          this.float.spawn(e.x, 2.5, e.z, `+${e.n}`, 'recruit');
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            this.additive.spawn({ x: e.x + Math.cos(a) * 0.4, y: 0.3, z: e.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 3, vy: 3 + Math.random() * 2, vz: Math.sin(a) * 3, drag: 2, max: 0.8, size0: 0.5, size1: 0.1, r: 1, g: 0.85, b: 0.35 });
          }
          break;
        case 'gate': {
          const v = this.gates.get(e.id);
          const col = new THREE.Color(v ? gateColor(v.gate.spec) : 0xffffff);
          for (let i = 0; i < 26; i++) {
            this.additive.spawn({ x: e.x + (Math.random() - 0.5) * 4, y: 0.5 + Math.random() * 2.2, z: e.z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: 2 + Math.random() * 4, grav: 6, max: 0.7, size0: 0.35, size1: 0.1, r: col.r * 1.4, g: col.g * 1.4, b: col.b * 1.4 });
          }
          this.float.spawn(e.x, 3, e.z + 1, e.label, e.good ? 'gate-good' : 'gate-bad');
          if (!e.good) this.addShake(0.2);
          break;
        }
        case 'crateOpen':
          for (let i = 0; i < 22; i++) {
            this.alpha.spawn({ x: e.x, y: 0.8, z: e.z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, grav: 12, max: 0.9, size0: 0.25, size1: 0.18, r: 0.6, g: 0.38, b: 0.18, a0: 1, a1: 0.7, floor: true, spin: 6 });
          }
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            this.additive.spawn({ x: e.x, y: 1.2, z: e.z, vx: Math.cos(a) * 5, vy: Math.random() * 2, vz: Math.sin(a) * 5, drag: 3, max: 0.6, size0: 0.6, size1: 0.1, r: 1, g: 0.85, b: 0.35 });
          }
          this.additive.spawn({ x: e.x, y: 1.5, z: e.z, max: 0.35, size0: 2, size1: 5, r: 1, g: 0.9, b: 0.5, a0: 0.8, a1: 0 });
          this.float.spawn(e.x, 3.4, e.z, e.label, 'crate');
          break;
        case 'crateSmash':
          for (let i = 0; i < 16; i++) this.alpha.spawn({ x: e.x, y: 0.6, z: e.z, vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, grav: 12, max: 0.8, size0: 0.25, size1: 0.2, r: 0.5, g: 0.32, b: 0.15, a0: 1, a1: 0.6, floor: true });
          this.addShake(0.15);
          break;
        case 'explosion':
          this.explosion(e.x, e.z, e.r, e.kind);
          break;
        case 'bossDead':
          for (let i = 0; i < 4; i++) this.explosion(e.x + (Math.random() - 0.5) * 3, e.z + (Math.random() - 0.5) * 2, 3, 'airstrike');
          this.addShake(0.9);
          break;
        case 'bossAttack':
          if (e.kind === 'stomp' || e.kind === 'slam') this.addShake(0.35);
          break;
        case 'bossStart':
          this.addShake(0.4);
          break;
        case 'weapon':
          this.setGun(e.weapon);
          break;
        default:
          break;
      }
    }
    void sim;
  }

  private explosion(x: number, z: number, r: number, kind: string): void {
    const acid = kind === 'acid';
    const slam = kind === 'slam' || kind === 'charge';
    const big = kind === 'airstrike' || kind === 'barrel' || kind === 'throw';
    const n = this.profile.particles > 500 ? 1 : 0.5;
    if (acid) {
      for (let i = 0; i < 26 * n; i++) this.additive.spawn({ x: x + (Math.random() - 0.5) * r, y: 0.3, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, grav: 6, max: 0.8, size0: 0.6, size1: 0.2, r: 0.45, g: 1, b: 0.25 });
      this.decals.add(3, x, z, r * 2);
      return;
    }
    if (slam) {
      for (let i = 0; i < 30 * n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.alpha.spawn({ x: x + Math.cos(a) * r * 0.6, y: 0.3, z: z + Math.sin(a) * r * 0.6, vx: Math.cos(a) * 5, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 5, drag: 2.5, max: 1.1, size0: 1, size1: 2.5, r: 0.75, g: 0.62, b: 0.45, a0: 0.7, a1: 0 });
      }
      this.decals.add(2, x, z, r * 1.6);
      this.addShake(0.35);
      return;
    }
    const s = big ? 1.4 : 1;
    this.additive.spawn({ x, y: 1, z, max: 0.25, size0: r * 2.2 * s, size1: r * 3 * s, r: 1, g: 0.85, b: 0.5, a0: 1, a1: 0 });
    for (let i = 0; i < 18 * n * s; i++) {
      this.additive.spawn({ x, y: 0.8, z, vx: (Math.random() - 0.5) * 6 * s, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 6 * s, drag: 2.2, grav: 2, max: 0.55 + Math.random() * 0.3, size0: 1.2 * s, size1: 0.4, r: 1, g: 0.5 + Math.random() * 0.3, b: 0.15 });
    }
    for (let i = 0; i < 12 * n * s; i++) {
      this.alpha.spawn({ x: x + (Math.random() - 0.5) * r, y: 1, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, drag: 1, max: 1.6, size0: 1.2 * s, size1: 3.2 * s, r: 0.18, g: 0.15, b: 0.13, a0: 0.65, a1: 0 });
    }
    for (let i = 0; i < 10 * n; i++) {
      this.alpha.spawn({ x, y: 0.6, z, vx: (Math.random() - 0.5) * 9, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 9, grav: 14, max: 1, size0: 0.14, size1: 0.12, r: 0.15, g: 0.12, b: 0.1, a0: 1, a1: 1, floor: true });
    }
    this.decals.add(2, x, z, r * 1.5);
    this.addShake(big ? 0.45 : 0.15);
  }

  /** Projects a world point to CSS pixels (for UI anchoring). */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    tmpV.set(x, y, z).project(this.camera);
    return { x: (tmpV.x * 0.5 + 0.5) * this.width, y: (-tmpV.y * 0.5 + 0.5) * this.height, visible: tmpV.z < 1 };
  }

  get stats() {
    const i = this.renderer.info;
    return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, texs: i.memory.textures, particles: this.additive.count + this.alpha.count };
  }

  dispose(): void {
    this.unload();
    this.soldiers.dispose();
    this.civilians.dispose();
    for (const z of Object.values(this.zombies)) z.dispose();
    for (const g of Object.values(this.gunGeos)) g.dispose();
    this.additive.dispose(); this.alpha.dispose(); this.tracers.dispose(); this.decals.dispose(); this.telegraphs.dispose();
    this.renderer.dispose();
  }
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/** Characters are drawn slightly larger than their collision size for readability on phones. */
const CHAR_SCALE = 1.22;
const BOSS_VISUAL = 1.2;
const C = (h: number) => new THREE.Color(h);
const SHIRTS = [C(0x8a9bb0), C(0xb08a6a), C(0x7a8a5a), C(0xc0b8a0), C(0x9a5a5a), C(0x6a7a9a), C(0xa0a0a8)];
const RUNNER_SHIRTS = [C(0xc06a3a), C(0xb84a4a), C(0xd08a40)];
const PANTS = [C(0x4a5268), C(0x5a4a3a), C(0x3a3a3a), C(0x6a6a5a)];
const SKINS = [C(0xffffff), C(0xe8f0e0), C(0xd8e0c8), C(0xf0e0e0)];
const ARMOR_SHIRT = C(0x6a7a8a);
const CIV_COLORS: (THREE.Color | null)[][] = [
  [null, C(0x6aa8ff), null, C(0x6aa8ff)], [null, C(0xff8a6a), null, C(0xff8a6a)], [null, C(0x7ae08a), null, C(0x7ae08a)], [null, C(0xffd86a), null, C(0xffd86a)],
];
const WHITE_C = C(0xffffff);
void SOLDIER_SPACING;
