// All game art is generated procedurally at boot: no image files, no licensing concerns,
// tiny download. Each function draws one texture with Phaser Graphics or a 2D canvas.
import { GAME_W, GAME_H, ROAD } from '../config.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gfxTexture(scene, key, w, h, draw) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function canvasTexture(scene, key, w, h, draw) {
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
}

function radial(scene, key, size, stops) {
  canvasTexture(scene, key, size, size, (ctx) => {
    const r = size / 2;
    const grd = ctx.createRadialGradient(r, r, 0, r, r, r);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
  });
}

// ---------------------------------------------------------------------------
function drawRoad(scene) {
  const W = GAME_W, H = 512;
  const r = rng(7);
  canvasTexture(scene, 'road', W, H, (ctx) => {
    ctx.fillStyle = '#c9a167';
    ctx.fillRect(0, 0, W, H);
    // dirt speckle
    for (let i = 0; i < 2600; i++) {
      const c = ['#b88f57', '#d8b47a', '#a9814c', '#dcbc85'][Math.floor(r() * 4)];
      ctx.fillStyle = c;
      ctx.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
    }
    // gravel shoulders
    ctx.fillStyle = '#8f8574';
    ctx.fillRect(ROAD.left - 14, 0, 14, H);
    ctx.fillRect(ROAD.right, 0, 14, H);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = r() > 0.5 ? '#b0a48c' : '#6f6553';
      const side = r() > 0.5 ? ROAD.left - 14 : ROAD.right;
      ctx.fillRect(side + r() * 14, r() * H, 2, 2);
    }
    // asphalt
    ctx.fillStyle = '#3b3d42';
    ctx.fillRect(ROAD.left, 0, ROAD.width, H);
    for (let i = 0; i < 4200; i++) {
      ctx.fillStyle = ['#46484d', '#313338', '#404247'][Math.floor(r() * 3)];
      ctx.fillRect(ROAD.left + r() * ROAD.width, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    // repair patches
    for (let i = 0; i < 4; i++) {
      const px = ROAD.left + 40 + r() * (ROAD.width - 120);
      const py = 50 + r() * (H - 160);
      ctx.fillStyle = 'rgba(40,41,45,0.35)';
      ctx.beginPath();
      const pts = 7;
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2;
        const rad = 26 + r() * 22;
        const x = px + Math.cos(a) * rad * 1.3, y = py + Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    // skid marks
    ctx.strokeStyle = 'rgba(20,20,22,0.25)';
    ctx.lineWidth = 7;
    for (let s = 0; s < 2; s++) {
      const x = ROAD.left + 60 + r() * (ROAD.width - 120);
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.bezierCurveTo(x + 30, 140, x - 30, 260, x + 10, 360);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 36, 40);
      ctx.bezierCurveTo(x + 66, 140, x + 6, 260, x + 46, 360);
      ctx.stroke();
    }
    // lane markings (period 128 so the tile loops cleanly)
    const lanes = [ROAD.left + ROAD.width / 3, ROAD.left + (ROAD.width * 2) / 3];
    lanes.forEach((lx) => {
      for (let y = 0; y < H; y += 128) {
        const worn = r();
        ctx.fillStyle = `rgba(240,238,230,${0.35 + worn * 0.3})`;
        ctx.fillRect(lx - 3, y + 20, 6, 52);
        // chipped paint
        ctx.fillStyle = '#3b3d42';
        for (let k = 0; k < 6; k++) ctx.fillRect(lx - 3 + r() * 6, y + 20 + r() * 52, 3, 3);
      }
    });
    // worn edge lines
    [ROAD.left + 8, ROAD.right - 12].forEach((ex) => {
      ctx.fillStyle = 'rgba(216,206,180,0.35)';
      ctx.fillRect(ex, 0, 4, H);
      ctx.fillStyle = '#3b3d42';
      for (let k = 0; k < 10; k++) ctx.fillRect(ex, r() * H, 4, 10 + r() * 40);
    });
    // cracks
    ctx.strokeStyle = '#26272b';
    ctx.lineCap = 'round';
    for (let c = 0; c < 9; c++) {
      let x = ROAD.left + 10 + r() * (ROAD.width - 20);
      let y = 40 + r() * (H - 80);
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = 4 + Math.floor(r() * 6);
      for (let s = 0; s < segs; s++) {
        x += (r() - 0.5) * 34;
        y += (r() - 0.5) * 34;
        x = Math.max(ROAD.left + 4, Math.min(ROAD.right - 4, x));
        y = Math.max(20, Math.min(H - 20, y));
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // potholes
    for (let p = 0; p < 3; p++) {
      const x = ROAD.left + 30 + r() * (ROAD.width - 60);
      const y = 60 + r() * (H - 120);
      const rx = 10 + r() * 16, ry = 7 + r() * 10;
      ctx.fillStyle = '#55575c';
      ctx.beginPath(); ctx.ellipse(x, y + 2, rx + 3, ry + 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2b2f';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// ---------------------------------------------------------------------------
function drawVehicle(scene) {
  gfxTexture(scene, 'car', 66, 112, (g) => {
    // tyres
    g.fillStyle(0x0c0c0d);
    [[2, 14, 11, 24], [53, 14, 11, 24], [2, 74, 11, 26], [53, 74, 11, 26]].forEach(([x, y, w, h]) => {
      g.fillRoundedRect(x, y, w, h, 3);
    });
    g.fillStyle(0x2a2a2c);
    for (let y = 16; y < 100; y += 5) { g.fillRect(3, y, 9, 2); g.fillRect(54, y, 9, 2); }
    // ram plow
    g.fillStyle(0x7d848b);
    g.fillRoundedRect(4, 4, 58, 9, 3);
    g.fillStyle(0x9aa3ab);
    for (let x = 7; x < 60; x += 10) g.fillTriangle(x, 5, x + 8, 5, x + 4, 0);
    g.fillStyle(0x50565c);
    g.fillRect(6, 11, 54, 2);
    // body
    g.fillStyle(0x5e4f33);
    g.fillRoundedRect(9, 10, 48, 98, 10);
    g.fillStyle(0x7a6744);
    g.fillRoundedRect(13, 14, 40, 26, 6);
    // hood hazard stripes
    g.fillStyle(0xffb02e, 0.85);
    for (let i = 0; i < 4; i++) g.fillTriangle(16 + i * 9, 36, 22 + i * 9, 36, 19 + i * 9, 30);
    // bolts
    g.fillStyle(0x3d331f);
    [[16, 17], [50, 17], [16, 36], [50, 36]].forEach(([x, y]) => g.fillCircle(x, y, 1.5));
    // windshield with mesh guard
    g.fillStyle(0x1b262e);
    g.fillRoundedRect(14, 41, 38, 14, 3);
    g.fillStyle(0x48667a, 0.7);
    g.fillRect(17, 43, 12, 2);
    g.lineStyle(1, 0x0e1216, 0.8);
    for (let x = 18; x < 52; x += 6) g.lineBetween(x, 41, x, 55);
    // roof
    g.fillStyle(0x4f4229);
    g.fillRoundedRect(14, 56, 38, 14, 3);
    g.fillStyle(0x6b5a3a);
    g.fillRect(16, 58, 34, 2);
    // bed
    g.fillStyle(0x2c261d);
    g.fillRoundedRect(13, 72, 40, 32, 4);
    g.lineStyle(1, 0x3d3427, 1);
    for (let y = 76; y < 104; y += 6) g.lineBetween(15, y, 51, y);
    // side armour plates
    g.fillStyle(0x4a3f29);
    g.fillRect(9, 44, 4, 52);
    g.fillRect(53, 44, 4, 52);
    // lights
    g.fillStyle(0xfff1c2);
    g.fillRect(13, 10, 8, 4);
    g.fillRect(45, 10, 8, 4);
    g.fillStyle(0xb3261e);
    g.fillRect(13, 104, 8, 3);
    g.fillRect(45, 104, 8, 3);
  });

  gfxTexture(scene, 'turret', 40, 60, (g) => {
    g.fillStyle(0x16181b);
    g.fillRect(16, 0, 8, 7);
    g.fillStyle(0x2c3036);
    g.fillRect(17, 4, 6, 36);
    g.fillStyle(0x4a5058);
    g.fillRect(18, 6, 2, 30);
    g.fillStyle(0x3a3f46);
    g.fillCircle(20, 42, 15);
    g.fillStyle(0x50575f);
    g.fillCircle(20, 42, 11);
    g.fillStyle(0x2a2e33);
    g.fillRect(12, 46, 16, 8);
    g.fillStyle(0xffb02e);
    g.fillCircle(20, 40, 2);
  });

  radial(scene, 'shadow', 64, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
}

// ---------------------------------------------------------------------------
// Top-down zombies, facing down the screen (toward the player).
function zombie(g, o) {
  const { cx, cy, shoulderW, shoulderH, skin, shirt, hair, armW, armL, frame, eye, headR } = o;
  const swing = frame ? 4 : -4;
  // dark rim so silhouettes read against the asphalt
  g.fillStyle(0x050505, 0.75);
  g.fillEllipse(cx, cy - 1, shoulderW + 5, shoulderH + 5);
  g.fillCircle(cx, cy + 2, headR + 2.5);
  g.fillRoundedRect(cx - shoulderW / 2 - 3, cy - 2, armW + 4, armL + swing + 3, armW / 2);
  g.fillRoundedRect(cx + shoulderW / 2 - armW - 1, cy - 2, armW + 4, armL - swing + 3, armW / 2);
  // arms reaching forward (down)
  g.fillStyle(skin);
  g.fillRoundedRect(cx - shoulderW / 2 - 1, cy - 2, armW, armL + swing, armW / 2);
  g.fillRoundedRect(cx + shoulderW / 2 - armW + 1, cy - 2, armW, armL - swing, armW / 2);
  // sleeves
  g.fillStyle(shirt);
  g.fillRoundedRect(cx - shoulderW / 2 - 1, cy - 4, armW, armL * 0.35, armW / 2);
  g.fillRoundedRect(cx + shoulderW / 2 - armW + 1, cy - 4, armW, armL * 0.35, armW / 2);
  // shoulders / torso
  g.fillStyle(shirt);
  g.fillEllipse(cx, cy - 2, shoulderW, shoulderH);
  g.fillStyle(0x000000, 0.18);
  g.fillEllipse(cx, cy - 6, shoulderW * 0.8, shoulderH * 0.5);
  // gore stains
  g.fillStyle(0x5a0d0d, 0.9);
  g.fillCircle(cx - shoulderW * 0.2, cy + 1, shoulderH * 0.12);
  g.fillCircle(cx + shoulderW * 0.25, cy - 3, shoulderH * 0.09);
  // head
  g.fillStyle(skin);
  g.fillCircle(cx, cy + 2, headR);
  g.fillStyle(hair);
  g.fillEllipse(cx, cy - headR * 0.25, headR * 1.7, headR * 1.1);
  // eyes
  g.fillStyle(eye);
  g.fillCircle(cx - headR * 0.38, cy + headR * 0.55, Math.max(1.2, headR * 0.16));
  g.fillCircle(cx + headR * 0.38, cy + headR * 0.55, Math.max(1.2, headR * 0.16));
}

function drawZombies(scene) {
  for (let f = 0; f < 2; f++) {
    gfxTexture(scene, `z_walker_${f}`, 48, 52, (g) => zombie(g, {
      cx: 24, cy: 20, shoulderW: 32, shoulderH: 17, skin: 0x7d9564, shirt: 0x4a5560, hair: 0x2f3a28,
      armW: 7, armL: 22, frame: f, eye: 0xf2d24b, headR: 8,
    }));
    gfxTexture(scene, `z_runner_${f}`, 44, 50, (g) => zombie(g, {
      cx: 22, cy: 18, shoulderW: 27, shoulderH: 14, skin: 0x98a67d, shirt: 0x7a2c22, hair: 0x1d1a16,
      armW: 6, armL: 26, frame: f, eye: 0xff6a3d, headR: 7,
    }));
    gfxTexture(scene, `z_brute_${f}`, 84, 84, (g) => {
      zombie(g, {
        cx: 42, cy: 34, shoulderW: 62, shoulderH: 34, skin: 0x667a4f, shirt: 0x58694a, hair: 0x26301f,
        armW: 15, armL: 34, frame: f, eye: 0xffd23a, headR: 11,
      });
      // scars and stitched plates
      g.lineStyle(2, 0x2f2f2f, 0.9);
      g.lineBetween(26, 26, 38, 38);
      g.lineBetween(52, 24, 60, 36);
      g.fillStyle(0x3d3f42);
      g.fillRoundedRect(18, 22, 12, 8, 2);
      g.fillRoundedRect(54, 22, 12, 8, 2);
    });
    gfxTexture(scene, `z_boss_${f}`, 150, 150, (g) => {
      zombie(g, {
        cx: 75, cy: 62, shoulderW: 112, shoulderH: 58, skin: 0x5d6e47, shirt: 0x3a2f28, hair: 0x14110e,
        armW: 24, armL: 58, frame: f, eye: 0xff2a1f, headR: 18,
      });
      // apron
      g.fillStyle(0xb7b09b);
      g.fillRoundedRect(52, 44, 46, 40, 8);
      g.fillStyle(0x7d1414, 0.95);
      g.fillCircle(64, 58, 7); g.fillCircle(84, 70, 9); g.fillCircle(70, 76, 5);
      // cleaver in right hand
      const hy = 62 + 58 - (f ? 4 : -4) - 4;
      g.fillStyle(0x3b2a1d);
      g.fillRect(130, hy - 10, 6, 18);
      g.fillStyle(0xa9b1b8);
      g.fillRect(118, hy + 6, 30, 22);
      g.fillStyle(0xd8dde1);
      g.fillRect(118, hy + 25, 30, 3);
      g.fillStyle(0x7d1414);
      g.fillRect(126, hy + 14, 10, 6);
      // spikes on shoulders
      g.fillStyle(0x8d9399);
      [[30, 40], [44, 34], [106, 34], [120, 40]].forEach(([x, y]) => g.fillTriangle(x - 5, y + 6, x + 5, y + 6, x, y - 8));
      // head again on top for silhouette
      g.fillStyle(0x5d6e47);
      g.fillCircle(75, 64, 18);
      g.fillStyle(0x14110e);
      g.fillEllipse(75, 58, 30, 18);
      g.fillStyle(0xff2a1f);
      g.fillCircle(68, 74, 3); g.fillCircle(82, 74, 3);
    });
  }
}

// ---------------------------------------------------------------------------
function drawObstacles(scene) {
  gfxTexture(scene, 'wreck', 66, 108, (g) => {
    g.fillStyle(0x0c0c0d);
    g.fillRoundedRect(3, 16, 9, 22, 3);
    g.fillRoundedRect(54, 72, 9, 24, 3);
    g.fillStyle(0x4a2f22);
    g.fillRoundedRect(8, 6, 50, 98, 12);
    g.fillStyle(0x6b4128);
    g.fillRoundedRect(12, 10, 42, 26, 8);
    g.fillStyle(0x2a1d16);
    g.fillEllipse(30, 24, 22, 14);
    g.fillEllipse(44, 82, 18, 26);
    g.fillStyle(0x121518);
    g.fillRoundedRect(13, 38, 40, 14, 3);
    g.fillRoundedRect(13, 76, 40, 12, 3);
    g.lineStyle(1, 0x6c7a84, 0.7);
    g.lineBetween(20, 39, 30, 50); g.lineBetween(30, 50, 42, 40); g.lineBetween(30, 50, 34, 39);
    g.fillStyle(0x3b281d);
    g.fillRoundedRect(13, 54, 40, 20, 4);
    g.fillStyle(0x8a5a33, 0.6);
    g.fillRect(16, 58, 8, 3); g.fillRect(40, 66, 10, 3);
    g.fillStyle(0x5a3a26);
    g.fillRect(10, 92, 46, 10);
  });

  gfxTexture(scene, 'barrier', 124, 36, (g) => {
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(4, 8, 120, 28, 5);
    g.fillStyle(0x6f6c66);
    g.fillRoundedRect(0, 4, 120, 28, 5);
    g.fillStyle(0x8f8c84);
    g.fillRoundedRect(4, 6, 112, 14, 4);
    // hazard stripes
    for (let x = 6; x < 112; x += 16) {
      g.fillStyle(0xd6322a);
      g.fillTriangle(x, 30, x + 8, 30, x + 14, 20);
      g.fillTriangle(x, 30, x + 14, 20, x + 6, 20);
    }
    g.lineStyle(1, 0x3e3c38, 1);
    g.lineBetween(30, 6, 36, 18); g.lineBetween(88, 8, 82, 16);
  });

  gfxTexture(scene, 'barrel', 36, 36, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(19, 20, 16);
    g.fillStyle(0x7a1a12);
    g.fillCircle(17, 17, 16);
    g.fillStyle(0x9c2618);
    g.fillCircle(17, 17, 12);
    g.lineStyle(2, 0x5a120c, 1);
    g.strokeCircle(17, 17, 8);
    g.fillStyle(0xffb02e);
    g.fillTriangle(17, 9, 10, 22, 24, 22);
    g.fillStyle(0x1a1a1a);
    g.fillRect(16, 13, 2, 5);
    g.fillRect(16, 19, 2, 2);
  });
}

// ---------------------------------------------------------------------------
function drawProps(scene) {
  gfxTexture(scene, 'tree', 96, 96, (g) => {
    const r = rng(11);
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(52, 52, 30);
    g.lineStyle(5, 0x2a241d, 1);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      const len = 26 + r() * 18;
      const x2 = 48 + Math.cos(a) * len;
      const y2 = 48 + Math.sin(a) * len;
      g.lineBetween(48, 48, x2, y2);
      g.lineStyle(2, 0x352d24, 1);
      g.lineBetween(x2 - Math.cos(a) * 10, y2 - Math.sin(a) * 10, x2 + Math.cos(a + 0.8) * 12, y2 + Math.sin(a + 0.8) * 12);
      g.lineStyle(5, 0x2a241d, 1);
    }
    g.fillStyle(0x1e1914);
    g.fillCircle(48, 48, 8);
  });

  gfxTexture(scene, 'rubble', 56, 44, (g) => {
    const r = rng(19);
    for (let i = 0; i < 9; i++) {
      g.fillStyle([0x4d4a45, 0x3a3834, 0x5e5a53][i % 3]);
      const x = 8 + r() * 40, y = 8 + r() * 28, s = 4 + r() * 9;
      g.fillTriangle(x, y - s, x + s, y + s * 0.6, x - s, y + s * 0.7);
    }
    g.fillStyle(0x6b4e2e);
    g.fillRect(10, 30, 30, 4);
  });

  gfxTexture(scene, 'pole', 26, 120, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRect(12, 6, 8, 110);
    g.fillStyle(0x4c5257);
    g.fillRect(9, 4, 7, 110);
    g.fillStyle(0x6a7177);
    g.fillRect(10, 4, 2, 110);
    g.fillStyle(0x30353a);
    g.fillRoundedRect(3, 0, 20, 12, 3);
    g.fillStyle(0xe8e2b8, 0.6);
    g.fillRect(7, 3, 12, 5);
  });

  gfxTexture(scene, 'crate', 34, 34, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillRect(4, 4, 30, 30);
    g.fillStyle(0x6a4a2a);
    g.fillRect(0, 0, 30, 30);
    g.lineStyle(2, 0x4a321b, 1);
    g.strokeRect(2, 2, 26, 26);
    g.lineBetween(2, 2, 28, 28);
  });

  gfxTexture(scene, 'tyres', 40, 40, (g) => {
    [[14, 14], [26, 16], [20, 26]].forEach(([x, y]) => {
      g.fillStyle(0x0f0f10); g.fillCircle(x, y, 10);
      g.fillStyle(0x2a2a2c); g.fillCircle(x, y, 5);
    });
  });

  gfxTexture(scene, 'grass', 40, 30, (g) => {
    g.lineStyle(2, 0x3b4128, 1);
    for (let i = 0; i < 9; i++) g.lineBetween(20, 26, 4 + i * 4, 4 + (i % 3) * 5);
  });
}

// ---------------------------------------------------------------------------
function drawFx(scene) {
  gfxTexture(scene, 'bullet', 8, 22, (g) => {
    g.fillStyle(0xffb02e, 0.45);
    g.fillRoundedRect(0, 0, 8, 22, 4);
    g.fillStyle(0xfff4c8);
    g.fillRoundedRect(2, 1, 4, 18, 2);
  });
  gfxTexture(scene, 'dot', 8, 8, (g) => { g.fillStyle(0xffffff); g.fillCircle(4, 4, 4); });
  gfxTexture(scene, 'spark', 4, 14, (g) => { g.fillStyle(0xffffff); g.fillRect(0, 0, 4, 14); });
  gfxTexture(scene, 'chunk', 10, 8, (g) => { g.fillStyle(0xffffff); g.fillTriangle(0, 8, 10, 6, 4, 0); });

  radial(scene, 'glow', 128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  radial(scene, 'smoke', 64, [[0, 'rgba(255,255,255,0.6)'], [0.6, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]);
  radial(scene, 'scorch', 96, [[0, 'rgba(0,0,0,0.85)'], [0.5, 'rgba(10,8,6,0.5)'], [1, 'rgba(0,0,0,0)']]);

  // blood decals
  for (let v = 0; v < 3; v++) {
    gfxTexture(scene, `blood_${v}`, 72, 72, (g) => {
      const r = rng(100 + v);
      g.fillStyle(0x5e0b0b, 0.9);
      g.fillCircle(36, 36, 12 + r() * 6);
      for (let i = 0; i < 12; i++) {
        const a = r() * Math.PI * 2, d = 10 + r() * 22;
        g.fillStyle(i % 2 ? 0x6e0f0f : 0x4a0808, 0.85);
        g.fillCircle(36 + Math.cos(a) * d, 36 + Math.sin(a) * d, 2 + r() * 6);
      }
    });
  }

  // headlight cone, pointing up
  canvasTexture(scene, 'cone', 260, 380, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, 'rgba(255,236,190,0.55)');
    grd.addColorStop(0.5, 'rgba(255,230,170,0.18)');
    grd.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 22, h);
    ctx.lineTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w / 2 + 22, h);
    ctx.closePath();
    ctx.fill();
  });

  canvasTexture(scene, 'vignette', GAME_W, GAME_H, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h * 0.62, h * 0.18, w / 2, h * 0.55, h * 0.75);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.6, 'rgba(4,5,8,0.45)');
    grd.addColorStop(1, 'rgba(2,2,4,0.92)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.35);
    top.addColorStop(0, 'rgba(10,14,12,0.85)');
    top.addColorStop(1, 'rgba(10,14,12,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h * 0.35);
  });

  // pickups
  gfxTexture(scene, 'scrap', 22, 22, (g) => {
    g.fillStyle(0xffb02e);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillCircle(11 + Math.cos(a) * 8, 11 + Math.sin(a) * 8, 2.6);
    }
    g.fillCircle(11, 11, 7);
    g.fillStyle(0x7a4f0e);
    g.fillCircle(11, 11, 3);
  });
  gfxTexture(scene, 'medkit', 28, 28, (g) => {
    g.fillStyle(0xe8e2d0);
    g.fillRoundedRect(1, 3, 26, 22, 4);
    g.fillStyle(0xd12e24);
    g.fillRect(11, 7, 6, 14);
    g.fillRect(7, 11, 14, 6);
  });
}

function drawSquadArt(scene) {
  // soldier seen from above, rifle pointing up the road; two leg frames
  for (let f = 0; f < 2; f++) {
    gfxTexture(scene, `soldier_${f}`, 36, 44, (g) => {
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(19, 28, 30, 18);
      g.fillStyle(0x3b3227);
      g.fillRoundedRect(f ? 9 : 12, 30, 7, 12, 3);
      g.fillRoundedRect(f ? 20 : 17, 28, 7, 12, 3);
      g.fillStyle(0x2a2a2c);
      g.fillRoundedRect(22, 0, 5, 24, 2); // rifle barrel
      g.fillStyle(0x4b4d50);
      g.fillRect(21, 14, 7, 10);
      g.fillStyle(0xb5682e); // plaid shirt
      g.fillEllipse(18, 24, 28, 15);
      g.lineStyle(1, 0x7a3f17, 0.8);
      g.lineBetween(10, 22, 26, 22); g.lineBetween(14, 18, 14, 30); g.lineBetween(22, 18, 22, 30);
      g.fillStyle(0x4a3b2b); // vest
      g.fillRoundedRect(11, 19, 14, 11, 3);
      g.fillStyle(0xd9a679); // arms
      g.fillCircle(25, 18, 3.5); g.fillCircle(11, 20, 3.5);
      g.fillStyle(0xc99367);
      g.fillCircle(18, 22, 6.5); // head
      g.fillStyle(0x7d6440); // cap
      g.fillEllipse(18, 20, 13, 10);
      g.fillStyle(0x5e4a2e);
      g.fillRect(14, 13, 8, 4);
    });
  }

  gfxTexture(scene, 'barrelw', 92, 92, (g) => {
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(50, 52, 42);
    g.fillStyle(0x8a5a2b);
    g.fillCircle(46, 46, 42);
    g.fillStyle(0xa86f37);
    g.fillCircle(46, 46, 35);
    g.lineStyle(2, 0x6b4420, 1);
    for (let i = -28; i <= 28; i += 9) g.lineBetween(46 + i, 14, 46 + i, 78);
    g.lineStyle(5, 0x4b4f55, 1);
    g.strokeCircle(46, 46, 40);
    g.strokeCircle(46, 46, 26);
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(46, 46, 22);
  });

  const gun = (key, len, thick, extra) => gfxTexture(scene, key, 90, 40, (g) => {
    g.fillStyle(0x23262a);
    g.fillRoundedRect(10, 20 - thick / 2, len, thick, 3);
    g.fillStyle(0x7d858d);
    g.fillRect(14, 20 - thick / 2 + 2, len - 12, 3);
    g.fillStyle(0x3d2b1b);
    g.fillRoundedRect(4, 18, 16, 14, 3);
    extra && extra(g);
  });
  gun('w_rifle', 62, 8);
  gun('w_smg', 46, 12, (g) => { g.fillStyle(0x23262a); g.fillRect(36, 26, 6, 12); });
  gun('w_minigun', 74, 16, (g) => { g.fillStyle(0x9aa3ab); for (let i = 0; i < 3; i++) g.fillRect(60, 14 + i * 5, 26, 3); });
  gun('w_rocket', 78, 14, (g) => { g.fillStyle(0x4f6b3a); g.fillRoundedRect(8, 12, 72, 16, 7); g.fillStyle(0xd23b2a); g.fillTriangle(80, 12, 80, 28, 90, 20); });

  gfxTexture(scene, 'cactus', 44, 70, (g) => {
    g.fillStyle(0x000000, 0.2); g.fillEllipse(26, 64, 30, 10);
    g.fillStyle(0x4f7a3a);
    g.fillRoundedRect(17, 6, 12, 60, 6);
    g.fillRoundedRect(4, 22, 9, 22, 4); g.fillRect(8, 38, 12, 6);
    g.fillRoundedRect(32, 14, 9, 22, 4); g.fillRect(26, 30, 10, 6);
    g.fillStyle(0x6b9a4c); g.fillRect(20, 8, 3, 54);
  });
  gfxTexture(scene, 'bush', 50, 40, (g) => {
    g.lineStyle(2, 0x7a6a45, 1);
    for (let i = 0; i < 12; i++) g.lineBetween(25, 34, 3 + i * 4, 4 + (i % 4) * 5);
    g.fillStyle(0x8f8a52, 0.8); g.fillCircle(25, 30, 6);
  });

  canvasTexture(scene, 'vignette_soft', GAME_W, GAME_H, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w / 2, h * 0.6, h * 0.3, w / 2, h * 0.55, h * 0.8);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(20,10,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.3);
    sky.addColorStop(0, 'rgba(255,170,90,0.28)');
    sky.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.3);
  });
}

export function generateTextures(scene) {
  drawSquadArt(scene);
  drawRoad(scene);
  drawVehicle(scene);
  drawZombies(scene);
  drawObstacles(scene);
  drawProps(scene);
  drawFx(scene);
}
