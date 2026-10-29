import Phaser from 'phaser';
import { ensureStageArt } from '../gfx/Art.js';

// Developer view of every generated texture (open the game with ?art).
export class ArtPreviewScene extends Phaser.Scene {
  constructor() {
    super('ArtPreview');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a2f38');
    const stage = parseInt(new URLSearchParams(window.location.search).get('art'), 10) || 0;
    if (stage) {
      ensureStageArt(this, stage);
      const { width, height } = this.scale;
      this.add.image(0, 0, `sky${stage}`).setOrigin(0).setDisplaySize(width, height);
      this.add.image(width * 0.75, 120, `moon${stage}`);
      ['a', 'b', 'c'].forEach((l, i) => {
        const t = this.textures.get(`bg${stage}${l}`).getSourceImage();
        this.add.tileSprite(0, height - t.height + (i === 2 ? -40 : 0), width, t.height, `bg${stage}${l}`).setOrigin(0);
      });
      return;
    }
    let x = 10, y = 10, rowH = 0;
    const keys = ['ninja', 'shade', 'oni', 'ronin', 'shogun', 'kitsune', 'wisp', 'drone', 'shrine',
      'bolt', 'foxfire', 'voidorb', 'wave', 'slash', 'ring', 'stele', 'toro', 'tiles1', 'tiles2', 'tiles3',
      'spike1', 'spike2', 'spike3', 'gate', 'sign0', 'sign1', 'toriiFg', 'brokenPillar', 'pillar'];
    keys.forEach((k) => {
      const tex = this.textures.get(k);
      const names = tex.getFrameNames().length ? tex.getFrameNames() : ['__BASE'];
      names.forEach((n) => {
        const f = tex.get(n);
        if (x + f.width > this.scale.width) {
          x = 10;
          y += rowH + 6;
          rowH = 0;
        }
        this.add.rectangle(x, y, f.width, f.height, 0x050609).setOrigin(0);
        this.add.image(x, y, k, n === '__BASE' ? undefined : n).setOrigin(0);
        x += f.width + 4;
        rowH = Math.max(rowH, f.height);
      });
    });
  }
}
