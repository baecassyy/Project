// Effect quality management. "auto" starts from a device guess and drops to low
// quality if the frame rate stays under target, which also keeps phones cooler.

import { Store } from './Storage.js';

const listeners = new Set();

function guessLowEnd() {
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if (mem && mem <= 3) return true;
  if (cores && cores <= 2) return true;
  return false;
}

export const Perf = {
  level: 'high',
  lowSamples: 0,
  autoDowngraded: false,

  init() {
    this.applySetting(Store.settings.quality);
    Store.onSettingChange((key, value) => {
      if (key === 'quality') this.applySetting(value);
    });
  },

  applySetting(value) {
    this.autoDowngraded = false;
    this.lowSamples = 0;
    this.set(value === 'auto' ? (guessLowEnd() ? 'low' : 'high') : value);
  },

  set(level) {
    if (this.level === level) return;
    this.level = level;
    listeners.forEach((fn) => fn(level));
  },

  get low() {
    return this.level === 'low';
  },

  // Multiplier for particle counts.
  get fx() {
    return this.level === 'low' ? 0.35 : 1;
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Called once per second with the measured fps while a stage is running.
  sample(fps) {
    if (Store.settings.quality !== 'auto' || this.level === 'low') return;
    this.lowSamples = fps < 50 ? this.lowSamples + 1 : Math.max(0, this.lowSamples - 1);
    if (this.lowSamples >= 4) {
      this.autoDowngraded = true;
      this.set('low');
    }
  }
};
