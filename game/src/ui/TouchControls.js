import Phaser from 'phaser';
import { Controls } from '../core/Controls.js';
import { Store } from '../core/Storage.js';
import { Sound } from '../core/Audio.js';
import { safeInsets, FONT, FONT_JP, TEXT_RES } from '../core/Layout.js';
import { isTouchDevice } from '../core/Page.js';

const CYAN = 0x5fe8ff;
const LINE = 0xc9d0d9;

const BUTTONS = [
  { action: 'attack', label: 'ATTACK', jp: '斬', r: 50 },
  { action: 'jump', label: 'JUMP', jp: '跳', r: 46 },
  { action: 'dash', label: 'DASH', jp: '疾', r: 38 },
  { action: 'parry', label: 'PARRY', jp: '受', r: 38 },
  { action: 'interact', label: 'ACT', jp: '触', r: 31 }
];

// On-screen controls. Each finger (pointer id) is tracked on its own, so the
// joystick and any number of buttons can be held at the same time. Buttons
// write straight into the shared Controls state on touch-down for zero delay.
export class TouchControls {
  constructor(scene) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(50);
    this.owner = new Map(); // pointer id -> button object or 'stick'
    this.enabled = true;
    this.highlightInteract = false;
    this.t = 0;

    this.stick = {
      base: scene.add.graphics(),
      knob: scene.add.graphics(),
      ptr: null, x: 0, y: 0, kx: 0, ky: 0, rest: { x: 0, y: 0 }, radius: 64
    };
    this.root.add([this.stick.base, this.stick.knob]);

    this.buttons = BUTTONS.map((def) => {
      const c = scene.add.container(0, 0);
      const g = scene.add.graphics();
      const jp = scene.add.text(0, -6, def.jp, {
        fontFamily: FONT_JP, fontSize: '26px', fontStyle: '900', color: '#eef2f6'
      }).setOrigin(0.5).setResolution(TEXT_RES);
      const lb = scene.add.text(0, 18, def.label, {
        fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#c9d0d9'
      }).setOrigin(0.5).setResolution(TEXT_RES).setLetterSpacing(2);
      c.add([g, jp, lb]);
      this.root.add(c);
      return { ...def, c, g, jp, lb, pressed: false, ptr: null, x: 0, y: 0, rr: def.r };
    });

    const input = scene.input;
    input.addPointer(5);
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    // Safety net for touches that end outside the canvas or get cancelled by the OS.
    this.domEnd = (e) => {
      if (e.touches && e.touches.length === 0) this.releaseAll();
    };
    window.addEventListener('touchend', this.domEnd);
    window.addEventListener('touchcancel', this.domEnd);
    scene.events.once('shutdown', () => this.destroy());

