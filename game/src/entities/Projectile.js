import Phaser from 'phaser';
import { CYAN } from '../gfx/Art.js';

// Pooled projectile. Enemy shots can be parried (or cut with a slash) to send them
// back as player-owned shots that damage enemies.
export class Projectile extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y) {
    super(scene, x, y, 'bolt');
  }

  fire(x, y, vx, vy, opts) {
    this.enableBody(true, x, y, true, true);
    this.setTexture(opts.tex || 'bolt');
    this.body.setAllowGravity(false);
    this.setVelocity(vx, vy);
    this.setDepth(18);
    this.setAlpha(1);
    this.setScale(opts.scale || 1);
    this.clearTint();
    this.setBlendMode(opts.tex === 'voidorb' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    const r = opts.radius || (opts.tex === 'wave' ? 14 : 8);
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.dmg = opts.dmg || 1;
    this.owner = opts.owner || null;
    this.friendly = false;
    this.parryable = opts.parryable !== false;
    this.ground = !!opts.ground;
    this.homing = opts.homing || 0;
    this.life = opts.life || 4;
    this.setFlipX(vx < 0);
    return this;
  }

  reflect(towardX, towardY) {
    this.friendly = true;
    this.homing = 0;
    this.life = 2.5;
    this.setTint(CYAN);
    const sp = Math.max(380, this.body.velocity.length() * 1.4);
    const ang = Phaser.Math.Angle.Between(this.x, this.y, towardX, towardY);
    this.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
  }

  kill() {
    this.disableBody(true, true);
  }

  step(dt, target) {
    this.life -= dt;
    if (this.life <= 0) {
      this.kill();
      return;
    }
    if (this.homing && target && !this.friendly) {
      const desired = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y - 26);
      const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x);
      const next = Phaser.Math.Angle.RotateTo(cur, desired, this.homing * dt);
      const sp = this.body.velocity.length();
      this.setVelocity(Math.cos(next) * sp, Math.sin(next) * sp);
    }
    if (this.life < 0.3) this.setAlpha(this.life / 0.3);
  }
}
