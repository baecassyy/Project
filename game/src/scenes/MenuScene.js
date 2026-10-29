import Phaser from 'phaser';
import { ensureStageArt } from '../gfx/Art.js';
import { Store } from '../core/Storage.js';
import { Sound } from '../core/Audio.js';
import { Controls } from '../core/Controls.js';
import { safeInsets } from '../core/Layout.js';
import { isTouchDevice, isIOS, fullscreenSupported, enterFullscreen, isFullscreen } from '../core/Page.js';
import { STAGES } from '../data/stages.js';
import { Button, MenuNav, text } from '../ui/Widgets.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';

const BOSS_NAMES = { kitsune: 'HOLLOW KITSUNE', ronin: 'IRON RONIN', shogun: 'SHOGUN OF THE VOID' };

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    ensureStageArt(this, 1);
    Controls.releaseAll();
    this.layer = null;
    this.started = this.registry.get('menuStarted') || false;
    this.buildBackdrop();
    this.ui = this.add.container(0, 0).setDepth(10);
    this.render();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));
    if (this.started) Sound.playMusic('title');
  }

  buildBackdrop() {
    const { width, height } = this.scale;
    this.sky = this.add.image(0, 0, 'sky1').setOrigin(0).setDisplaySize(width, height);
    this.moon = this.add.image(width * 0.72, 130, 'moon1');
    this.bgs = ['bg1a', 'bg1b', 'bg1c'].map((k, i) => {
      const h = this.textures.get(k).getSourceImage().height;
      return { ts: this.add.tileSprite(0, height - h + [60, 20, -40][i], width, h, k).setOrigin(0), f: [0.1, 0.3, 0.6][i], h, lift: [60, 20, -40][i] };
    });
    this.spirits = this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: width }, y: { min: height * 0.4, max: height }, lifespan: 6000,
      speedY: { min: -26, max: -8 }, scale: { start: 0.35, end: 0.1 }, alpha: { start: 0.7, end: 0 },
      blendMode: 'ADD', tint: [0xffffff, 0x5fe8ff], frequency: 300
    });
    this.shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.35).setOrigin(0);
    this.ninja = this.add.image(width * 0.76, height - 40, 'ninja', 'idle0').setOrigin(0.5, 84 / 96).setScale(2.2);
    this.tweens.add({ targets: this.ninja, y: '-=4', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  onResize() {
    const { width, height } = this.scale;
    this.sky.setDisplaySize(width, height);
    this.moon.setPosition(width * 0.72, 130);
    this.bgs.forEach((b) => {
      b.ts.setSize(width, b.h);
      b.ts.y = height - b.h + b.lift;
    });
    this.shade.setSize(width, height);
    this.ninja.setPosition(width * 0.76, height - 40);
    this.spirits.ops.x.loadConfig({ x: { min: 0, max: width } });
    this.render();
  }

  clearUi() {
    if (this.nav) this.nav.destroy();
    this.nav = null;
    this.ui.removeAll(true);
  }

  render() {
    if (this.settings) return;
    this.clearUi();
    if (!this.started) this.renderSplash();
    else if (this.view === 'stages') this.renderStages();
    else this.renderMain();
  }

  title(x, y, scale = 1) {
    const ui = this.ui;
    ui.add(text(this, x, y, '鎮魂歌', 64 * scale, { jp: true, weight: '900', color: '#5fe8ff' }));
    ui.add(text(this, x + 4, y + 84 * scale, 'REQUIEM', 58 * scale, { spacing: 18 * scale }));
    ui.add(text(this, x + 6, y + 146 * scale, 'SHADOWS OF NEON', 18 * scale, { spacing: 12 * scale, color: '#9aa3b0' }));
    const g = this.add.graphics();
    g.fillStyle(0x5fe8ff, 1).fillRect(x + 6, y + 176 * scale, 160 * scale, 2);
    ui.add(g);
  }

  renderSplash() {
    const { width, height } = this.scale;
    const safe = safeInsets(this.game);
    const s = Math.min(1, height / 540);
    this.title(Math.max(safe.left, 0) + 56, height * 0.18, s);
    const touch = isTouchDevice();
    const prompt = text(this, width / 2, height * 0.8, touch ? 'TAP TO BEGIN' : 'PRESS ANY KEY OR CLICK TO BEGIN', 20, { ox: 0.5, spacing: 8, color: '#eef2f6' });
    this.ui.add(prompt);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 900, yoyo: true, repeat: -1 });
    const zone = this.add.zone(0, 0, width, height).setOrigin(0).setInteractive();
    this.ui.add(zone);
    const begin = () => {
      if (this.started) return;
      window.removeEventListener('keydown', onKey);
      Sound.unlock();
      Sound.play('ui');
      // Fullscreen + landscape lock must be requested inside a user gesture.
      if (touch && fullscreenSupported()) enterFullscreen();
      this.started = true;
      this.registry.set('menuStarted', true);
      Sound.playMusic('title');
      this.render();
    };
    const onKey = () => begin();
    zone.on('pointerup', begin);
    window.addEventListener('keydown', onKey, { once: true });
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));
  }

  renderMain() {
    const { width, height } = this.scale;
    const safe = safeInsets(this.game);
    const s = Math.min(1, height / 540);
    const left = Math.max(safe.left, 0) + 56;
    this.title(left, 40 * s, 0.72 * s);

    const p = Store.progress;
    const showFs = fullscreenSupported() && !isFullscreen();
    const count = (Store.hasSave() ? 1 : 0) + 3 + (showFs ? 1 : 0);
    // Fit the buttons between the title and the footer on short screens.
    const top = 40 * s + 176 * 0.72 * s + 26;
    const avail = height - Math.max(safe.bottom, 4) - 58 - top;
    const gap = 8;
    const bh = Math.max(40, Math.min(52, avail / count - gap));
    const bw = Math.min(330, width * 0.42);
    let y = top + bh / 2;
    const buttons = [];
    const addBtn = (label, jp, fn, enabled = true) => {
      const b = new Button(this, left + bw / 2, y, bw, bh, label, { jp, onTap: fn, enabled, size: Math.min(18, Math.round(bh * 0.36)) });
      this.ui.add(b);
      buttons.push(b);
      y += bh + gap;
      return b;
    };
    if (Store.hasSave()) {
      const st = STAGES[p.stage - 1];
      addBtn(`CONTINUE · ${st.chapter}`, '続', () => this.startStage(p.stage, p.checkpoint));
    }
    addBtn('NEW GAME', '始', () => this.startStage(1, null));
    addBtn('SELECT STAGE', '章', () => {
      this.view = 'stages';
      this.render();
    });
    addBtn('SETTINGS', '設定', () => this.openSettings());
    if (showFs) addBtn('FULLSCREEN', '全画面', () => enterFullscreen().then(() => this.time.delayedCall(300, () => this.render())));
    this.nav = new MenuNav(this, buttons);

    // Footer: control reference and the iPhone home-screen tip.
    const bottom = height - Math.max(safe.bottom, 4) - 14;
    let footer;
    if (isTouchDevice()) {
      footer = 'Left thumb: move  ·  Right thumb: 斬 attack · 跳 jump · 疾 dash · 受 parry · 触 interact';
      if (isIOS() && !window.navigator.standalone && !fullscreenSupported()) footer += '\nFor fullscreen on iPhone: Share → Add to Home Screen';
    } else {
      footer = 'A/D or ←/→ move · Space jump · J attack · L/Shift dash · K parry (hold to block) · E interact · Esc pause · Gamepad supported';
    }
    this.ui.add(text(this, left, bottom, footer, 13, { oy: 1, color: '#7d8794', wrap: width - left - 40 }));
    if (p.cleared) this.ui.add(text(this, width - Math.max(safe.right, 0) - 30, Math.max(safe.top, 0) + 24, '鎮魂 · REQUIEM COMPLETE', 13, { ox: 1, color: '#5fe8ff', spacing: 3 }));
  }

  renderStages() {
    const { width, height } = this.scale;
    const safe = safeInsets(this.game);
    const top = Math.max(safe.top, 0) + 30;
    this.ui.add(text(this, width / 2, top, 'SELECT STAGE', 24, { ox: 0.5, spacing: 8 }));
    this.ui.add(text(this, width / 2, top + 34, '章を選ぶ', 16, { ox: 0.5, jp: true, color: '#5fe8ff' }));
    const unlocked = Store.progress.unlocked;
    const gap = 18;
    const cw = Math.min(280, (width - 80 - gap * 2) / 3), ch = Math.min(260, height - 220);
    const x0 = width / 2 - (cw * 3 + gap * 2) / 2;
    const buttons = [];
    STAGES.forEach((st, i) => {
      const open = st.id <= unlocked;
      const cx = x0 + i * (cw + gap) + cw / 2, cy = top + 80 + ch / 2;
      const card = new Button(this, cx, cy, cw, ch, '', { enabled: open, onTap: () => this.startStage(st.id, null) });
      this.ui.add(card);
      buttons.push(card);
      const tc = this.add.container(cx, cy);
      tc.add(text(this, 0, -ch / 2 + 24, st.chapter, 16, { jp: true, ox: 0.5, color: open ? '#5fe8ff' : '#3b414b' }));
      tc.add(text(this, 0, -ch / 2 + 70, open ? st.jp : '封印', Math.min(30, cw / 7), { jp: true, weight: '900', ox: 0.5, color: open ? '#eef2f6' : '#3b414b' }));
      tc.add(text(this, 0, 10, open ? st.name.toUpperCase() : 'SEALED', 15, { ox: 0.5, align: 'center', spacing: 2, wrap: cw - 20, color: open ? '#c9d0d9' : '#3b414b' }));
      if (open) {
        const beaten = (Store.progress.defeated || []).includes(st.boss);
        tc.add(text(this, 0, ch / 2 - 46, `BOSS · ${BOSS_NAMES[st.boss]}`, 12, { ox: 0.5, align: 'center', color: '#7d8794', wrap: cw - 20 }));
        if (beaten) tc.add(text(this, 0, ch / 2 - 24, '討伐済 DEFEATED', 12, { ox: 0.5, color: '#5fe8ff' }));
      }
      this.ui.add(tc);
    });
    const back = new Button(this, width / 2, Math.min(height - Math.max(safe.bottom, 4) - 40, top + 110 + ch), 220, 50, 'BACK', {
      jp: '戻る', onTap: () => {
        this.view = 'main';
        this.render();
      }
    });
    this.ui.add(back);
    buttons.push(back);
    this.nav = new MenuNav(this, buttons);
    this.escHandler = (e) => {
      if (e.code === 'Escape' && this.view === 'stages') {
        this.view = 'main';
        this.render();
      }
    };
    window.addEventListener('keydown', this.escHandler);
    this.events.once('shutdown', () => window.removeEventListener('keydown', this.escHandler));
  }

  openSettings() {
    if (this.nav) this.nav.active = false;
    this.settings = new SettingsPanel(this, () => {
      this.settings = null;
      this.render();
    }, { allowReset: true });
    this.settings.setDepth(100);
  }

  startStage(stage, checkpoint) {
    if (this.leaving) return;
    this.leaving = true;
    Sound.unlock();
    Store.saveProgress({ stage, checkpoint });
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('StageCard', { stage, checkpoint }));
  }

  update(time, delta) {
    const t = time / 1000;
    this.bgs.forEach((b) => {
      b.ts.tilePositionX = t * 30 * b.f;
    });
    Controls.pollGamepad();
  }
}
