import Phaser from 'phaser';
import { FONT, FONT_JP, TEXT_RES } from '../core/Layout.js';
import { Sound } from '../core/Audio.js';

export const C = {
  panel: 0x0b0d11, panelHi: 0x0f1d24, line: 0x9aa3b0, dim: 0x2a2f38, cyan: 0x5fe8ff, white: 0xeef2f6
};

export function text(scene, x, y, str, size = 18, opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: opts.jp ? FONT_JP : FONT,
    fontSize: `${size}px`,
    fontStyle: opts.weight || '700',
    color: opts.color || '#e9edf2',
    align: opts.align || 'left',
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: opts.lineSpacing || 4
  });
  t.setResolution(TEXT_RES);
  if (opts.spacing) t.setLetterSpacing(opts.spacing);
  t.setOrigin(opts.ox ?? 0, opts.oy ?? 0);
  return t;
}

// Large touch-friendly button with press feedback; fires on release over the button.
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, h, label, opts = {}) {
    super(scene, x, y);
    this.w = w;
    this.h = h;
    this.onTap = opts.onTap || (() => {});
    this.enabled = opts.enabled !== false;
    this.focused = false;
    this.pressed = false;
    this.g = scene.add.graphics();
    this.label = text(scene, opts.jp ? -w / 2 + 22 : 0, 0, label, opts.size || Math.round(h * 0.4), {
      ox: opts.jp ? 0 : 0.5, oy: 0.5, spacing: 3
    });
    this.add([this.g, this.label]);
    if (opts.jp) {
      this.jp = text(scene, w / 2 - 18, 0, opts.jp, Math.round(h * 0.36), { jp: true, ox: 1, oy: 0.5, color: '#5b626e', weight: '900' });
      this.add(this.jp);
    }
    this.setSize(w, h);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      Sound.unlock();
      this.pressed = true;
      this.draw();
    });
    this.on('pointerup', () => {
      if (!this.enabled || !this.pressed) return;
      this.pressed = false;
      this.draw();
      Sound.play('ui');
      this.onTap();
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.hover = false;
      this.draw();
    });
    this.on('pointerover', () => {
      this.hover = true;
      this.draw();
    });
    this.draw();
    scene.add.existing(this);
  }

  setEnabled(v) {
    this.enabled = v;
    this.draw();
    return this;
  }

  setFocus(v) {
    this.focused = v;
    this.draw();
    return this;
  }

  setLabel(str) {
    this.label.setText(str);
    return this;
  }

  draw() {
    const { g, w, h } = this;
    const hot = this.enabled && (this.focused || this.hover || this.pressed);
    g.clear();
    g.fillStyle(this.pressed ? 0x123a46 : hot ? C.panelHi : C.panel, this.enabled ? 0.88 : 0.96);
    g.fillRect(-w / 2, -h / 2, w, h);
    g.lineStyle(1.5, hot ? C.cyan : C.line, this.enabled ? (hot ? 1 : 0.55) : 0.25);
    g.strokeRect(-w / 2, -h / 2, w, h);
    // Cut corner accent.
    g.fillStyle(this.enabled ? C.cyan : C.dim, hot ? 1 : 0.6);
    g.fillRect(-w / 2, -h / 2, 4, h);
    if (hot) {
      g.lineStyle(1, C.cyan, 0.35);
      g.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    }
    this.label.setColor(this.enabled ? '#eef2f6' : '#5b626e');
    this.setScale(this.pressed ? 0.97 : 1);
  }
}

