import Phaser from 'phaser';
import { Perf } from '../core/Perf.js';
import { CYAN } from './Art.js';

// Pooled visual effects. Sprites are recycled instead of created per hit, and
// particle counts scale with the current quality level.
export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.live = [];

    const add = (tex, cfg) => scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(40);
    this.sparkE = add('dot', {
      lifespan: { min: 160, max: 380 }, speed: { min: 140, max: 420 }, angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 }, blendMode: 'ADD', tint: [0xffffff, CYAN]
    });
    this.dustE = add('dot', {
      lifespan: { min: 250, max: 500 }, speedX: { min: -90, max: 90 }, speedY: { min: -60, max: -10 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.35, end: 0 }, tint: 0x9aa3b0
    });
    this.burstE = add('shard', {
      lifespan: { min: 300, max: 700 }, speed: { min: 80, max: 320 }, angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, gravityY: 300, blendMode: 'ADD'
    });
    this.spiritE = add('dot', {
      lifespan: { min: 600, max: 1200 }, speedY: { min: -120, max: -40 }, speedX: { min: -40, max: 40 },
      scale: { start: 0.7, end: 0 }, blendMode: 'ADD', tint: CYAN
    });
  }

  n(count) {
    return Math.max(1, Math.round(count * Perf.fx));
  }

  // Generic pooled sprite effect with linear scale/alpha animation.
  spawn(tex, x, y, o = {}) {
    let img = this.pool.pop();
    if (!img) img = this.scene.add.image(0, 0, tex);
    img.setTexture(tex, o.frame);
    img.setPosition(x, y).setVisible(true).setActive(true);
    img.setDepth(o.depth ?? 30);
    img.setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);
    img.setFlipX(!!o.flipX);
    img.setRotation(o.rot || 0);
    img.setBlendMode(o.blend ?? Phaser.BlendModes.ADD);
    if (o.tint !== undefined) img.setTint(o.tint);
    else img.clearTint();
    this.live.push({
      img, t: 0, dur: o.dur || 0.2,
      s0: o.s0 ?? 1, s1: o.s1 ?? 1, sy: o.sy ?? 1, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      follow: o.follow || null, fx: o.fx || 0, fy: o.fy || 0
    });
    img.setScale(o.s0 ?? 1, (o.s0 ?? 1) * (o.sy ?? 1));
    img.setAlpha(o.a0 ?? 1);
    return img;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      const s = e.s0 + (e.s1 - e.s0) * k;
      e.img.setScale(s, s * e.sy);
      e.img.setAlpha(e.a0 + (e.a1 - e.a0) * k);
      if (e.follow) {
        const f = e.follow;
        e.img.setPosition(f.x + e.fx * (f.facing || 1), f.y + e.fy);
      }
      if (k >= 1) {
        e.img.setVisible(false).setActive(false);
        this.pool.push(e.img);
        this.live.splice(i, 1);
      }
    }
  }

  slash(player, a) {
    const dir = player.facing;
    const angle = a.frame === 'atk2' ? -0.45 : a.frame === 'atk3' ? 0.35 : 0;
    const big = a.counter ? 1.35 : a.frame === 'atk3' ? 1.15 : 1;
    this.spawn('slash', player.x, player.y + a.dy, {
      dur: 0.16, s0: 0.75 * big, s1: 1.05 * big, sy: 0.9, a0: 1, a1: 0,
      flipX: dir < 0, rot: dir * angle, follow: player, fx: 18 * big, fy: a.dy, ox: 0.15
    });
  }

  enemySlash(enemy, scale = 1) {
    this.spawn('slash', enemy.x, enemy.y - 30 * scale, {
      dur: 0.2, s0: 0.8 * scale, s1: 1.1 * scale, sy: 0.8, flipX: enemy.facing < 0,
      tint: 0xffffff, follow: enemy, fx: 24 * scale, fy: -30 * scale, ox: 0.15
    });
  }

  parryFlash(player) {
    this.spawn('ring', player.x + player.facing * 14, player.y - 32, { dur: 0.16, s0: 0.25, s1: 0.5, a0: 0.8, a1: 0, tint: CYAN, follow: player, fx: 14, fy: -32 });
  }

  parrySuccess(x, y) {
    this.spawn('ring', x, y, { dur: 0.35, s0: 0.3, s1: 1.6, a0: 1, a1: 0 });
    this.spawn('glow', x, y, { dur: 0.25, s0: 0.6, s1: 1.4, a0: 0.9, a1: 0, tint: CYAN });
    this.sparkE.explode(this.n(18), x, y);
  }

  ghost(sprite, alpha = 0.55) {
    if (Perf.low && Math.random() < 0.5) return;
    const img = this.spawn(sprite.texture.key, sprite.x, sprite.y, {
      frame: sprite.frame.name, dur: 0.22, a0: alpha, a1: 0, flipX: sprite.flipX,
      ox: sprite.originX, oy: sprite.originY, tint: CYAN, depth: (sprite.depth || 20) - 1, blend: Phaser.BlendModes.ADD
    });
    img.setScale(sprite.scaleX, sprite.scaleY);
  }

  dust(x, y, big = false) {
    this.dustE.explode(this.n(big ? 10 : 5), x, y - 2);
  }

  doubleJump(x, y) {
    this.spawn('ring', x, y, { dur: 0.25, s0: 0.2, s1: 0.7, sy: 0.35, a0: 0.9, a1: 0, tint: CYAN });
  }

  sparks(x, y, count = 8) {
    this.sparkE.explode(this.n(count), x, y);
  }

  hit(x, y, heavy = false) {
    this.sparkE.explode(this.n(heavy ? 14 : 8), x, y);
    this.spawn('glow', x, y, { dur: 0.12, s0: 0.3, s1: heavy ? 0.9 : 0.6, a0: 0.9, a1: 0 });
  }

  death(x, y, boss = false) {
    this.burstE.explode(this.n(boss ? 60 : 18), x, y);
    this.spawn('ring', x, y, { dur: boss ? 0.8 : 0.35, s0: 0.2, s1: boss ? 4 : 1.2, a0: 1, a1: 0 });
  }

  telegraph(x, y) {
    this.spawn('glow', x, y, { dur: 0.35, s0: 0.5, s1: 0.1, a0: 1, a1: 0.3, depth: 41 });
    this.spawn('ring', x, y, { dur: 0.35, s0: 0.7, s1: 0.1, a0: 0.9, a1: 0.2, depth: 41 });
  }

  glint(x, y) {
    this.spawn('glow', x, y, { dur: 0.6, s0: 0.2, s1: 1.1, a0: 1, a1: 0, depth: 41 });
    this.spawn('shard', x, y, { dur: 0.6, s0: 1, s1: 14, sy: 0.15, a0: 1, a1: 0, depth: 41 });
  }

  shockRing(x, y) {
    this.spawn('ring', x, y, { dur: 0.6, s0: 0.3, s1: 5, a0: 0.9, a1: 0, depth: 41 });
  }

  shrine(x, y) {
    this.spiritE.explode(this.n(30), x, y);
    this.spawn('glow', x, y, { dur: 0.8, s0: 0.5, s1: 2.5, a0: 0.8, a1: 0, tint: CYAN });
  }
}
