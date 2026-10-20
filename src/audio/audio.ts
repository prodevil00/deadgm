// All sound is synthesised with the Web Audio API — no audio files, no licensing issues.
// Mobile browsers only allow audio after a user gesture: call unlock() from a tap handler.

import type { WeaponId } from '../core/weapons';

type Music = 'menu' | 'run' | 'boss' | null;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private comp!: DynamicsCompressorNode;
  private noiseBuf!: AudioBuffer;
  private ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicKind: Music = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private nextNoteT = 0;
  private lastPlay = new Map<string, number>();
  private volumes = { master: 0.8, music: 0.55, sfx: 0.85, muted: false };

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  /** Creates / resumes the context. Must be called from a user gesture on iOS. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -14;
        this.comp.ratio.value = 6;
        this.master = this.ctx.createGain();
        this.sfx = this.ctx.createGain();
        this.music = this.ctx.createGain();
        this.sfx.connect(this.comp);
        this.music.connect(this.comp);
        this.comp.connect(this.master);
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyVolumes();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      this.ctx = null; // audio unavailable: the game stays fully playable
    }
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean): void {
    this.volumes = { master, music, sfx, muted };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  /** Pause everything (tab hidden / game paused). */
  suspend(): void { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume(): void { if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume(); }

  private throttle(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(key) ?? -1;
    if (now - last < minGap) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  // ------------------------------------------------------------------ primitives

  private noise(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, when = 0, freqEnd?: number, dest?: AudioNode): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when = 0, attack = 0.005, dest?: AudioNode, detune = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ game sounds

  gun(w: WeaponId, shots: number): void {
    if (!this.ctx) return;
    const gap = { rifle: 0.075, shotgun: 0.12, hmg: 0.055, launcher: 0.2, railgun: 0.12 }[w];
    if (!this.throttle(`gun-${w}`, gap)) return;
    const vol = Math.min(1, 0.35 + shots * 0.04);
    switch (w) {
      case 'rifle':
        this.noise(0.09, 'bandpass', 1800, 0.9, 0.5 * vol);
        this.tone('square', 180, 60, 0.06, 0.12 * vol);
        break;
      case 'shotgun':
        this.noise(0.22, 'lowpass', 2400, 0.7, 0.7 * vol, 0.002, 0, 400);
        this.tone('sine', 110, 40, 0.18, 0.4 * vol);
        break;
      case 'hmg':
        this.noise(0.07, 'bandpass', 1200, 1.1, 0.45 * vol);
        this.tone('square', 140, 50, 0.05, 0.14 * vol);
        break;
      case 'launcher':
        this.noise(0.25, 'lowpass', 900, 0.8, 0.5, 0.01, 0, 200);
        this.tone('sine', 220, 70, 0.22, 0.3);
        break;
      case 'railgun':
        this.tone('sawtooth', 1600, 120, 0.22, 0.18);
        this.tone('sine', 2400, 400, 0.18, 0.12);
        this.noise(0.12, 'highpass', 3000, 0.7, 0.25);
        break;
    }
  }

  impact(): void {
    if (!this.throttle('impact', 0.05)) return;
    this.noise(0.06, 'bandpass', 600 + Math.random() * 400, 1.2, 0.2);
  }

  splat(): void {
    if (!this.throttle('splat', 0.06)) return;
    this.noise(0.14, 'lowpass', 700, 1, 0.35, 0.004, 0, 160);
    this.tone('sine', 140 + Math.random() * 60, 60, 0.1, 0.15);
  }

  explosion(big = false): void {
    if (!this.throttle('boom', 0.08)) return;
    this.noise(big ? 1.4 : 0.8, 'lowpass', big ? 1400 : 1100, 0.7, big ? 1 : 0.8, 0.005, 0, 70);
    this.tone('sine', big ? 90 : 120, 30, big ? 1.0 : 0.6, big ? 0.9 : 0.7);
    this.noise(0.3, 'highpass', 2500, 0.5, 0.25);
  }

  groan(pitch = 1): void {
    if (!this.ctx || !this.throttle('groan', 0.45)) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = (85 + Math.random() * 40) * pitch;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.75, t + 0.9);
    const lfo = c.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 3;
    const lg = c.createGain();
    lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520 * pitch;
    f.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t); lfo.start(t);
    o.stop(t + 1); lfo.stop(t + 1);
  }

  roar(): void {
    if (!this.ctx || !this.throttle('roar', 0.8)) return;
    this.tone('sawtooth', 70, 45, 1.4, 0.45, 0, 0.12);
    this.tone('sawtooth', 105, 60, 1.3, 0.25, 0.02, 0.12, undefined, 15);
    this.noise(1.3, 'bandpass', 380, 1.5, 0.45, 0.15, 0, 160);
  }

  slam(): void {
    if (!this.throttle('slam', 0.2)) return;
    this.tone('sine', 70, 28, 0.7, 0.9);
    this.noise(0.6, 'lowpass', 500, 0.8, 0.8, 0.003, 0, 60);
  }

  warn(): void {
    if (!this.throttle('warn', 0.35)) return;
    this.tone('square', 880, 880, 0.08, 0.12);
    this.tone('square', 660, 660, 0.1, 0.12, 0.1);
  }

  gate(good: boolean): void {
    if (!this.ctx) return;
    if (good) {
      [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.22, i * 0.05));
      this.noise(0.4, 'highpass', 4000, 0.5, 0.12);
    } else {
      this.tone('sawtooth', 300, 90, 0.4, 0.3);
      this.tone('square', 150, 60, 0.4, 0.2, 0.05);
    }
  }

  recruit(): void {
    if (!this.throttle('recruit', 0.12)) return;
    [392, 523, 659].forEach((f, i) => this.tone('sine', f, f * 1.01, 0.22, 0.2, i * 0.06));
  }

  crate(): void {
    if (!this.ctx) return;
    this.noise(0.25, 'bandpass', 900, 1.2, 0.45);
    [659, 880, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.18, 0.08 + i * 0.06));
  }

  crateHit(): void {
    if (!this.throttle('cratehit', 0.07)) return;
    this.noise(0.05, 'bandpass', 420, 2, 0.25);
  }

  soldierDown(): void {
    if (!this.throttle('down', 0.08)) return;
    this.tone('sine', 300, 120, 0.18, 0.18);
    this.noise(0.1, 'lowpass', 900, 1, 0.2);
  }

  upgrade(): void {
    if (!this.ctx) return;
    [523, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, 0.1, i * 0.07));
    this.tone('triangle', 1568, 1568, 0.4, 0.12, 0.21);
  }

  click(): void {
    if (!this.throttle('click', 0.03)) return;
    this.tone('square', 1200, 900, 0.04, 0.08);
  }

  deny(): void {
    if (!this.throttle('deny', 0.1)) return;
    this.tone('square', 200, 160, 0.14, 0.12);
  }

  airstrike(): void {
    if (!this.ctx) return;
    this.tone('sawtooth', 2200, 300, 0.9, 0.12);
    this.noise(0.9, 'bandpass', 2000, 2, 0.15, 0.2, 0, 400);
  }

  victory(): void {
    if (!this.ctx) return;
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone('triangle', f, f, i === seq.length - 1 ? 0.9 : 0.16, 0.25, i * 0.12));
    seq.forEach((f, i) => this.tone('sine', f / 2, f / 2, 0.2, 0.15, i * 0.12));
  }

  defeat(): void {
    if (!this.ctx) return;
    [392, 370, 349, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, i === 3 ? 1.2 : 0.35, 0.16, i * 0.32));
  }

  // ------------------------------------------------------------------ ambience & music

  ambienceOn(on: boolean): void {
    if (!this.ctx) return;
    if (on && !this.ambience) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 450;
      f.Q.value = 0.6;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.12;
      const lg = c.createGain();
      lg.gain.value = 220;
      lfo.connect(lg).connect(f.frequency);
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.06, c.currentTime, 1);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(); lfo.start();
      this.ambience = { src, gain: g };
    } else if (!on && this.ambience) {
      const a = this.ambience;
      a.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      setTimeout(() => { try { a.src.stop(); } catch { /* already stopped */ } }, 1200);
      this.ambience = null;
    }
  }

  /** Simple procedural soundtrack scheduled ahead with a look-ahead timer. */
  setMusic(kind: Music): void {
    if (kind === this.musicKind) return;
    this.musicKind = kind;
    if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (!kind || !this.ctx) return;
    this.musicStep = 0;
    this.nextNoteT = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private scheduleMusic(): void {
    const c = this.ctx;
    if (!c || !this.musicKind || c.state !== 'running') return;
    const bpm = this.musicKind === 'menu' ? 84 : this.musicKind === 'boss' ? 132 : 112;
    const step = 60 / bpm / 4;
    // A minor riffs
    const bassMenu = [45, 45, 0, 45, 48, 0, 47, 0, 45, 45, 0, 45, 43, 0, 40, 0];
    const bassRun = [45, 0, 45, 45, 48, 0, 45, 0, 50, 0, 48, 0, 47, 0, 43, 0];
    const bassBoss = [40, 40, 52, 40, 41, 41, 53, 41, 40, 40, 52, 40, 43, 43, 44, 44];
    const bass = this.musicKind === 'menu' ? bassMenu : this.musicKind === 'boss' ? bassBoss : bassRun;
    while (this.nextNoteT < c.currentTime + 0.25) {
      const s = this.musicStep % 16;
      const bar = Math.floor(this.musicStep / 16) % 4;
      const t = this.nextNoteT - c.currentTime;
      const n = bass[s];
      if (n) this.tone(this.musicKind === 'menu' ? 'triangle' : 'sawtooth', midi(n + (bar === 3 ? -2 : 0)), midi(n + (bar === 3 ? -2 : 0)), step * 1.6, this.musicKind === 'menu' ? 0.22 : 0.16, t, 0.01, this.music);
      if (this.musicKind !== 'menu') {
        if (s % 4 === 0) { this.kick(t); }
        if (s % 8 === 4) this.noise(0.12, 'bandpass', 1800, 0.8, 0.22, 0.002, t, undefined, this.music);
        if (s % 2 === 1) this.noise(0.03, 'highpass', 7000, 0.5, 0.06, 0.001, t, undefined, this.music);
      } else {
        if (s === 0 || s === 8) this.kick(t, 0.25);
        if (s % 4 === 2) this.noise(0.03, 'highpass', 6000, 0.5, 0.03, 0.001, t, undefined, this.music);
        if (s === 0 && bar % 2 === 0) [57, 60, 64].forEach((m) => this.tone('sine', midi(m), midi(m), step * 14, 0.035, t, 0.4, this.music));
      }
      this.nextNoteT += step;
      this.musicStep++;
    }
  }

  private kick(when: number, gain = 0.5): void {
    this.tone('sine', 150, 42, 0.18, gain, when, 0.002, this.music);
  }
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