// Draggable slider; the handle is large enough for thumbs.
export class Slider extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, label, value, onChange, opts = {}) {
    super(scene, x, y);
    this.w = w;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 1;
    this.step = opts.step ?? 0.05;
    this.format = opts.format || ((v) => `${Math.round(v * 100)}%`);
    this.value = value;
    this.onChange = onChange;
    this.labelT = text(scene, 0, -22, label, 16, { color: '#c9d0d9', spacing: 2 });
    this.valueT = text(scene, w, -22, '', 16, { ox: 1, color: '#5fe8ff' });
    this.g = scene.add.graphics();
    this.add([this.g, this.labelT, this.valueT]);
    this.zone = scene.add.zone(0, 10, w, 46).setOrigin(0, 0.5).setInteractive();
    this.add(this.zone);
    this.dragId = null;
    this.zone.on('pointerdown', (p) => {
      this.dragId = p.id;
      this.setFromPointer(p);
    });
    this.onMove = (p) => {
      if (p.id === this.dragId && p.isDown) this.setFromPointer(p);
    };
    this.onUp = (p) => {
      if (p.id === this.dragId) {
        this.dragId = null;
        Sound.play('ui');
      }
    };
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    this.once('destroy', () => {
      scene.input.off('pointermove', this.onMove);
      scene.input.off('pointerup', this.onUp);
    });
    this.draw();
    scene.add.existing(this);
  }

  setFromPointer(p) {
    const m = this.getWorldTransformMatrix();
    const local = (p.x - m.tx) / m.scaleX;
    let v = this.min + Phaser.Math.Clamp(local / this.w, 0, 1) * (this.max - this.min);
    v = Math.round(v / this.step) * this.step;
    v = Phaser.Math.Clamp(Number(v.toFixed(3)), this.min, this.max);
    if (v !== this.value) {
      this.value = v;
      this.onChange(v);
      this.draw();
    }
  }

  draw() {
    const { g, w } = this;
    const k = (this.value - this.min) / (this.max - this.min);
    g.clear();
    g.fillStyle(C.dim, 1);
    g.fillRect(0, 8, w, 4);
    g.fillStyle(C.cyan, 1);
    g.fillRect(0, 8, w * k, 4);
    for (let i = 0; i <= 10; i++) {
      g.fillStyle(C.line, 0.35);
      g.fillRect((w * i) / 10 - 0.5, 15, 1, 4);
    }
    g.fillStyle(0x050609, 1);
    g.fillCircle(w * k, 10, 13);
    g.lineStyle(2, C.cyan, 1);
    g.strokeCircle(w * k, 10, 13);
    g.fillStyle(C.white, 1);
    g.fillCircle(w * k, 10, 4);
    this.valueT.setText(this.format(this.value));
  }
}

// Segmented option picker (e.g. Auto / High / Low).
export class Choice extends Phaser.GameObjects.Container {
  constructor(scene, x, y, w, label, options, value, onChange) {
    super(scene, x, y);
    this.options = options;
    this.value = value;
    this.onChange = onChange;
    this.add(text(scene, 0, -32, label, 16, { color: '#c9d0d9', spacing: 2 }));
    const segW = w / options.length;
    this.segs = options.map((o, i) => {
      const g = scene.add.graphics();
      const t = text(scene, i * segW + segW / 2, 12, o.label, 15, { ox: 0.5, oy: 0.5, spacing: 1 });
      const z = scene.add.zone(i * segW, 12, segW - 4, 40).setOrigin(0, 0.5).setInteractive();
      z.on('pointerup', () => {
        if (this.value === o.value) return;
        this.value = o.value;
        Sound.play('ui');
        this.onChange(o.value);
        this.draw();
      });
      this.add([g, t, z]);
      return { g, t, x: i * segW, w: segW - 4, value: o.value };
    });
    this.draw();
    scene.add.existing(this);
  }

  draw() {
    this.segs.forEach((s) => {
      const on = s.value === this.value;
      s.g.clear();
      s.g.fillStyle(on ? 0x123a46 : C.panel, 0.9);
      s.g.fillRect(s.x, -6, s.w, 36);
      s.g.lineStyle(1.5, on ? C.cyan : C.line, on ? 1 : 0.4);
      s.g.strokeRect(s.x, -6, s.w, 36);
      s.t.setColor(on ? '#5fe8ff' : '#9aa3b0');
    });
  }
}

// Keyboard / gamepad focus navigation over a vertical list of buttons.
export class MenuNav {
  constructor(scene, buttons) {
    this.scene = scene;
    this.buttons = buttons.filter((b) => b.enabled);
    this.index = -1;
    this.handler = (e) => {
      if (!this.active) return;
      const k = e.code;
      if (k === 'ArrowDown' || k === 'KeyS') this.move(1);
      else if (k === 'ArrowUp' || k === 'KeyW') this.move(-1);
      else if ((k === 'Enter' || k === 'Space' || k === 'KeyJ') && this.index >= 0) {
        Sound.unlock();
        Sound.play('ui');
        this.buttons[this.index].onTap();
      }
    };
    this.active = true;
    window.addEventListener('keydown', this.handler);
    scene.events.once('shutdown', () => this.destroy());
  }

  move(d) {
    if (!this.buttons.length) return;
    if (this.index >= 0) this.buttons[this.index].setFocus(false);
    this.index = (this.index + d + this.buttons.length) % this.buttons.length;
    this.buttons[this.index].setFocus(true);
    Sound.play('ui');
  }

  destroy() {
    this.active = false;
    window.removeEventListener('keydown', this.handler);
  }
}