    this.layout();
    this.refreshVisibility();
  }

  destroy() {
    window.removeEventListener('touchend', this.domEnd);
    window.removeEventListener('touchcancel', this.domEnd);
    this.releaseAll();
    const input = this.scene.input;
    input.off('pointerdown', this.onDown, this);
    input.off('pointermove', this.onMove, this);
    input.off('pointerup', this.onUp, this);
    input.off('pointerupoutside', this.onUp, this);
  }

  get visible() {
    return this.root.visible;
  }

  // Shown on touch screens (auto), or always/never if the player chose so.
  refreshVisibility() {
    const mode = Store.settings.touchControls;
    let show;
    if (mode === 'on') show = true;
    else if (mode === 'off') show = false;
    else show = Controls.lastDevice ? Controls.lastDevice === 'touch' : isTouchDevice();
    this.root.setVisible(show);
    this.root.setAlpha(Store.settings.touchOpacity);
    if (!show) this.releaseAll();
  }

  layout() {
    const { width: W, height: H } = this.scene.scale;
    const safe = safeInsets(this.scene.game);
    const s = Store.settings.buttonScale;
    const m = 16;
    const R = W - Math.max(safe.right, 8) - m;
    const B = H - Math.max(safe.bottom, 6) - m;
    const L = Math.max(safe.left, 8) + m;
    const pos = {
      jump: [R - 50 * s, B - 52 * s],
      attack: [R - 168 * s, B - 40 * s],
      dash: [R - 44 * s, B - 166 * s],
      parry: [R - 150 * s, B - 150 * s],
      interact: [R - 262 * s, B - 46 * s]
    };
    this.buttons.forEach((b) => {
      const [x, y] = pos[b.action];
      b.x = x;
      b.y = y;
      b.rr = b.r * s;
      b.c.setPosition(x, y);
      b.jp.setFontSize(Math.round((b.action === 'interact' ? 20 : 26) * s));
      b.jp.setY(-6 * s);
      b.lb.setFontSize(Math.round(11 * s));
      b.lb.setY((b.action === 'interact' ? 13 : 18) * s);
      this.drawButton(b);
    });
    const st = this.stick;
    st.radius = 64 * s;
    st.rest = { x: L + 84 * s, y: B - 78 * s };
    if (st.ptr === null) {
      st.x = st.rest.x;
      st.y = st.rest.y;
      st.kx = st.x;
      st.ky = st.y;
    }
    this.stickZone = { x0: 0, x1: W * 0.45, y0: H * 0.22 };
    this.drawStick();
  }

  drawButton(b) {
    const g = b.g;
    const r = b.rr;
    const on = b.pressed;
    const glow = b.action === 'interact' && this.highlightInteract;
    g.clear();
    g.fillStyle(on ? 0x5fe8ff : 0x05070a, on ? 0.35 : 0.42);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, on || glow ? CYAN : LINE, on ? 1 : 0.75);
    g.strokeCircle(0, 0, r);
    g.lineStyle(1, on ? CYAN : LINE, 0.25);
    g.strokeCircle(0, 0, r - 6);
    // Cyan arc accent at the top.
    g.lineStyle(3, CYAN, on ? 1 : 0.7);
    g.beginPath();
    g.arc(0, 0, r + 4, -Math.PI * 0.72, -Math.PI * 0.28);
    g.strokePath();
    if (glow) {
      g.lineStyle(2, CYAN, 0.5 + 0.4 * Math.sin(this.t * 6));
      g.strokeCircle(0, 0, r + 9);
    }
    b.c.setScale(on ? 0.92 : 1);
    b.jp.setColor(on || glow ? '#5fe8ff' : '#eef2f6');
  }

  drawStick() {
    const st = this.stick;
    const active = st.ptr !== null;
    const r = st.radius;
    st.base.clear();
    st.base.fillStyle(0x05070a, 0.35);
    st.base.fillCircle(st.x, st.y, r);
    st.base.lineStyle(2, active ? CYAN : LINE, active ? 0.9 : 0.6);
    st.base.strokeCircle(st.x, st.y, r);
    // Direction ticks and arrows.
    st.base.lineStyle(1, LINE, 0.35);
    st.base.strokeCircle(st.x, st.y, r * 0.55);
    st.base.fillStyle(active && Controls.axis.touch < 0 ? CYAN : LINE, 0.8);
    st.base.fillTriangle(st.x - r + 10, st.y, st.x - r + 22, st.y - 8, st.x - r + 22, st.y + 8);
    st.base.fillStyle(active && Controls.axis.touch > 0 ? CYAN : LINE, 0.8);
    st.base.fillTriangle(st.x + r - 10, st.y, st.x + r - 22, st.y - 8, st.x + r - 22, st.y + 8);
    st.knob.clear();
    st.knob.fillStyle(active ? 0x5fe8ff : 0xc9d0d9, active ? 0.45 : 0.25);
    st.knob.fillCircle(st.kx, st.ky, r * 0.46);
    st.knob.lineStyle(2, active ? CYAN : 0xeef2f6, 0.9);
    st.knob.strokeCircle(st.kx, st.ky, r * 0.46);
  }

  // Generous hit test: the closest button whose (enlarged) circle contains the point.
  buttonAt(x, y, slack = 1.22) {
    let best = null, bd = Infinity;
    for (const b of this.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.rr * slack && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  onDown(pointer) {
    Sound.unlock();
    if (!this.enabled) return;
    if (this.scene.isUiHit && this.scene.isUiHit(pointer.x, pointer.y)) return;
    if (!this.visible) {
      if (!pointer.wasTouch || Store.settings.touchControls === 'off') return;
      Controls._setDevice('touch');
      this.refreshVisibility();
    }
    if (pointer.wasTouch) Controls._setDevice('touch');
    const b = this.buttonAt(pointer.x, pointer.y);
    if (b) {
      this.pressButton(b, pointer.id);
      return;
    }
    const st = this.stick;
    const z = this.stickZone;
    if (st.ptr === null && pointer.x < z.x1 && pointer.y > z.y0) {
      st.ptr = pointer.id;
      this.owner.set(pointer.id, 'stick');
      // Floating stick: the base appears under the thumb (kept fully on screen).
      const { height: H } = this.scene.scale;
      st.x = Phaser.Math.Clamp(pointer.x, st.radius + 6, z.x1 - st.radius);
      st.y = Phaser.Math.Clamp(pointer.y, z.y0 + st.radius, H - st.radius - 4);
      this.updateStick(pointer.x, pointer.y);
    }
  }

  onMove(pointer) {
    const own = this.owner.get(pointer.id);
    if (!own) return;
    if (own === 'stick') {
      this.updateStick(pointer.x, pointer.y);
      return;
    }
    // Sliding a thumb from one button onto another switches to it.
    const b = this.buttonAt(pointer.x, pointer.y, 1.0);
    if (b && b !== own) {
      this.releaseButton(own);
      this.pressButton(b, pointer.id);
    }
  }

  onUp(pointer) {
    const own = this.owner.get(pointer.id);
    if (!own) return;
    if (own === 'stick') this.releaseStick();
    else this.releaseButton(own);
  }

  pressButton(b, ptrId) {
    if (b.ptr !== null && b.ptr !== ptrId) this.owner.delete(b.ptr);
    b.ptr = ptrId;
    b.pressed = true;
    this.owner.set(ptrId, b);
    Controls.press('touch', b.action);
    this.drawButton(b);
    if (navigator.vibrate && Store.settings.screenShake) {
      try { navigator.vibrate(8); } catch (e) { /* unsupported */ }
    }
  }

  releaseButton(b) {
    if (b.ptr !== null) this.owner.delete(b.ptr);
    b.ptr = null;
    b.pressed = false;
    Controls.release('touch', b.action);
    this.drawButton(b);
  }

  updateStick(px, py) {
    const st = this.stick;
    let dx = px - st.x, dy = py - st.y;
    const d = Math.hypot(dx, dy);
    const max = st.radius;
    if (d > max) {
      // Let the base follow the thumb when it drifts past the edge.
      const over = d - max;
      st.x += (dx / d) * over;
      st.y += (dy / d) * over;
      dx = px - st.x;
      dy = py - st.y;
    }
    st.kx = st.x + dx;
    st.ky = st.y + dy;
    const nx = dx / max;
    const dead = 0.18;
    const ax = Math.abs(nx) < dead ? 0 : Math.sign(nx) * Math.min(1, (Math.abs(nx) - dead) / 0.5);
    Controls.setAxis('touch', ax);
    Controls.setDown('touch', dy / max > 0.6 && Math.abs(nx) < 0.7);
    this.drawStick();
  }

  releaseStick() {
    const st = this.stick;
    if (st.ptr !== null) this.owner.delete(st.ptr);
    st.ptr = null;
    st.x = st.rest.x;
    st.y = st.rest.y;
    st.kx = st.x;
    st.ky = st.y;
    Controls.setAxis('touch', 0);
    Controls.setDown('touch', false);
    this.drawStick();
  }

  releaseAll() {
    this.buttons.forEach((b) => b.pressed && this.releaseButton(b));
    this.releaseStick();
    this.owner.clear();
    Controls.releaseAll('touch');
  }

  setInteractHighlight(on) {
    this.highlightInteract = on;
    this.drawButton(this.buttons.find((b) => b.action === 'interact'));
  }

  update(dt) {
    this.t += dt;
    if (this.highlightInteract) this.drawButton(this.buttons.find((b) => b.action === 'interact'));
    // Release any finger the browser forgot to report as lifted.
    if (this.owner.size) {
      const pointers = this.scene.input.manager.pointers;
      for (const id of Array.from(this.owner.keys())) {
        const p = pointers.find((pp) => pp && pp.id === id);
        if (!p || !p.isDown) {
          const own = this.owner.get(id);
          if (own === 'stick') this.releaseStick();
          else if (own) this.releaseButton(own);
          this.owner.delete(id);
        }
      }
    }
  }
}
