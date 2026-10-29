import Phaser from 'phaser';
import { Sound } from '../core/Audio.js';

// Shared behavior for every hostile: health, hit flash, knockback, stun after a
// parry, an optional melee hitbox (`attackBox`) that the GameScene resolves, and
// sleeping when far from the camera to save CPU on phones.
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture, frame, cfg = {}) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.hp = cfg.hp || 1;
    this.maxHp = this.hp;
    this.contactDamage = cfg.contact ?? 1;
    this.heavy = !!cfg.heavy;
    this.flying = !!cfg.flying;
    this.parryStun = cfg.parryStun ?? 1.2;
    this.facing = -1;
    this.alive = true;
    this.isBoss = false;
    this.stun = 0;
    this.flashT = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.attackBox = null;
    this.attackId = 0;
    this.attackDamage = 1;
    this.attackOpts = {};
    this.hitBySwing = -1;
    this.setDepth(15);
    if (this.flying) this.body.setAllowGravity(false);
    else this.collider = scene.physics.add.collider(this, scene.layer);
  }

  setState(state) {
    this.state = state;
    this.stateT = 0;
    this.fresh = true;
    this.attackBox = null;
  }

  // True only on the first update after entering the current state.
  entering() {
    if (!this.fresh) return false;
    this.fresh = false;
    return true;
  }

  // Starts a melee strike; the scene checks it against the player each frame.
  strike(box, dmg, opts = {}) {
    this.attackBox = box;
    this.attackDamage = dmg;
    this.attackOpts = opts;
    this.attackId++;
  }

  // Keeps an ongoing strike's hitbox moving without letting it hit twice.
  hold(box, dmg, opts = {}) {
    if (this.attackBox) this.attackBox = box;
    else this.strike(box, dmg, opts);
  }

  boxAhead(w, h, dy = -24, reach = 0) {
    const cx = this.x + this.facing * (w / 2 + reach);
    return new Phaser.Geom.Rectangle(cx - w / 2, this.y + dy - h / 2, w, h);
  }

  faceTo(x) {
    this.facing = x < this.x ? -1 : 1;
    this.setFlipX(this.facing < 0);
  }

  hurt(dmg, dir, opts = {}) {
    if (!this.alive) return false;
    const mult = this.stun > 0 ? 1.5 : 1;
    this.hp -= dmg * mult;
    this.flashT = 0.08;
    this.setTintFill(0xffffff);
    if (!this.heavy && !this.isBoss) {
      this.body.setVelocityX(dir * (opts.counter ? 420 : 240));
      if (!this.flying) this.body.setVelocityY(-120);
    }
    this.onHurt(dmg, dir, opts);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    Sound.play('hit', { pitch: this.isBoss ? 0.8 : 1 });
    return false;
  }

  onHurt() {}

  onParried() {
    this.stun = this.parryStun;
    this.setState('stun');
  }

  die() {
    this.alive = false;
    this.attackBox = null;
    if (this.collider) this.scene.physics.world.removeCollider(this.collider);
    this.collider = null;
    this.body.enable = false;
    Sound.play('kill');
    this.scene.onEnemyKilled(this);
    this.scene.tweens.add({
      targets: this, alpha: 0, scaleX: 1.3, scaleY: 0.2, duration: 260, ease: 'Quad.easeIn',
      onComplete: () => this.destroy()
    });
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.flashT > 0) {
      this.flashT -= delta / 1000;
      if (this.flashT <= 0) this.clearTint();
    }
  }

  // Called by the scene with scaled delta (seconds) only while near the camera.
  tick(dt, player) {
    this.stateT += dt;
    if (this.stun > 0) {
      this.stun -= dt;
      this.body.setVelocityX(this.body.velocity.x * 0.9);
      this.setAlpha(Math.floor(this.stun * 12) % 2 ? 0.7 : 1);
      if (this.stun <= 0) {
        this.setAlpha(1);
        this.setState('idle');
      }
      return;
    }
    this.think(dt, player);
  }

  think() {}

  sleep(asleep) {
    if (!this.alive) return;
    this.body.enable = !asleep;
    this.setVisible(!asleep);
  }
}

// Floating spirit flame: drifts toward the player.
export class Wisp extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'wisp', 'w0', { hp: 1, contact: 1, flying: true, parryStun: 0.6 });
    this.setBlendMode(Phaser.BlendModes.ADD);
    this.home = { x, y };
    this.t = Math.random() * 6;
    this.play('wisp-float');
    this.body.setSize(18, 18).setOffset(11, 16);
  }

  think(dt, player) {
    this.t += dt;
    const dx = player.x - this.x;
    const dy = player.y - 30 - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 280 && !player.dead) {
      const sp = 85;
      this.body.setVelocity((dx / dist) * sp, (dy / dist) * sp + Math.sin(this.t * 4) * 30);
    } else {
      this.body.setVelocity((this.home.x - this.x) * 0.8, (this.home.y + Math.sin(this.t * 2) * 14 - this.y) * 2);
    }
    this.setFlipX(dx < 0);
  }

  onParried() {
    this.hurt(5, Math.sign(this.x - this.scene.player.x) || 1);
  }
}

