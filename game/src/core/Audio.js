// Procedural audio: every sound effect and music track is synthesized with the
// Web Audio API, so there is nothing to download. Mobile browsers only allow audio
// after a user gesture, so unlock() is called from the first tap or key press.

import { Store } from './Storage.js';

// Japanese "In" scale (miyako-bushi) degrees in semitones.
const IN_SCALE = [0, 1, 5, 7, 8];
const HIRAJOSHI = [0, 2, 3, 7, 8];

const TRACKS = {
  title:   { bpm: 72,  root: 40, scale: IN_SCALE,  seed: 3,  drums: 'none',  pluck: 0.5, pad: true },
  shrine:  { bpm: 84,  root: 40, scale: IN_SCALE,  seed: 11, drums: 'taiko', pluck: 0.6, pad: true },
  neon:    { bpm: 104, root: 38, scale: HIRAJOSHI, seed: 7,  drums: 'synth', pluck: 0.7, pad: true },
  abyss:   { bpm: 78,  root: 36, scale: IN_SCALE,  seed: 23, drums: 'taiko', pluck: 0.45, pad: true },
  boss:    { bpm: 132, root: 40, scale: IN_SCALE,  seed: 5,  drums: 'boss',  pluck: 0.8, pad: false },
  final:   { bpm: 140, root: 36, scale: IN_SCALE,  seed: 9,  drums: 'boss',  pluck: 0.85, pad: true },
  ending:  { bpm: 66,  root: 45, scale: HIRAJOSHI, seed: 31, drums: 'none',  pluck: 0.5, pad: true }
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.track = null;
    this.timer = null;
    this.lastPlayed = {};
    this.muffled = false;
  }

  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.musicFilter).connect(this.master);
    this.applyVolumes();

    // Shared white-noise buffer for percussive sounds.
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    Store.onSettingChange((k) => { if (k === 'music' || k === 'sfx') this.applyVolumes(); });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
    return true;
  }

  unlock() {
    if (!this.init()) return;
    if (this.ctx.state !== 'running') this.ctx.resume();
    if (!this._unlocked) {
      // iOS needs a sound started inside the gesture handler.
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
      this._unlocked = true;
      if (this._pendingTrack) {
        const t = this._pendingTrack;
        this._pendingTrack = null;
        this.playMusic(t);
      }
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = Store.settings;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(s.sfx * 0.9, t, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
  }

  // Dims the music while paused.
  setMuffled(on) {
    this.muffled = on;
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.08);
  }

  // ---------- building blocks ----------
  _env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  _osc(type, freq, t, dur, peak, bus, freqEnd, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    this._env(g, t, attack, peak, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  _noise(t, dur, peak, bus, filterType, f0, f1, q = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.003, peak, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.lastPlayed[name] && now - this.lastPlayed[name] < 0.03) return;
    this.lastPlayed[name] = now;
    const t = now + 0.005;
    const b = this.sfxBus;
    const p = opts.pitch || 1;
    switch (name) {
      case 'slash':
        this._noise(t, 0.13, 0.5, b, 'bandpass', 4200 * p, 900, 1.4);
        this._osc('sine', 1900 * p, t, 0.06, 0.08, b, 2600 * p);
        break;
      case 'slashHeavy':
        this._noise(t, 0.22, 0.7, b, 'bandpass', 3000, 400, 1.2);
        this._osc('sawtooth', 220, t, 0.18, 0.08, b, 70);
        break;
      case 'jump':
        this._osc('triangle', 260 * p, t, 0.09, 0.15, b, 520 * p);
        break;
      case 'land':
        this._noise(t, 0.06, 0.15, b, 'lowpass', 500, 200);
        break;
      case 'dash':
        this._noise(t, 0.2, 0.4, b, 'bandpass', 500, 3500, 0.8);
        break;
      case 'parry':
        this._osc('sine', 2093, t, 0.7, 0.28, b);
        this._osc('sine', 3136, t, 0.5, 0.16, b);
        this._osc('triangle', 1046, t, 0.4, 0.2, b);
        this._noise(t, 0.05, 0.6, b, 'highpass', 3000);
        break;
      case 'block':
        this._osc('square', 420, t, 0.1, 0.12, b, 300);
        this._noise(t, 0.08, 0.35, b, 'bandpass', 2400, 1200, 2);
        break;
      case 'clang':
        this._osc('square', 900, t, 0.25, 0.1, b, 860);
        this._osc('sine', 1340, t, 0.35, 0.12, b);
        this._noise(t, 0.06, 0.4, b, 'highpass', 2500);
        break;
      case 'hit':
        this._noise(t, 0.1, 0.55, b, 'lowpass', 2600, 300);
        this._osc('sine', 160, t, 0.12, 0.35, b, 60);
        break;
      case 'hurt':
        this._osc('sawtooth', 240, t, 0.28, 0.2, b, 70);
        this._noise(t, 0.15, 0.4, b, 'lowpass', 1500, 200);
        break;
      case 'kill':
        this._noise(t, 0.4, 0.5, b, 'bandpass', 2000, 150, 0.7);
        this._osc('sine', 600, t, 0.35, 0.18, b, 80);
        break;
      case 'shoot':
        this._osc('square', 880, t, 0.1, 0.06, b, 300);
        break;
      case 'orb':
        this._osc('sine', 300, t, 0.25, 0.12, b, 700);
        this._osc('triangle', 600, t, 0.2, 0.05, b, 1400);
        break;
      case 'warn':
        this._osc('sine', 1567, t, 0.12, 0.12, b);
        this._osc('sine', 1567, t + 0.14, 0.12, 0.1, b);
        break;
      case 'slam':
        this._osc('sine', 110, t, 0.45, 0.6, b, 35);
        this._noise(t, 0.35, 0.5, b, 'lowpass', 900, 100);
        break;
      case 'teleport':
        this._osc('sine', 1200, t, 0.25, 0.1, b, 200);
        this._noise(t, 0.2, 0.2, b, 'highpass', 6000, 1500);
        break;
      case 'shrine':
        [587, 880, 1174, 1568].forEach((f, i) => this._osc('sine', f, t + i * 0.09, 1.6, 0.12, b));
        break;
      case 'lore':
        this._osc('triangle', 659, t, 0.9, 0.1, b);
        this._osc('sine', 988, t + 0.1, 0.9, 0.06, b);
        break;
      case 'ui':
        this._osc('sine', 1320, t, 0.05, 0.1, b);
        break;
      case 'uiBack':
        this._osc('sine', 880, t, 0.06, 0.1, b, 660);
        break;
      case 'roar':
        this._osc('sawtooth', 70, t, 1.1, 0.3, b, 45, 0.08);
        this._osc('sawtooth', 104, t, 1.0, 0.18, b, 60, 0.08);
        this._noise(t, 1.0, 0.35, b, 'lowpass', 700, 150);
        break;
      case 'bossDown':
        this._osc('sine', 220, t, 2.2, 0.4, b, 30);
        this._noise(t, 1.6, 0.5, b, 'lowpass', 3000, 80);
        [880, 1174, 1760].forEach((f, i) => this._osc('sine', f, t + 0.6 + i * 0.15, 2, 0.08, b));
        break;
      case 'death':
        this._osc('triangle', 440, t, 1.2, 0.2, b, 110);
        this._osc('sine', 330, t + 0.2, 1.2, 0.15, b, 80);
        break;
      default:
        break;
    }
  }

  // ---------- music ----------
  playMusic(name) {
    if (!TRACKS[name]) return;
    if (!this.ctx || !this._unlocked) {
      this._pendingTrack = name;
      return;
    }
    if (this.track && this.track.name === name) return;
    this.stopMusic(0.6);
    const def = TRACKS[name];
    const r = rng(def.seed);
    // Pre-generate a 64-step (4 bar) loop so the track is consistent every time.
    const steps = 64;
    const melody = [];
    let deg = 5;
    for (let i = 0; i < steps; i++) {
      const play = (i % 2 === 0 && r() < def.pluck) || (i % 4 === 0 && r() < 0.9);
      deg = Math.max(0, Math.min(11, deg + Math.floor(r() * 5) - 2));
      melody.push(play ? deg : null);
    }
    const chords = [0, 0, 3, 2].map((d) => d);
    const now = this.ctx.currentTime + 0.1;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(1, now + 1.2);
    bus.connect(this.musicBus);
    this.track = { name, def, melody, chords, step: 0, next: now, bus };
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stopMusic(fade = 0.4) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._pendingTrack = null;
    if (this.track && this.ctx) {
      const { bus } = this.track;
      const t = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => bus.disconnect(), (fade + 0.2) * 1000);
    }
    this.track = null;
  }

  _note(deg, octave = 0) {
    const { def } = this.track;
    const sc = def.scale;
    const o = Math.floor(deg / sc.length);
    return def.root + 24 + sc[deg % sc.length] + 12 * (o + octave);
  }

  _schedule() {
    const tr = this.track;
    if (!tr || !this.ctx) return;
    const ctx = this.ctx;
    const stepDur = 60 / tr.def.bpm / 4;
    while (tr.next < ctx.currentTime + 0.15) {
      this._playStep(tr, tr.step, tr.next, stepDur);
      tr.step = (tr.step + 1) % 64;
      tr.next += stepDur;
    }
  }

  _playStep(tr, step, t, sd) {
    const { def, bus } = tr;
    const bar = Math.floor(step / 16);
    const chordRoot = tr.chords[bar];
    const beat = step % 4 === 0;

    // Bass pulse.
    if (beat) {
      const m = def.root + def.scale[chordRoot % def.scale.length];
      this._osc('triangle', mtof(m), t, sd * 3.2, 0.32, bus);
    }

    // Koto-like pluck melody.
    const deg = tr.melody[step];
    if (deg !== null) {
      const f = mtof(this._note(deg + chordRoot));
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
      o.type = 'sawtooth';
      o.frequency.value = f;
      this._env(g, t, 0.003, 0.09, 0.5);
      o.connect(lp).connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.6);
    }

    // Slow pad at the start of each bar.
    if (def.pad && step % 16 === 0) {
      [0, 2, 4].forEach((d, i) => {
        const f = mtof(this._note(chordRoot + d, -1));
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f * (i === 1 ? 1.003 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + sd * 4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + sd * 16);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + sd * 16 + 0.1);
      });
    }

    // Percussion.
    const d = def.drums;
    if (d === 'taiko') {
      if (step % 8 === 0 || step % 16 === 14) this._taiko(t, bus, step % 16 === 0 ? 0.55 : 0.35);
    } else if (d === 'synth') {
      if (step % 8 === 0) this._taiko(t, bus, 0.45);
      if (step % 8 === 4) this._noise(t, 0.12, 0.18, bus, 'bandpass', 1800, 900, 0.8);
      if (step % 2 === 0) this._noise(t, 0.03, 0.06, bus, 'highpass', 7000);
    } else if (d === 'boss') {
      if (step % 4 === 0) this._taiko(t, bus, 0.55);
      if (step % 8 === 4) this._noise(t, 0.14, 0.25, bus, 'bandpass', 1500, 700, 0.8);
      if (step % 2 === 1) this._noise(t, 0.025, 0.07, bus, 'highpass', 8000);
    }
  }

  _taiko(t, bus, peak) {
    this._osc('sine', 120, t, 0.35, peak, bus, 48);
    this._noise(t, 0.08, peak * 0.4, bus, 'lowpass', 800, 200);
  }
}

export const Sound = new AudioEngine();
