import Phaser from 'phaser';
import { generateArt, createAnimations } from '../gfx/Art.js';
import { FONT } from '../core/Layout.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'FORGING BLADES…', {
      fontFamily: FONT, fontSize: '18px', color: '#5fe8ff', fontStyle: '700'
    }).setOrigin(0.5);
    label.setLetterSpacing?.(6);

    // Let the label render one frame before the (blocking) texture generation.
    this.time.delayedCall(30, () => {
      generateArt(this);
      createAnimations(this);
      const params = new URLSearchParams(window.location.search);
      if (params.has('art')) this.scene.start('ArtPreview');
      else if (params.has('stage')) {
        const stage = Phaser.Math.Clamp(parseInt(params.get('stage'), 10) || 1, 1, 3);
        const checkpoint = params.has('cp') ? parseInt(params.get('cp'), 10) : null;
        this.scene.start('Game', { stage, checkpoint, debugBoss: params.has('boss') });
      } else this.scene.start('Menu');
    });
  }
}
