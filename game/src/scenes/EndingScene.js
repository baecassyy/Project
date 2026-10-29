import Phaser from 'phaser';
import { Sound } from '../core/Audio.js';
import { Button, text } from '../ui/Widgets.js';

const LINES = [
  'The Shogun of the Void falls silent.',
  'One by one, the bound spirits loosen their grip on the city.',
  'In the forgotten shrine, a bell rings for the first time in a hundred years.',
  'Beneath the neon rain, the requiem is finally heard.'
];

export class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }

  create() {
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#050609');
    this.cameras.main.fadeIn(800);
    Sound.playMusic('ending');
    this.add.particles(0, 0, 'dot', {
      x: { min: 0, max: W }, y: H + 10, lifespan: 7000, speedY: { min: -40, max: -15 },
      scale: { start: 0.4, end: 0.1 }, alpha: { start: 0.8, end: 0 }, blendMode: 'ADD', tint: [0xffffff, 0x5fe8ff], frequency: 160
    });
    const head = text(this, W / 2, H * 0.16, '鎮魂', 72, { jp: true, weight: '900', ox: 0.5, color: '#5fe8ff' }).setAlpha(0);
    this.tweens.add({ targets: head, alpha: 1, duration: 1200 });
    LINES.forEach((l, i) => {
      const t = text(this, W / 2, H * 0.36 + i * 34, l, 19, { ox: 0.5, weight: '500', wrap: W - 80, align: 'center' }).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 1400 + i * 1500, duration: 1200 });
    });
    const fin = text(this, W / 2, H * 0.36 + LINES.length * 34 + 30, 'REQUIEM · FIN', 22, { ox: 0.5, spacing: 12, color: '#9aa3b0' }).setAlpha(0);
    this.tweens.add({ targets: fin, alpha: 1, delay: 1400 + LINES.length * 1500, duration: 1200 });
    this.time.delayedCall(1400 + LINES.length * 1500 + 800, () => {
      const b = new Button(this, W / 2, H - 70, 280, 52, 'RETURN TO TITLE', { jp: '帰還', onTap: () => this.scene.start('Menu') });
      b.setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, duration: 600 });
    });
  }
}
