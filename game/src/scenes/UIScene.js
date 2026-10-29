import Phaser from 'phaser';
import { Controls } from '../core/Controls.js';
import { Store } from '../core/Storage.js';
import { Sound } from '../core/Audio.js';
import { safeInsets } from '../core/Layout.js';
import { onOrientationBlock, isPortraitBlocked } from '../core/Page.js';
import { Perf } from '../core/Perf.js';
import { TouchControls } from '../ui/TouchControls.js';
import { SettingsPanel } from '../ui/SettingsPanel.js';
import { Button, MenuNav, text } from '../ui/Widgets.js';

// HUD, touch controls and the pause menu. Runs on top of the GameScene with its
// own fixed camera, so nothing here moves when the game camera scrolls.
export class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  create() {
    this.paused = false;
    this.hp = 8;
    this.maxHp = 8;
    this.bossRatio = 1;
    this.bossTrail = 1;
    this.bossVisible = false;

    this.hpG = this.add.graphics();
    this.hpLabel = text(this, 0, 0, '命', 22, { jp: true, weight: '900', color: '#5fe8ff', oy: 0.5 });
    this.stageLabel = text(this, 0, 0, '', 13, { color: '#7d8794', spacing: 2 });

    this.bossG = this.add.graphics().setVisible(false);
    this.bossName = text(this, 0, 0, '', 15, { ox: 0.5, spacing: 4 }).setVisible(false);

    this.promptT = text(this, 0, 0, '', 16, { ox: 0.5, oy: 0.5, spacing: 2, color: '#eef2f6' }).setVisible(false);
    this.promptBg = this.add.graphics().setVisible(false);

    this.toastC = this.add.container(0, 0).setVisible(false).setDepth(60);
    this.toastBg = this.add.graphics();
    this.toastT = text(this, 0, 0, '', 17, { ox: 0.5, oy: 0.5, align: 'center', lineSpacing: 6 });
    this.toastC.add([this.toastBg, this.toastT]);

    this.bannerBig = text(this, 0, 0, '', 96, { jp: true, weight: '900', ox: 0.5, oy: 0.5 }).setAlpha(0).setDepth(70);
    this.bannerSmall = text(this, 0, 0, '', 20, { ox: 0.5, oy: 0.5, spacing: 8, color: '#5fe8ff' }).setAlpha(0).setDepth(70);
    this.parryT = text(this, 0, 0, '弾', 54, { jp: true, weight: '900', ox: 0.5, oy: 0.5, color: '#5fe8ff' }).setAlpha(0).setDepth(70);
    this.bossCardJp = text(this, 0, 0, '', 64, { jp: true, weight: '900', ox: 0.5, oy: 0.5 }).setAlpha(0).setDepth(70);
    this.bossCardEn = text(this, 0, 0, '', 22, { ox: 0.5, oy: 0.5, spacing: 10, color: '#c9d0d9' }).setAlpha(0).setDepth(70);

    // Pause button (top-right, inside the safe area).
    this.pauseBtn = this.add.container(0, 0).setDepth(160); // above the pause overlay so it also resumes
    const pg = this.add.graphics();
    pg.fillStyle(0x05070a, 0.5).fillRoundedRect(-26, -26, 52, 52, 8);
    pg.lineStyle(1.5, 0xc9d0d9, 0.7).strokeRoundedRect(-26, -26, 52, 52, 8);
    pg.fillStyle(0xeef2f6, 0.9).fillRect(-9, -11, 6, 22).fillRect(3, -11, 6, 22);
    this.pauseBtn.add(pg);
    this.pauseBtn.setSize(60, 60).setInteractive();
    this.pauseBtn.on('pointerdown', () => {
      Sound.unlock();
      this.togglePause();
    });

    this.fpsT = new URLSearchParams(window.location.search).has('debug')
      ? text(this, 0, 0, '', 12, { color: '#5fe8ff' }).setDepth(90) : null;

    this.touch = new TouchControls(this);

