import Phaser from 'phaser';
import { getStage } from '../data/stages.js';
import { Sound } from '../core/Audio.js';
import { text } from '../ui/Widgets.js';

// Chapter title card between stages; tap or press any key to skip.
export class StageCardScene extends Phaser.Scene {
  constructor() {
    super('StageCard');
  }

  create(data) {
    const st = getStage(data.stage);
    const { width: W, height: H } = this.scale;
    this.cameras.main.setBackgroundColor('#050609');
    Sound.stopMusic(0.8);
    const items = [
      text(this, W / 2, H / 2 - 110, st.chapter, 22, { jp: true, ox: 0.5, color: '#5fe8ff' }),
      text(this, W / 2, H / 2 - 40, st.jp, 54, { jp: true, weight: '900', ox: 0.5 }),
      text(this, W / 2, H / 2 + 34, st.name.toUpperCase(), 22, { ox: 0.5, spacing: 10, color: '#c9d0d9' })
    ];
    const line = this.add.rectangle(W / 2, H / 2 + 74, 0, 2, 0x5fe8ff);
    items.forEach((t, i) => {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 6, delay: 200 + i * 220, duration: 600 });
    });
    this.tweens.add({ targets: line, width: 220, delay: 600, duration: 700, ease: 'Cubic.out' });
    Sound.play('lore');

    const go = () => {
      if (this.done) return;
      this.done = true;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('Game', { stage: data.stage, checkpoint: data.checkpoint ?? null });
      });
    };
    this.time.delayedCall(2600, go);
    this.time.delayedCall(400, () => {
      this.input.once('pointerup', go);
      this.input.keyboard.once('keydown', go);
    });
  }
}
