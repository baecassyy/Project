import Phaser from 'phaser';
import { Store } from '../core/Storage.js';
import { Sound } from '../core/Audio.js';
import { fullscreenSupported, isFullscreen, toggleFullscreen } from '../core/Page.js';
import { Button, Slider, Choice, text, C } from './Widgets.js';

// Settings overlay shared by the title menu and the pause menu.
// Every change is saved immediately to local storage.
export class SettingsPanel extends Phaser.GameObjects.Container {
  constructor(scene, onClose, opts = {}) {
    super(scene, 0, 0);
    this.onClose = onClose;
    const { width, height } = scene.scale;
    this.setDepth(200);

    const dim = scene.add.rectangle(0, 0, width, height, 0x000000, 0.78).setOrigin(0).setInteractive();
    this.add(dim);

    const pw = 860, ph = 470;
    const panel = scene.add.container(width / 2, height / 2);
    this.panel = panel;
    this.add(panel);
    const g = scene.add.graphics();
    g.fillStyle(C.panel, 0.96);
    g.fillRect(-pw / 2, -ph / 2, pw, ph);
    g.lineStyle(1.5, C.line, 0.5);
    g.strokeRect(-pw / 2, -ph / 2, pw, ph);
    g.fillStyle(C.cyan, 1);
    g.fillRect(-pw / 2, -ph / 2, pw, 3);
    panel.add(g);
    panel.add(text(scene, -pw / 2 + 32, -ph / 2 + 22, 'SETTINGS', 26, { spacing: 6 }));
    panel.add(text(scene, pw / 2 - 32, -ph / 2 + 20, '設定', 26, { jp: true, ox: 1, color: '#5fe8ff', weight: '900' }));

    const s = Store.settings;
    const colW = 360;
    const lx = -pw / 2 + 40, rx = 20;
    let y = -ph / 2 + 110;
    const set = (k) => (v) => Store.setSetting(k, v);

    panel.add(new Slider(scene, lx, y, colW, 'MUSIC VOLUME', s.music, set('music')));
    panel.add(new Slider(scene, lx, y + 72, colW, 'SOUND EFFECTS', s.sfx, (v) => {
      Store.setSetting('sfx', v);
      Sound.play('slash');
    }));
    panel.add(new Slider(scene, lx, y + 144, colW, 'TOUCH CONTROL OPACITY', s.touchOpacity, set('touchOpacity'), { min: 0.15, max: 1 }));
    panel.add(new Slider(scene, lx, y + 216, colW, 'TOUCH BUTTON SIZE', s.buttonScale, set('buttonScale'), {
      min: 0.7, max: 1.4, format: (v) => `${Math.round(v * 100)}%`
    }));

    panel.add(new Choice(scene, rx, y, colW, 'TOUCH CONTROLS', [
      { label: 'AUTO', value: 'auto' }, { label: 'ON', value: 'on' }, { label: 'OFF', value: 'off' }
    ], s.touchControls, set('touchControls')));
    panel.add(new Choice(scene, rx, y + 72, colW, 'EFFECTS QUALITY', [
      { label: 'AUTO', value: 'auto' }, { label: 'HIGH', value: 'high' }, { label: 'LOW', value: 'low' }
    ], s.quality, set('quality')));
    panel.add(new Choice(scene, rx, y + 144, colW, 'SCREEN SHAKE', [
      { label: 'ON', value: true }, { label: 'OFF', value: false }
    ], s.screenShake, set('screenShake')));

    if (fullscreenSupported()) {
      const fs = new Button(scene, rx + colW / 2, y + 226, colW, 46, isFullscreen() ? 'EXIT FULLSCREEN' : 'FULLSCREEN', {
        size: 16, onTap: async () => {
          await toggleFullscreen();
          setTimeout(() => fs.setLabel(isFullscreen() ? 'EXIT FULLSCREEN' : 'FULLSCREEN'), 300);
        }
      });
      panel.add(fs);
    }

    if (opts.allowReset) {
      let armed = false;
      const reset = new Button(scene, lx + 110, ph / 2 - 46, 220, 46, 'RESET PROGRESS', {
        size: 15, onTap: () => {
          if (!armed) {
            armed = true;
            reset.setLabel('TAP AGAIN TO CONFIRM');
            return;
          }
          Store.resetProgress();
          reset.setLabel('PROGRESS CLEARED').setEnabled(false);
          if (opts.onReset) opts.onReset();
        }
      });
      panel.add(reset);
    }

    const back = new Button(scene, pw / 2 - 130, ph / 2 - 46, 200, 50, 'BACK', { jp: '戻る', onTap: () => this.close() });
    panel.add(back);
    this.backButton = back;

    this.keyHandler = (e) => {
      if (e.code === 'Escape' || e.code === 'Backspace') {
        e.stopImmediatePropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);

    this.fit();
    this.resizeHandler = () => this.fit(dim);
    scene.scale.on('resize', this.resizeHandler);
    scene.add.existing(this);
  }

  fit(dim) {
    const { width, height } = this.scene.scale;
    if (dim) dim.setSize(width, height);
    const k = Math.min(1, (width - 24) / 860, (height - 24) / 470);
    this.panel.setPosition(width / 2, height / 2).setScale(k);
  }

  close() {
    Sound.play('uiBack');
    window.removeEventListener('keydown', this.keyHandler, true);
    this.scene.scale.off('resize', this.resizeHandler);
    const cb = this.onClose;
    this.destroy();
    if (cb) cb();
  }
}