    // Listeners (removed on shutdown).
    const ev = this.game.events;
    const on = (name, fn) => {
      ev.on(name, fn, this);
      this.events.once('shutdown', () => ev.off(name, fn, this));
    };
    on('hud-init', this.onInit);
    on('hud-hp', (hp) => this.setHp(hp));
    on('hud-boss', this.onBoss);
    on('hud-boss-hp', (r) => { this.bossRatio = r; });
    on('hud-boss-hide', () => this.hideBoss());
    on('hud-prompt', this.onPrompt);
    on('hud-toast', this.onToast);
    on('hud-banner', this.onBanner);
    on('hud-parry', this.onParry);

    const offs = [
      Controls.onPause(() => this.togglePause()),
      Controls.onDeviceChange(() => {
        this.touch.refreshVisibility();
        this.onPrompt(this.promptText);
      }),
      Store.onSettingChange((k) => {
        if (k === 'touchOpacity' || k === 'touchControls') this.touch.refreshVisibility();
        if (k === 'buttonScale') this.touch.layout();
      }),
      onOrientationBlock((blocked) => {
        if (blocked && !this.paused) this.togglePause();
      }),
      Perf.onChange((level) => {
        if (level === 'low' && Perf.autoDowngraded) this.onToast({ text: 'Effects reduced for smoother play', kind: 'info' });
      })
    ];
    this.visHandler = () => {
      if (document.hidden && !this.paused) this.togglePause();
    };
    document.addEventListener('visibilitychange', this.visHandler);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      offs.forEach((f) => f());
      document.removeEventListener('visibilitychange', this.visHandler);
      this.scale.off('resize', this.layout, this);
      Sound.setMuffled(false);
    });

    this.layout();
    if (this.registry.get('hud')) this.onInit(this.registry.get('hud'));
    if (isPortraitBlocked()) this.time.delayedCall(50, () => !this.paused && this.togglePause());
  }

  // Lets the touch layer ignore taps on the pause button.
  isUiHit(x, y) {
    const b = this.pauseBtn;
    return Math.abs(x - b.x) < 34 && Math.abs(y - b.y) < 34;
  }

  layout() {
    const { width: W, height: H } = this.scale;
    const safe = (this.safe = safeInsets(this.game));
    this.left = Math.max(safe.left, 6) + 18;
    this.top = Math.max(safe.top, 4) + 16;
    this.right = W - Math.max(safe.right, 6) - 18;
    this.bottom = H - Math.max(safe.bottom, 4) - 14;

    this.hpLabel.setPosition(this.left, this.top + 10);
    this.stageLabel.setPosition(this.left, this.top + 30);
    this.drawHp();
    this.pauseBtn.setPosition(this.right - 26, this.top + 22);
    // On narrow (4:3) screens the boss bar drops below the health row.
    this.bossY = W < 1000 ? this.top + 66 : this.top + 22;
    this.bossW = Math.min(520, W * 0.44);
    this.bossName.setPosition(W / 2, this.bossY - 22);
    this.drawBoss();
    this.promptT.setPosition(W / 2, this.bottom - 150);
    this.toastC.setPosition(W / 2, this.top + (W < 1000 ? 130 : 96));
    this.bannerBig.setPosition(W / 2, H / 2 - 30);
    this.bannerSmall.setPosition(W / 2, H / 2 + 46);
    this.parryT.setPosition(W / 2, this.top + 90);
    this.bossCardJp.setPosition(W / 2, H / 2 - 40);
    this.bossCardEn.setPosition(W / 2, H / 2 + 26);
    if (this.fpsT) this.fpsT.setPosition(this.left, this.top + 50);
    this.touch.layout();
    if (this.pausePanel) this.buildPause();
  }

  // ---------- HUD ----------
  onInit(d) {
    this.maxHp = d.max;
    this.setHp(d.hp);
    this.stageLabel.setText(`${d.name.toUpperCase()}  ·  ${d.jp}`);
    this.hideBoss();
    this.onPrompt(null);
    this.bannerBig.setAlpha(0);
    this.bannerSmall.setAlpha(0);
    if (this.paused) this.closePause();
  }

  setHp(hp) {
    const lost = hp < this.hp;
    this.hp = hp;
    this.drawHp(lost);
  }

  drawHp(flash = false) {
    const g = this.hpG;
    g.clear();
    const x0 = this.left + 32, y = this.top + 3;
    for (let i = 0; i < this.maxHp; i++) {
      const x = x0 + i * 22;
      const full = i < this.hp;
      g.fillStyle(full ? 0xeef2f6 : 0x14171d, full ? 0.95 : 0.8);
      g.beginPath();
      g.moveTo(x + 5, y);
      g.lineTo(x + 19, y);
      g.lineTo(x + 14, y + 14);
      g.lineTo(x, y + 14);
      g.closePath();
      g.fillPath();
      g.lineStyle(1.2, full ? (this.hp <= 2 ? 0xffffff : 0x5fe8ff) : 0x5b626e, full ? 0.9 : 0.6);
      g.strokePath();
    }
    if (flash) {
      this.tweens.add({ targets: this.hpG, alpha: { from: 0.2, to: 1 }, duration: 260, repeat: 1 });
    }
  }

  onBoss(d) {
    this.bossVisible = true;
    this.bossRatio = 1;
    this.bossTrail = 1;
    this.bossName.setText(`${d.jp}  ${d.title}`).setVisible(true);
    this.stageLabel.setVisible(false);
    this.bossG.setVisible(true);
    this.drawBoss();
    this.bossCardJp.setText(d.jp);
    this.bossCardEn.setText(d.title);
    this.tweens.add({ targets: [this.bossCardJp, this.bossCardEn], alpha: { from: 0, to: 1 }, duration: 400, yoyo: true, hold: 1100 });
  }

  hideBoss() {
    this.bossVisible = false;
    this.bossG.setVisible(false);
    this.bossName.setVisible(false);
    this.stageLabel.setVisible(true);
  }

  drawBoss() {
    if (!this.bossVisible) return;
    const W = this.scale.width;
    const g = this.bossG;
    const w = this.bossW, h = 10, x = W / 2 - w / 2, y = this.bossY;
    g.clear();
    g.fillStyle(0x05070a, 0.75).fillRect(x - 3, y - 3, w + 6, h + 6);
    g.lineStyle(1, 0x9aa3b0, 0.7).strokeRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle(0x5b626e, 1).fillRect(x, y, w * this.bossTrail, h);
    g.fillStyle(0xeef2f6, 1).fillRect(x, y, w * this.bossRatio, h);
    g.fillStyle(0x5fe8ff, 1).fillRect(x, y + h - 2, w * this.bossRatio, 2);
    for (let i = 1; i < 10; i++) g.fillStyle(0x05070a, 0.8).fillRect(x + (w * i) / 10, y, 1, h);
  }

  onPrompt(label) {
    this.promptText = label;
    const show = !!label;
    this.touch.setInteractHighlight(show);
    if (!show) {
      this.promptT.setVisible(false);
      this.promptBg.setVisible(false);
      return;
    }
    const keyHint = this.touch.visible ? '触 ACT' : Controls.lastDevice === 'pad' ? 'Ⓨ' : '[E]';
    this.promptT.setText(`${keyHint}  ${label.toUpperCase()}`).setVisible(true);
    const b = this.promptT.getBounds();
    this.promptBg.clear().setVisible(true);
    this.promptBg.fillStyle(0x05070a, 0.7).fillRect(b.x - 14, b.y - 6, b.width + 28, b.height + 12);
    this.promptBg.lineStyle(1, 0x5fe8ff, 0.7).strokeRect(b.x - 14, b.y - 6, b.width + 28, b.height + 12);
  }

  onToast(d) {
    const W = this.scale.width;
    this.toastT.setWordWrapWidth(Math.min(640, W - 100));
    this.toastT.setText(d.text);
    this.toastT.setColor(d.kind === 'lore' ? '#eef2f6' : '#5fe8ff');
    this.toastT.setFontStyle(d.kind === 'lore' ? '500' : '700');
    const b = this.toastT.getBounds();
    const w = b.width + 48, h = b.height + 26;
    this.toastBg.clear();
    this.toastBg.fillStyle(0x05070a, 0.82).fillRect(-w / 2, -h / 2, w, h);
    this.toastBg.lineStyle(1, 0x9aa3b0, 0.5).strokeRect(-w / 2, -h / 2, w, h);
    this.toastBg.fillStyle(0x5fe8ff, 1).fillRect(-w / 2, -h / 2, 3, h);
    this.tweens.killTweensOf(this.toastC);
    this.toastC.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.toastC, alpha: 1, duration: 220, hold: d.kind === 'lore' ? 5200 : 2200, yoyo: true,
      onComplete: () => this.toastC.setVisible(false)
    });
  }

  onBanner(d) {
    this.bannerBig.setText(d.big);
    this.bannerSmall.setText(d.small);
    this.tweens.add({ targets: [this.bannerBig, this.bannerSmall], alpha: { from: 0, to: 1 }, duration: 500, hold: 2200, yoyo: true });
  }

  onParry() {
    this.tweens.killTweensOf(this.parryT);
    this.parryT.setAlpha(1).setScale(1.5);
    this.tweens.add({ targets: this.parryT, alpha: 0, scale: 1, duration: 600, ease: 'Quad.easeOut' });
  }

  // ---------- pause ----------
  togglePause() {
    if (this.paused) {
      if (!this.settings && !isPortraitBlocked()) this.closePause();
      return;
    }
    const game = this.scene.get('Game');
    if (!this.scene.isActive('Game') || (game && (game.ending || (game.player && game.player.dead)))) return;
    this.paused = true;
    this.scene.pause('Game');
    Controls.releaseAll();
    this.touch.releaseAll();
    this.touch.enabled = false;
    Sound.setMuffled(true);
    this.buildPause();
  }

  buildPause() {
    if (this.pausePanel) this.pausePanel.destroy();
    if (this.pauseNav) this.pauseNav.destroy();
    const { width: W, height: H } = this.scale;
    const c = (this.pausePanel = this.add.container(0, 0).setDepth(150));
    c.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0).setInteractive());
    c.add(text(this, W / 2, H / 2 - 170, '一時停止', 34, { jp: true, weight: '900', ox: 0.5, color: '#5fe8ff' }));
    c.add(text(this, W / 2, H / 2 - 128, 'PAUSED', 18, { ox: 0.5, spacing: 10 }));
    const game = this.scene.get('Game');
    const bw = 320, bh = 54;
    const items = [
      ['RESUME', '再開', () => this.closePause()],
      ['SETTINGS', '設定', () => this.openSettings()],
      ['RESTART FROM SHRINE', '社', () => {
        this.closePause();
        game.scene.restart({ stage: game.stageId, checkpoint: game.checkpoint });
      }],
      ['QUIT TO TITLE', '帰還', () => {
        this.closePause();
        this.scene.stop('Game');
        this.scene.start('Menu');
      }]
    ];
    const buttons = items.map(([label, jp, fn], i) => {
      const b = new Button(this, W / 2, H / 2 - 60 + i * (bh + 12), bw, bh, label, { jp, onTap: fn, size: 18 });
      c.add(b);
      return b;
    });
    this.pauseNav = new MenuNav(this, buttons);
    c.add(text(this, W / 2, H - Math.max(this.safe.bottom, 4) - 24, 'Progress is saved at shrines.', 13, { ox: 0.5, color: '#5b626e' }));
  }

  closePause() {
    if (isPortraitBlocked()) return;
    this.paused = false;
    if (this.pausePanel) this.pausePanel.destroy();
    if (this.pauseNav) this.pauseNav.destroy();
    this.pausePanel = null;
    this.pauseNav = null;
    this.touch.enabled = true;
    Controls.releaseAll();
    Controls.clearBuffered();
    Sound.setMuffled(false);
    if (this.scene.isPaused('Game')) this.scene.resume('Game');
  }

  openSettings() {
    if (this.pauseNav) this.pauseNav.active = false;
    this.settings = new SettingsPanel(this, () => {
      this.settings = null;
      if (this.pauseNav) this.pauseNav.active = true;
    });
  }

  update(time, delta) {
    const dt = delta / 1000;
    if (this.paused) Controls.pollGamepad();
    this.touch.update(dt);
    if (this.bossVisible && this.bossTrail > this.bossRatio) {
      this.bossTrail = Math.max(this.bossRatio, this.bossTrail - dt * 0.35);
      this.drawBoss();
    } else if (this.bossVisible && this.bossTrail !== this.bossRatio) {
      this.bossTrail = this.bossRatio;
      this.drawBoss();
    }
    if (this.fpsT) this.fpsT.setText(`${Math.round(this.game.loop.actualFps)} fps · ${Perf.level}`);
  }
}
