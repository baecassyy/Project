// Local save data: settings and story progress, kept in localStorage.
// Every access is guarded so private browsing or blocked storage never breaks the game.

const KEY = 'requiem-shadows-of-neon:v1';

const DEFAULTS = {
  settings: {
    music: 0.55,
    sfx: 0.8,
    touchOpacity: 0.6,
    buttonScale: 1,
    quality: 'auto',        // auto | high | low
    touchControls: 'auto',  // auto | on | off
    screenShake: true,
    difficulty: 'hard'      // normal | hard
  },
  progress: {
    unlocked: 1,      // highest stage the player may select
    stage: 1,         // stage to resume on "Continue"
    checkpoint: null, // shrine index inside that stage
    defeated: [],     // boss keys
    cleared: false    // finished the game at least once
  }
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const listeners = new Set();

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      progress: { ...DEFAULTS.progress, ...(parsed.progress || {}) }
    };
  } catch (e) {
    return clone(DEFAULTS);
  }
}

let data = load();

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    // Storage full or unavailable: progress lives for this session only.
  }
}

export const Store = {
  get settings() { return data.settings; },
  get progress() { return data.progress; },

  setSetting(key, value) {
    data.settings[key] = value;
    persist();
    listeners.forEach((fn) => fn(key, value));
  },

  onSettingChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  saveProgress(patch) {
    Object.assign(data.progress, patch);
    persist();
  },

  hasSave() {
    const p = data.progress;
    return p.stage > 1 || p.checkpoint !== null || p.unlocked > 1;
  },

  resetProgress() {
    data.progress = clone(DEFAULTS.progress);
    persist();
  }
};
