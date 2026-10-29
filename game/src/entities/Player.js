import Phaser from 'phaser';
import { Controls } from '../core/Controls.js';
import { Sound } from '../core/Audio.js';
import { difficulty } from '../core/Difficulty.js';

const RUN = 255;
const ACCEL_GROUND = 2900;
const ACCEL_AIR = 1900;
const JUMP_V = 610;
const DOUBLE_JUMP_V = 545;
const MAX_FALL = 820;
const DASH_V = 650;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 0.4;
const COYOTE = 0.1;
const PARRY_COOLDOWN = 0.22;

// Combo chain. `hit` is the active window in seconds; `lunge` is a forward push.
const COMBO = [
  { frame: 'atk1', dur: 0.23, hit: [0.03, 0.13], dmg: 1, w: 66, h: 48, dy: -26, lunge: 80, sfx: 'slash', pitch: 1 },
  { frame: 'atk2', dur: 0.23, hit: [0.03, 0.13], dmg: 1, w: 64, h: 66, dy: -36, lunge: 80, sfx: 'slash', pitch: 1.15 },
  { frame: 'atk3', dur: 0.33, hit: [0.05, 0.17], dmg: 2, w: 82, h: 54, dy: -24, lunge: 260, sfx: 'slashHeavy', pitch: 1 }
];
const AIR_SLASH = { frame: 'airatk', dur: 0.24, hit: [0.02, 0.15], dmg: 1, w: 76, h: 64, dy: -28, lunge: 0, sfx: 'slash', pitch: 1.3 };
const COUNTER = { frame: 'atk3', dur: 0.3, hit: [0.0, 0.14], dmg: 3, w: 104, h: 70, dy: -30, lunge: 180, sfx: 'slashHeavy', pitch: 1.2, counter: true };

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'ninja', 'idle0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 84 / 96);
    this.body.setSize(16, 42);
    this.body.setOffset(40, 42);
    this.body.setMaxVelocity(DASH_V + 60, MAX_FALL);
    this.setDepth(20);

    this.maxHp = 8;
    this.hp = this.maxHp;
    this.facing = 1;
    this.airJumps = 1;
    this.airDashes = 1;
    this.coyote = 0;
    this.dashTime = 0;
    this.dashCd = 0;
    this.attack = null;
    this.attackT = 0;
    this.comboStep = 0;
    this.comboQueued = false;
    this.comboTimer = 0;
    this.swingId = 0;
    this.parryT = 0;
    this.parryCd = 0;
    this.parryHolding = false;
    this.blocking = false;
    this.invuln = 0;
    this.hurtT = 0;
    this.dead = false;
    this.dropT = 0;
    this.wasGround = false;
    this.jumpCut = false;
    this.lastVy = 0;
    this.ghostT = 0;
    this.lastSafe = { x, y };
    this.safeT = 0;
  }

  get onGround() {
    return this.body.blocked.down || this.body.touching.down;
  }

  get dashing() {
    return this.dashTime > 0;
  }

  get parrying() {
    return this.parryT > 0;
  }

  update(dt) {
    const scene = this.scene;
    const body = this.body;
    const onGround = this.onGround;

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);

    if (onGround) {
      if (!this.wasGround && this.lastVy > 380) {
        Sound.play('land');
        scene.fx.dust(this.x, this.y);
      }
      this.coyote = COYOTE;
      this.airJumps = 1;
      this.airDashes = 1;
      this.jumpCut = false;
      // Remember the last safe footing to respawn after falling into a pit.
      this.safeT -= dt;
      if (this.safeT <= 0 && !scene.isHazardAt(this.x, this.y)) {
        this.lastSafe = { x: this.x, y: this.y };
        this.safeT = 0.25;
      }
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }
    this.wasGround = onGround;
    this.lastVy = body.velocity.y;

    if (this.dead) {
      body.setVelocityX(body.velocity.x * 0.9);
      return;
    }

    // Blinking while invulnerable after a hit.
    this.setAlpha(this.invuln > 0 && this.hurtT <= 0 && !this.dashing ? (Math.floor(this.invuln * 20) % 2 ? 0.35 : 1) : 1);

    const ax = Controls.x;
    const stunned = this.hurtT > 0;

    // ---------- dash ----------
    if (this.dashing) {
      this.dashTime -= dt;
      body.setVelocity(this.facing * DASH_V, 0);
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        scene.fx.ghost(this);
        this.ghostT = 0.035;
      }
      if (this.dashTime <= 0) this.endDash();
    }
    if (!stunned && !this.dashing && this.dashCd <= 0 && (onGround || this.airDashes > 0) && Controls.consume('dash', 120)) {
      if (ax !== 0) this.facing = Math.sign(ax);
      this.cancelAttack();
      this.endParry();
      this.dashTime = DASH_TIME;
      this.dashCd = DASH_COOLDOWN;
      this.invuln = Math.max(this.invuln, DASH_TIME + 0.04);
      body.setAllowGravity(false);
      if (!onGround) this.airDashes--;
      Sound.play('dash');
      scene.fx.dust(this.x, this.y, true);
    }

    // ---------- parry & block ----------
    if (this.parryT > 0) {
      this.parryT -= dt;
      if (this.parryT <= 0) {
        this.parryT = 0;
        if (Controls.isHeld('parry') && this.parryHolding) this.blocking = true;
        else this.endParry();
      }
    }
    if (this.blocking && !Controls.isHeld('parry')) this.endParry();
    if (!stunned && !this.dashing && this.parryCd <= 0 && !this.parrying && !this.blocking && Controls.consume('parry', 120)) {
      this.cancelAttack();
      this.parryT = difficulty().parryWindow;
      this.parryHolding = true;
      this.parryCd = PARRY_COOLDOWN;
      if (ax !== 0) this.facing = Math.sign(ax);
      scene.fx.parryFlash(this);
    }

    // ---------- attacks ----------
    if (this.attack) {
      this.attackT += dt;
      const a = this.attack;
      // Queue one follow-up; extra taps stay buffered for the swing after it.
      if (!this.comboQueued && !a.counter && this.comboStep < COMBO.length && onGround && Controls.consume('attack', 200)) this.comboQueued = true;
      if (this.attackT >= a.dur) {
        const next = this.comboQueued && this.comboStep < COMBO.length;
        this.attack = null;
        this.comboTimer = 0.35;
        if (next) this.startAttack();
      }
    } else if (!stunned && !this.dashing && !this.parrying && !this.blocking && Controls.consume('attack', 150)) {
      // A new chain starts after a pause or once the three-hit combo is finished.
      if (this.comboTimer <= 0 || this.comboStep >= COMBO.length) this.comboStep = 0;
      this.startAttack();
    }

    // ---------- jumping ----------
    if (!stunned && !this.dashing && Controls.peek('jump', 140)) {
      if (Controls.down && onGround && scene.isOnOneWay(this)) {
        Controls.consume('jump');
        this.dropT = 0.28;
        this.y += 2;
      } else if (onGround || this.coyote > 0) {
        Controls.consume('jump');
        this.jump(JUMP_V);
      } else if (this.airJumps > 0) {
        Controls.consume('jump');
        this.airJumps--;
        this.jump(DOUBLE_JUMP_V);
        scene.fx.doubleJump(this.x, this.y);
      }
    }
    // Variable jump height: releasing early cuts the ascent.
    if (!this.jumpCut && !onGround && body.velocity.y < -220 && !Controls.isHeld('jump') && !this.dashing) {
      body.setVelocityY(body.velocity.y * 0.5);
      this.jumpCut = true;
    }

    // ---------- horizontal movement ----------
    if (!this.dashing) {
      let mult = 1;
      if (stunned) mult = 0;
      else if (this.attack && onGround) mult = this.attack === COMBO[2] || this.attack.counter ? 0.2 : 0.5;
      else if (this.parrying) mult = onGround ? 0.15 : 0.6;
      else if (this.blocking) mult = onGround ? 0.35 : 0.6;
      const target = ax * RUN * mult;
      const accel = onGround ? ACCEL_GROUND : ACCEL_AIR;
      const vx = body.velocity.x;
      if (!stunned) {
        const step = accel * dt;
        body.setVelocityX(Math.abs(target - vx) <= step ? target : vx + Math.sign(target - vx) * step);
      } else {
        body.setVelocityX(vx * 0.92);
      }
      if (ax !== 0 && !stunned && !this.attack && !this.parrying) this.facing = Math.sign(ax);
    }

    this.setFlipX(this.facing < 0);
    this.updateAnim(onGround);
  }

  jump(v) {
    this.cancelAttack();
    this.endParry();
    this.body.setVelocityY(-v);
    this.coyote = 0;
    this.jumpCut = false;
    Sound.play('jump', { pitch: v === JUMP_V ? 1 : 1.3 });
  }

  endDash() {
    this.dashTime = 0;
    this.body.setAllowGravity(true);
    this.body.setVelocityX(this.body.velocity.x * 0.45);
  }

  endParry() {
    this.parryT = 0;
    this.parryHolding = false;
    if (this.blocking) this.parryCd = 0.15;
    this.blocking = false;
  }

  startAttack(def) {
    let a = def;
    if (!a) {
      if (!this.onGround) a = AIR_SLASH;
      else a = COMBO[this.comboStep++];
    }
    this.attack = a;
    this.attackT = 0;
    this.comboQueued = false;
    this.swingId++;
    if (a.lunge && this.onGround) this.body.setVelocityX(this.facing * a.lunge);
    if (a === AIR_SLASH && this.body.velocity.y > 0) this.body.setVelocityY(this.body.velocity.y * 0.4);
    Sound.play(a.sfx, { pitch: a.pitch });
    this.scene.fx.slash(this, a);
  }

  cancelAttack() {
    this.attack = null;
    this.comboQueued = false;
  }

  // Active hitbox of the current swing, or null.
  getAttackBox() {
    const a = this.attack;
    if (!a || this.attackT < a.hit[0] || this.attackT > a.hit[1]) return null;
    const cx = this.x + this.facing * (a.w / 2 + 2);
    return new Phaser.Geom.Rectangle(cx - a.w / 2, this.y + a.dy - a.h / 2, a.w, a.h);
  }

  get attackDamage() {
    return this.attack ? this.attack.dmg : 0;
  }

  // Resolves an incoming hit. Returns 'parry', 'block', 'hit' or 'ignored'.
  takeHit(dmg, fromX, opts = {}) {
    if (this.dead) return 'ignored';
    const fromFront = Math.sign(fromX - this.x || this.facing) === this.facing;
    if (this.parrying && !opts.noParry && (fromFront || opts.projectile)) {
      this.onParry(fromX);
      return 'parry';
    }
    if (this.invuln > 0) return 'ignored';
    if (this.blocking && fromFront && !opts.unblockable) {
      this.body.setVelocityX(-this.facing * (opts.heavy ? 380 : 220));
      Sound.play('block');
      this.scene.fx.sparks(this.x + this.facing * 14, this.y - 30, 6);
      this.invuln = 0.12;
      return 'block';
    }
    this.hp = Math.max(0, this.hp - dmg * difficulty().damage);
    this.cancelAttack();
    this.endParry();
    if (this.dashing) this.endDash();
    this.hurtT = 0.32;
    this.invuln = difficulty().hurtInvuln;
    const away = Math.sign(this.x - fromX) || -this.facing;
    this.body.setVelocity(away * 260, -260);
    Sound.play('hurt');
    this.scene.onPlayerHurt(this.hp);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  onParry(fromX) {
    const dir = Math.sign(fromX - this.x) || this.facing;
    this.facing = dir;
    this.parryT = 0;
    this.parryHolding = false;
    this.blocking = false;
    this.parryCd = 0;
    this.invuln = 0.4;
    Sound.play('parry');
    this.scene.onParrySuccess(this);
    // Instant counterattack.
    this.startAttack(COUNTER);
  }

  die() {
    this.dead = true;
    this.attack = null;
    this.body.setAllowGravity(true);
    this.setFrame('hurt');
    this.anims.stop();
    Sound.play('death');
    this.scene.onPlayerDeath();
  }

  heal() {
    this.hp = this.maxHp;
  }

  updateAnim(onGround) {
    let frame = null;
    let anim = null;
    if (this.hurtT > 0) frame = 'hurt';
    else if (this.dashing) frame = 'dash';
    else if (this.attack) frame = this.attack.frame;
    else if (this.parrying || this.blocking) frame = 'parry';
    else if (!onGround) frame = this.body.velocity.y < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.body.velocity.x) > 30) anim = 'p-run';
    else anim = 'p-idle';

    if (frame) {
      if (this.anims.isPlaying) this.anims.stop();
      if (this.frame.name !== frame) this.setFrame(frame);
    } else if (!this.anims.isPlaying || this.anims.currentAnim.key !== anim) {
      this.play(anim, true);
    }
  }
}
