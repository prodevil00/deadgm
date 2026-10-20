// Synthesised sound effects via Web Audio. No audio files, nothing to load.
// Every call is guarded: if audio is blocked or unsupported the game keeps running.

class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noise = null;
    this.engine = null;
    this.lastShot = 0;
    this.lastGroan = 0;
  }

  // Must be called from a user gesture (first click/tap/key).
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.55 : 0;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        this.noise = this.makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.03);
    }
  }

  get ready() {
    return !!this.ctx && this.enabled && this.ctx.state === 'running';
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // --- building blocks -----------------------------------------------------
  tone({ type = 'square', from = 440, to = from, dur = 0.15, vol = 0.2, delay = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst({ dur = 0.12, vol = 0.3, freq = 1200, q = 0.8, type = 'lowpass', sweepTo = null, delay = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // --- game sounds -----------------------------------------------------------
  shoot() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastShot < 0.07) return;
    this.lastShot = now;
    this.burst({ dur: 0.07, vol: 0.16, freq: 2400, sweepTo: 500, type: 'bandpass', q: 1.2 });
    this.tone({ type: 'square', from: 180, to: 60, dur: 0.06, vol: 0.06 });
  }

  hit() { this.burst({ dur: 0.05, vol: 0.12, freq: 900, type: 'lowpass' }); }

  splat() {
    this.burst({ dur: 0.18, vol: 0.22, freq: 600, sweepTo: 150, type: 'lowpass', q: 2 });
    this.tone({ type: 'sawtooth', from: 120, to: 50, dur: 0.15, vol: 0.06 });
  }

  groan() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGroan < 1.8) return;
    this.lastGroan = now;
    const base = 70 + Math.random() * 40;
    const t = now;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.3, t);
    o.frequency.linearRampToValueAtTime(base, t + 0.9);
    lfo.frequency.value = 7 + Math.random() * 4;
    lfoGain.gain.value = 9;
    lfo.connect(lfoGain).connect(o.frequency);
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); lfo.start(t);
    o.stop(t + 1.05); lfo.stop(t + 1.05);
  }

  crash() {
    this.burst({ dur: 0.35, vol: 0.4, freq: 1800, sweepTo: 120, type: 'lowpass', q: 1 });
    this.tone({ type: 'triangle', from: 110, to: 35, dur: 0.3, vol: 0.25 });
  }

  explode() {
    this.burst({ dur: 0.7, vol: 0.5, freq: 900, sweepTo: 60, type: 'lowpass', q: 0.7 });
    this.tone({ type: 'sine', from: 90, to: 25, dur: 0.6, vol: 0.35 });
  }

  hurt() { this.tone({ type: 'square', from: 220, to: 90, dur: 0.18, vol: 0.12 }); }

  pickup() {
    this.tone({ type: 'triangle', from: 880, to: 1320, dur: 0.08, vol: 0.08 });
  }

  heal() {
    this.tone({ type: 'sine', from: 520, to: 780, dur: 0.15, vol: 0.12 });
    this.tone({ type: 'sine', from: 780, to: 1040, dur: 0.2, vol: 0.1, delay: 0.1 });
  }

  gate() {
    this.tone({ type: 'square', from: 330, to: 330, dur: 0.1, vol: 0.08 });
    this.tone({ type: 'square', from: 495, to: 495, dur: 0.1, vol: 0.08, delay: 0.09 });
    this.tone({ type: 'square', from: 660, to: 990, dur: 0.22, vol: 0.08, delay: 0.18 });
  }

  shockwave() {
    this.tone({ type: 'sine', from: 160, to: 30, dur: 0.5, vol: 0.4 });
    this.burst({ dur: 0.5, vol: 0.3, freq: 3000, sweepTo: 200, type: 'lowpass' });
  }

  ui() { this.tone({ type: 'triangle', from: 600, to: 760, dur: 0.06, vol: 0.09 }); }

  denied() { this.tone({ type: 'square', from: 160, to: 120, dur: 0.15, vol: 0.08 }); }

  bossRoar() {
    this.tone({ type: 'sawtooth', from: 90, to: 45, dur: 1.2, vol: 0.25 });
    this.burst({ dur: 1.0, vol: 0.25, freq: 500, sweepTo: 150, type: 'bandpass', q: 2 });
  }

  victory() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'triangle', from: f, to: f, dur: 0.3, vol: 0.12, delay: i * 0.14 }));
  }

  defeat() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'sawtooth', from: f, to: f * 0.97, dur: 0.35, vol: 0.08, delay: i * 0.22 }));
  }

  // --- engine drone ----------------------------------------------------------
  startEngine() {
    if (!this.ctx || this.engine) return;
    try {
      const o = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o2.type = 'square';
      o.frequency.value = 48;
      o2.frequency.value = 24.5;
      f.type = 'lowpass';
      f.frequency.value = 260;
      g.gain.value = 0;
      o.connect(f); o2.connect(f);
      f.connect(g).connect(this.master);
      o.start(); o2.start();
      g.gain.setTargetAtTime(0.07, this.ctx.currentTime, 0.4);
      this.engine = { o, o2, f, g };
    } catch {
      this.engine = null;
    }
  }

  setEngine(speedFactor) {
    if (!this.engine || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine.o.frequency.setTargetAtTime(42 + speedFactor * 26, t, 0.1);
    this.engine.o2.frequency.setTargetAtTime(21 + speedFactor * 13, t, 0.1);
    this.engine.f.frequency.setTargetAtTime(200 + speedFactor * 220, t, 0.1);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const { o, o2, g } = this.engine;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.15);
    o.stop(t + 0.6);
    o2.stop(t + 0.6);
    this.engine = null;
  }
}

export const audio = new SynthAudio();
