// Unified input state shared by keyboard, gamepad and the touchscreen controls.
// Every source writes into the same state, so all of them can be used at once
// and gameplay code never needs to know which device a press came from.

export const ACTIONS = ['jump', 'attack', 'dash', 'parry', 'interact'];

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', KeyZ: 'jump',
  KeyJ: 'attack', KeyX: 'attack',
  ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash', KeyC: 'dash',
  KeyK: 'parry', KeyV: 'parry',
  KeyE: 'interact', KeyF: 'interact',
  Escape: 'pause', KeyP: 'pause'
};

// Standard gamepad layout.
const PAD_BUTTONS = { 0: 'jump', 2: 'attack', 1: 'dash', 5: 'dash', 4: 'parry', 7: 'parry', 3: 'interact', 9: 'pause' };

class ControlState {
  constructor() {
    this.axis = { keys: 0, touch: 0, pad: 0 };
    this.downDir = { keys: false, touch: false, pad: false };
    this.held = { keys: new Set(), touch: new Set(), pad: new Set() };
    this.lastPress = {};
    this.keyDirs = { left: false, right: false };
    this.lastDevice = null; // 'keys' | 'touch' | 'pad' once used
    this.deviceListeners = new Set();
    this.pauseListeners = new Set();
    this.anyListeners = new Set();
    this.enabled = true;
    this.frameMs = 16.7; // last frame duration, set by the running scene
    this._padPrev = {};
    this._bindKeyboard();
  }

  // ---- queries used by gameplay ----
  get x() {
    const v = this.axis.keys + this.axis.touch + this.axis.pad;
    return Math.max(-1, Math.min(1, v));
  }

  get down() {
    return this.downDir.keys || this.downDir.touch || this.downDir.pad;
  }

  isHeld(action) {
    return this.held.keys.has(action) || this.held.touch.has(action) || this.held.pad.has(action);
  }

  // Input buffer window, stretched on slow frames so a press made during a
  // stutter is still honored on the next frame.
  _window(windowMs) {
    return Math.max(windowMs, this.frameMs * 1.5 + 10);
  }

  // True once if the action was pressed within the last `windowMs` (input buffering).
  consume(action, windowMs = 130) {
    const t = this.lastPress[action];
    if (t === undefined) return false;
    if (performance.now() - t <= this._window(windowMs)) {
      delete this.lastPress[action];
      return true;
    }
    delete this.lastPress[action];
    return false;
  }

  peek(action, windowMs = 130) {
    const t = this.lastPress[action];
    return t !== undefined && performance.now() - t <= this._window(windowMs);
  }

  clearBuffered() {
    this.lastPress = {};
  }

  // ---- writers used by input sources ----
  press(source, action) {
    if (action === 'pause') {
      this.pauseListeners.forEach((fn) => fn());
      return;
    }
    const set = this.held[source];
    if (set.has(action)) return;
    set.add(action);
    if (this.enabled) this.lastPress[action] = performance.now();
    this._setDevice(source);
    this.anyListeners.forEach((fn) => fn(action, source));
  }

  release(source, action) {
    this.held[source].delete(action);
  }

  setAxis(source, value) {
    this.axis[source] = value;
    if (value !== 0) this._setDevice(source);
  }

  setDown(source, value) {
    this.downDir[source] = value;
  }

  releaseAll(source) {
    const sources = source ? [source] : ['keys', 'touch', 'pad'];
    sources.forEach((s) => {
      this.held[s].clear();
      this.axis[s] = 0;
      this.downDir[s] = false;
    });
    if (!source || source === 'keys') this.keyDirs = { left: false, right: false };
  }

  onDeviceChange(fn) { this.deviceListeners.add(fn); return () => this.deviceListeners.delete(fn); }
  onPause(fn) { this.pauseListeners.add(fn); return () => this.pauseListeners.delete(fn); }
  onAnyPress(fn) { this.anyListeners.add(fn); return () => this.anyListeners.delete(fn); }

  _setDevice(source) {
    if (this.lastDevice === source) return;
    this.lastDevice = source;
    this.deviceListeners.forEach((fn) => fn(source));
  }

  // ---- keyboard ----
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      const action = KEYMAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === 'left' || action === 'right') {
        this.keyDirs[action] = true;
        this._updateKeyAxis();
      } else if (action === 'down') {
        this.downDir.keys = true;
        this._setDevice('keys');
      } else {
        this.press('keys', action);
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.code];
      if (!action) return;
      if (action === 'left' || action === 'right') {
        this.keyDirs[action] = false;
        this._updateKeyAxis();
      } else if (action === 'down') {
        this.downDir.keys = false;
      } else {
        this.release('keys', action);
      }
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  _updateKeyAxis() {
    this.setAxis('keys', (this.keyDirs.right ? 1 : 0) - (this.keyDirs.left ? 1 : 0));
  }

  // ---- gamepad (polled once per frame) ----
  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) return;
    let ax = pad.axes[0] || 0;
    if (Math.abs(ax) < 0.25) ax = 0;
    if (pad.buttons[14] && pad.buttons[14].pressed) ax = -1;
    if (pad.buttons[15] && pad.buttons[15].pressed) ax = 1;
    this.setAxis('pad', ax);
    this.setDown('pad', (pad.axes[1] || 0) > 0.6 || !!(pad.buttons[13] && pad.buttons[13].pressed));
    for (const [idx, action] of Object.entries(PAD_BUTTONS)) {
      const b = pad.buttons[idx];
      const pressed = !!(b && b.pressed);
      const key = idx;
      if (pressed && !this._padPrev[key]) this.press('pad', action);
      if (!pressed && this._padPrev[key]) this.release('pad', action);
      this._padPrev[key] = pressed;
    }
  }
}

export const Controls = new ControlState();