// Spear-wielding spirit soldier: patrols, then telegraphs and lunges.
export class Shade extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'shade', 'walk0', { hp: 3, contact: 1, parryStun: 1.5 });
    this.setOrigin(0.5, 84 / 96);
    this.body.setSize(18, 44).setOffset(39, 40);
    this.patrolDir = Math.random() < 0.5 ? -1 : 1;
    this.cooldown = 0;
  }

  think(dt, player) {
    this.cooldown -= dt;
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    const sameLevel = Math.abs(player.y - this.y) < 70 && !player.dead;
    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (sameLevel && adx < 240) {
          this.setState('chase');
          break;
        }
        this.facing = this.patrolDir;
        this.setFlipX(this.facing < 0);
        if (!this.scene.groundAhead(this, this.facing) || this.body.blocked.left || this.body.blocked.right) {
          this.patrolDir *= -1;
        }
        this.body.setVelocityX(this.patrolDir * 45);
        this.playLoop('shade-walk');
        break;
      }
      case 'chase': {
        this.faceTo(player.x);
        if (!sameLevel || adx > 340) {
          this.setState('patrol');
          break;
        }
        if (adx < 78 && this.cooldown <= 0) {
          this.setState('windup');
          this.body.setVelocityX(0);
          this.setFrame('windup');
          this.anims.stop();
          Sound.play('warn');
          this.scene.fx.telegraph(this.x + this.facing * 10, this.y - 52);
          break;
        }
        const safe = this.scene.groundAhead(this, this.facing);
        this.body.setVelocityX(safe && adx > 52 ? this.facing * 95 : 0);
        this.playLoop('shade-walk');
        break;
      }
      case 'windup':
        if (this.stateT > 0.45) {
          this.setState('attack');
          this.setFrame('attack');
          this.body.setVelocityX(this.facing * 260);
          this.strike(this.boxAhead(64, 26, -32, 2), 1);
        }
        break;
      case 'attack':
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > 0.18) this.attackBox = null;
        if (this.stateT > 0.6) {
          this.cooldown = 0.7;
          this.setState('chase');
        }
        break;
      case 'stun':
        this.setFrame('stun');
        this.anims.stop();
        break;
      default:
        this.setState('patrol');
    }
  }

  playLoop(key) {
    if (!this.anims.isPlaying || this.anims.currentAnim.key !== key) this.play(key);
  }
}

// Surveillance drone: keeps distance and fires parryable bolts.
export class Drone extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'drone', 'd0', { hp: 2, contact: 1, flying: true, parryStun: 1.2 });
    this.home = { x, y };
    this.t = Math.random() * 6;
    this.cooldown = 1.2 + Math.random();
    this.play('drone-hover');
    this.body.setSize(26, 18).setOffset(11, 13);
  }

  think(dt, player) {
    this.t += dt;
    this.cooldown -= dt;
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    this.faceTo(player.x);
    const engaged = adx < 420 && !player.dead;
    let tx = this.home.x, ty = this.home.y + Math.sin(this.t * 2) * 10;
    if (engaged) {
      tx = player.x - Math.sign(dx || 1) * 220;
      ty = Math.min(this.home.y + 40, player.y - 150) + Math.sin(this.t * 2) * 10;
    }
    this.body.setVelocity(Phaser.Math.Clamp((tx - this.x) * 1.6, -150, 150), Phaser.Math.Clamp((ty - this.y) * 1.6, -150, 150));

    if (this.state === 'charge') {
      if (this.stateT > 0.45) {
        const ang = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 26);
        this.scene.fireProjectile(this.x, this.y, Math.cos(ang) * 300, Math.sin(ang) * 300, { tex: 'bolt', dmg: 1, owner: this });
        Sound.play('shoot');
        this.setState('idle');
        this.play('drone-hover');
        this.cooldown = 2 + Math.random() * 0.8;
      }
    } else if (engaged && this.cooldown <= 0 && adx < 380) {
      this.setState('charge');
      this.anims.stop();
      this.setFrame('charge');
    }
  }
}

// Heavy oni: super armor, telegraphed ground slam that sends shockwaves.
export class Oni extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'oni', 'idle', { hp: 7, contact: 1, heavy: true, parryStun: 1.8 });
    this.setOrigin(0.5, 132 / 144);
    this.body.setSize(34, 64).setOffset(55, 68);
    this.cooldown = 0;
  }

  think(dt, player) {
    this.cooldown -= dt;
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    const near = adx < 300 && Math.abs(player.y - this.y) < 110 && !player.dead;
    switch (this.state) {
      case 'idle':
      case 'walk':
        if (!near) {
          this.body.setVelocityX(0);
          this.setFrame('idle');
          this.anims.stop();
          break;
        }
        this.faceTo(player.x);
        if (adx < 110 && this.cooldown <= 0) {
          this.setState('windup');
          this.body.setVelocityX(0);
          this.anims.stop();
          this.setFrame('windup');
          Sound.play('warn');
          this.scene.fx.telegraph(this.x, this.y - 110);
          break;
        }
        this.body.setVelocityX(this.scene.groundAhead(this, this.facing) ? this.facing * 55 : 0);
        if (!this.anims.isPlaying) this.play('oni-walk');
        break;
      case 'windup':
        if (this.stateT > 0.7) {
          this.setState('slam');
          this.setFrame('slam');
          this.strike(this.boxAhead(96, 60, -30, -10), 2, { heavy: true });
          this.scene.shake(160, 0.008);
          Sound.play('slam');
          this.scene.fx.dust(this.x + this.facing * 50, this.y, true);
          this.scene.fireProjectile(this.x + this.facing * 60, this.y - 14, this.facing * 260, 0, { tex: 'wave', dmg: 1, owner: this, ground: true, life: 1.4, parryable: false });
        }
        break;
      case 'slam':
        if (this.stateT > 0.15) this.attackBox = null;
        if (this.stateT > 0.9) {
          this.cooldown = 1.2;
          this.setState('walk');
        }
        break;
      case 'stun':
        this.setFrame('stun');
        break;
      default:
        this.setState('walk');
    }
  }
}

export const ENEMY_TYPES = { wisp: Wisp, shade: Shade, drone: Drone, oni: Oni };
