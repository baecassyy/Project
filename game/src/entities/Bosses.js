import Phaser from 'phaser';
import { Enemy, Wisp } from './Enemy.js';
import { Sound } from '../core/Audio.js';

// Boss base: intro pause, phases by health, a stagger after being parried
// (bosses take +50% damage while staggered), and health bar updates.
class Boss extends Enemy {
  constructor(scene, x, y, tex, frame, cfg) {
    super(scene, x, y, tex, frame, { hp: cfg.hp, boss: true, contact: 1, heavy: true, parryStun: cfg.parryStun || 1.6 });
    this.isBoss = true;
    this.key = cfg.key;
    this.title = cfg.title;
    this.jp = cfg.jp;
    this.phase = 1;
    this.speed = 1;
    this.invulnerable = false;
    this.setState('intro');
  }

  get arena() {
    return this.scene.arenaBounds;
  }

  hurt(dmg, dir, opts) {
    if (this.invulnerable || this.state === 'intro') return false;
    const killed = super.hurt(dmg, dir, opts);
    this.scene.onBossHp(this);
    if (!killed) this.checkPhase();
    return killed;
  }

  checkPhase() {}

  die() {
    super.die();
    this.scene.onBossDefeated(this);
  }

  think(dt, player) {
    if (this.state === 'intro') {
      this.body.setVelocityX(0);
      if (this.stateT > 1.8) this.setState('idle');
      return;
    }
    this.brain(dt * this.speed, player);
  }

  // Keeps a dash or lunge inside the arena walls.
  atWall(margin = 50) {
    const a = this.arena;
    return (this.facing < 0 && this.x < a.x0 + margin) || (this.facing > 0 && this.x > a.x1 - margin);
  }

  pick(options) {
    const total = options.reduce((s, o) => s + o[1], 0);
    let r = Math.random() * total;
    for (const [name, w] of options) {
      r -= w;
      if (r <= 0) return name;
    }
    return options[0][0];
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — Hollow Kitsune: lunges, homing foxfire, vanish-and-pounce.
// ---------------------------------------------------------------------------
export class HollowKitsune extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y, 'kitsune', 'idle', { hp: 40, key: 'kitsune', title: 'HOLLOW KITSUNE', jp: '虚ろな九尾', parryStun: 1.5 });
    this.setOrigin(0.5, 112 / 128);
    this.body.setSize(64, 40).setOffset(56, 72);
    this.lunges = 0;
  }

  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.speed = 1.2;
      Sound.play('roar');
      this.scene.fx.shockRing(this.x, this.y - 30);
    }
  }

  brain(dt, player) {
    const dx = player.x - this.x;
    switch (this.state) {
      case 'idle':
        this.setFrame('idle');
        this.anims.stop();
        this.faceTo(player.x);
        this.body.setVelocityX(0);
        if (this.stateT > (this.phase === 2 ? 0.45 : 0.75)) {
          const far = Math.abs(dx) > 260;
          const next = this.pick([['crouch', far ? 4 : 2], ['cast', 3], ['vanish', this.phase === 2 ? 3 : 2], ['reposition', far ? 0 : 2]]);
          this.setState(next);
          if (next === 'crouch') this.lunges = this.phase === 2 ? 2 : 1;
        }
        break;
      case 'reposition':
        // Leap away to open space.
        if (this.entering()) {
          this.faceTo(player.x);
          this.body.setVelocity(-this.facing * 360, -420);
          this.play('kitsune-run');
        }
        if (this.stateT > 0.2 && this.body.blocked.down) this.setState('idle');
        break;
      case 'crouch':
        if (this.entering()) {
          this.faceTo(player.x);
          this.anims.stop();
          this.setFrame('crouch');
          Sound.play('warn');
          this.scene.fx.telegraph(this.x + this.facing * 40, this.y - 70);
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.55) {
          this.setState('lunge');
          this.setFrame('lunge');
          Sound.play('dash');
        }
        break;
      case 'lunge':
        this.body.setVelocityX(this.facing * 720);
        this.hold(this.boxAhead(70, 40, -22, -30), 2);
        this.scene.fx.ghost(this, 0.4);
        if (this.stateT > 0.65 || this.atWall(70)) {
          this.body.setVelocityX(0);
          this.attackBox = null;
          this.lunges--;
          if (this.lunges > 0) {
            this.setState('crouch');
            this.stateT = 0.2;
          } else this.setState('recover');
        }
        break;
      case 'cast':
        if (this.entering()) {
          this.faceTo(player.x);
          this.anims.stop();
          this.setFrame('cast');
          Sound.play('orb');
        }
        if (this.stateT > 0.5) {
          const n = this.phase === 2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.5 + (this.facing > 0 ? 0.3 : -0.3);
            this.scene.fireProjectile(this.x + this.facing * 30, this.y - 70, Math.cos(ang) * 230, Math.sin(ang) * 230,
              { tex: 'foxfire', dmg: 1, owner: this, homing: 1.7, life: 3.2 });
          }
          this.setState('recover');
        }
        break;
      case 'vanish':
        if (this.entering()) {
          Sound.play('teleport');
          this.invulnerable = true;
          this.scene.tweens.add({ targets: this, alpha: 0, duration: 250 });
        }
        if (this.stateT > 0.5) {
          const a = this.arena;
          this.x = Phaser.Math.Clamp(player.x, a.x0 + 80, a.x1 - 80);
          this.y = player.y - 230;
          this.body.reset(this.x, this.y);
          this.body.setAllowGravity(false);
          this.body.setVelocity(0, 0);
          this.setAlpha(1);
          this.setFrame('lunge');
          this.setState('pounceAim');
          this.scene.fx.telegraph(this.x, player.y - 10);
          Sound.play('warn');
        }
        break;
      case 'pounceAim':
        if (this.stateT > 0.35) {
          this.invulnerable = false;
          this.body.setAllowGravity(true);
          this.body.setVelocityY(950);
          this.setState('pounce');
        }
        break;
      case 'pounce':
        this.hold(new Phaser.Geom.Rectangle(this.x - 40, this.y - 50, 80, 50), 2);
        if (this.body.blocked.down) {
          this.attackBox = null;
          Sound.play('slam');
          this.scene.shake(180, 0.01);
          this.scene.fx.dust(this.x, this.y, true);
          if (this.phase === 2) {
            this.scene.fireProjectile(this.x - 40, this.y - 14, -280, 0, { tex: 'wave', dmg: 1, owner: this, ground: true, life: 1.4, parryable: false });
            this.scene.fireProjectile(this.x + 40, this.y - 14, 280, 0, { tex: 'wave', dmg: 1, owner: this, ground: true, life: 1.4, parryable: false });
          }
          this.setState('recover');
        }
        break;
      case 'recover':
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > (this.phase === 2 ? 0.45 : 0.7)) this.setState('idle');
        break;
      case 'stun':
        this.invulnerable = false;
        this.body.setAllowGravity(true);
        this.setFrame('stun');
        break;
      default:
        this.setState('idle');
    }
  }

  onParried() {
    this.invulnerable = false;
    this.body.setAllowGravity(true);
    super.onParried();
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — Iron Ronin: two-hit combo, iaido draw-dash, guard stance, quake slam.
// ---------------------------------------------------------------------------
export class IronRonin extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y, 'ronin', 'idle', { hp: 54, key: 'ronin', title: 'IRON RONIN', jp: '鉄の浪人', parryStun: 1.7 });
    this.setOrigin(0.5, 164 / 176);
    this.body.setSize(36, 84).setOffset(70, 80);
    this.comboHits = 0;
  }

  checkPhase() {
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.speed = 1.18;
      Sound.play('roar');
      this.scene.fx.shockRing(this.x, this.y - 60);
    }
  }

  // Guard stance deflects frontal attacks; hitting from behind deals double.
  hurt(dmg, dir, opts = {}) {
    if (this.state === 'guard') {
      const fromFront = dir === -this.facing;
      if (fromFront && !opts.projectile) {
        Sound.play('clang');
        this.scene.fx.sparks(this.x + this.facing * 30, this.y - 70, 10);
        this.scene.player.body.setVelocityX(dir * -320);
        this.guardHits = (this.guardHits || 0) + 1;
        return false;
      }
      return super.hurt(dmg * 2, dir, opts);
    }
    return super.hurt(dmg, dir, opts);
  }

  brain(dt, player) {
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    switch (this.state) {
      case 'idle':
        this.anims.stop();
        this.setFrame('idle');
        this.faceTo(player.x);
        this.body.setVelocityX(0);
        if (this.stateT > (this.phase === 2 ? 0.35 : 0.6)) {
          const options = [['walk', adx > 150 ? 4 : 1], ['iaido', adx > 220 ? 4 : 1], ['guard', 2], ['combo', adx < 170 ? 4 : 0]];
          if (this.phase === 2) options.push(['quake', 2.5]);
          this.setState(this.pick(options));
        }
        break;
      case 'walk':
        this.faceTo(player.x);
        this.body.setVelocityX(this.facing * 120);
        if (!this.anims.isPlaying) this.play('ronin-walk');
        if (adx < 130) this.setState('combo');
        else if (this.stateT > 1.6) this.setState('idle');
        break;
      case 'combo':
        if (this.entering()) {
          this.faceTo(player.x);
          this.anims.stop();
          this.setFrame('windup');
          this.comboHits = 2;
          Sound.play('warn');
          this.scene.fx.telegraph(this.x + this.facing * 30, this.y - 120);
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.45) this.setState('slash');
        break;
      case 'slash':
        if (this.entering()) {
          this.setFrame('slash');
          this.body.setVelocityX(this.facing * 280);
          this.strike(this.boxAhead(120, 80, -60, -20), 1);
          Sound.play('slashHeavy', { pitch: 0.8 });
          this.scene.fx.enemySlash(this, 1.4);
        }
        this.body.setVelocityX(this.body.velocity.x * 0.88);
        if (this.stateT > 0.15) this.attackBox = null;
        if (this.stateT > 0.35) {
          this.comboHits--;
          if (this.comboHits > 0) {
            this.faceTo(player.x);
            this.setFrame('windup');
            this.setState('slashWind');
          } else this.setState('recover');
        }
        break;
      case 'slashWind':
        if (this.stateT > 0.22) this.setState('slash');
        break;
      case 'iaido': {
        if (this.entering()) {
          this.faceTo(player.x);
          this.anims.stop();
          this.setFrame('windup');
          this.body.setVelocityX(-this.facing * 160);
          Sound.play('warn');
          this.scene.fx.glint(this.x + this.facing * 20, this.y - 90);
        }
        this.body.setVelocityX(this.body.velocity.x * 0.9);
        const wind = this.phase === 2 ? 0.6 : 0.8;
        if (this.stateT > wind) {
          this.setState('draw');
          this.setFrame('slash');
          Sound.play('slashHeavy', { pitch: 0.7 });
        }
        break;
      }
      case 'draw':
        this.body.setVelocityX(this.facing * 900);
        this.hold(this.boxAhead(90, 90, -60, -40), 2, { unblockable: true });
        this.scene.fx.ghost(this, 0.5);
        if (this.stateT > 0.42 || this.atWall(60)) {
          this.body.setVelocityX(0);
          this.attackBox = null;
          this.scene.fx.enemySlash(this, 2);
          this.setState('recover');
          this.stateT = -0.3;
        }
        break;
      case 'guard':
        if (this.entering()) {
          this.faceTo(player.x);
          this.anims.stop();
          this.setFrame('guard');
          this.guardHits = 0;
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.4) this.faceTo(player.x);
        if (this.stateT > 1.5 || this.guardHits >= 3) this.setState(adx < 160 ? 'slash' : 'idle');
        if (this.state === 'slash') this.comboHits = 1;
        break;
      case 'quake':
        if (this.entering()) {
          this.faceTo(player.x);
          this.setFrame('windup');
          this.body.setVelocity(Phaser.Math.Clamp(dx * 1.2, -340, 340), -680);
          Sound.play('warn');
        }
        if (this.stateT > 0.2 && this.body.blocked.down) {
          this.setFrame('slash');
          this.strike(new Phaser.Geom.Rectangle(this.x - 80, this.y - 50, 160, 50), 2);
          Sound.play('slam');
          this.scene.shake(220, 0.012);
          this.scene.fx.dust(this.x, this.y, true);
          [-1, 1].forEach((d) => this.scene.fireProjectile(this.x + d * 60, this.y - 14, d * 300, 0,
            { tex: 'wave', dmg: 1, owner: this, ground: true, life: 1.8, parryable: false }));
          this.setState('recover');
        }
        break;
      case 'recover':
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > 0.1) this.attackBox = null;
        if (this.stateT > (this.phase === 2 ? 0.55 : 0.8)) this.setState('idle');
        break;
      case 'stun':
        this.setFrame('stun');
        break;
      default:
        this.setState('idle');
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — Shogun of the Void: three phases of sweeps, void orbs, teleports,
// summoned wisps, erupting void pillars and the final radial "requiem".
// ---------------------------------------------------------------------------
export class ShogunOfTheVoid extends Boss {
  constructor(scene, x, y) {
    super(scene, x, y, 'shogun', 'idle', { hp: 84, key: 'shogun', title: 'SHOGUN OF THE VOID', jp: '虚無の将軍', parryStun: 1.4 });
    this.setOrigin(0.5, 226 / 240);
    this.body.setSize(50, 118).setOffset(95, 108);
    this.chain = 0;
  }

  checkPhase() {
    const ratio = this.hp / this.maxHp;
    const next = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (next > this.phase) {
      this.phase = next;
      this.speed = next === 3 ? 1.3 : 1.12;
      Sound.play('roar');
      this.scene.fx.shockRing(this.x, this.y - 90);
      this.scene.onBossPhase(this, next);
      this.setState('teleport');
    }
  }

  brain(dt, player) {
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    switch (this.state) {
      case 'idle': {
        this.setFrame('idle');
        this.faceTo(player.x);
        this.body.setVelocityX(adx > 180 ? this.facing * 70 : 0);
        if (this.stateT > (this.phase === 3 ? 0.35 : 0.6)) {
          const o = [['sweep', adx < 220 ? 5 : 1], ['orbs', 3], ['teleport', 2]];
          if (this.phase >= 2) o.push(['pillars', 3], ['summon', this.scene.countAlive(Wisp) < 2 ? 1.5 : 0]);
          if (this.phase === 3) o.push(['requiem', 2.5]);
          this.setState(this.pick(o));
        }
        break;
      }
      case 'sweep':
        if (this.entering()) {
          this.faceTo(player.x);
          this.setFrame('windup');
          Sound.play('warn');
          this.scene.fx.telegraph(this.x + this.facing * 60, this.y - 180);
        }
        this.body.setVelocityX(0);
        if (this.stateT > (this.chain > 0 ? 0.4 : 0.65)) {
          this.setFrame('slash');
          this.body.setVelocityX(this.facing * 200);
          this.strike(this.boxAhead(180, 120, -70, -40), 2);
          Sound.play('slashHeavy', { pitch: 0.6 });
          this.scene.fx.enemySlash(this, 2.4);
          this.setState('sweepEnd');
        }
        break;
      case 'sweepEnd':
        this.body.setVelocityX(this.body.velocity.x * 0.85);
        if (this.stateT > 0.15) this.attackBox = null;
        if (this.stateT > 0.6) {
          this.chain = 0;
          this.setState('idle');
        }
        break;
      case 'orbs':
        if (this.entering()) {
          this.faceTo(player.x);
          this.setFrame('cast');
          Sound.play('orb');
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.6) {
          const n = this.phase === 3 ? 7 : 5;
          const base = Phaser.Math.Angle.Between(this.x, this.y - 120, player.x, player.y - 26);
          for (let i = 0; i < n; i++) {
            const ang = base + (i - (n - 1) / 2) * 0.22;
            this.scene.fireProjectile(this.x + this.facing * 40, this.y - 120, Math.cos(ang) * 250, Math.sin(ang) * 250,
              { tex: 'voidorb', dmg: 1, owner: this, life: 4, radius: 10 });
          }
          this.setState('recover');
        }
        break;
      case 'teleport':
        if (this.entering()) {
          this.invulnerable = true;
          Sound.play('teleport');
          this.scene.tweens.add({ targets: this, alpha: 0, duration: 260 });
        }
        if (this.stateT > 0.45) {
          const a = this.arena;
          const side = player.facing || 1;
          const tx = Phaser.Math.Clamp(player.x - side * 150, a.x0 + 90, a.x1 - 90);
          this.body.reset(tx, this.y);
          this.setAlpha(1);
          this.invulnerable = false;
          this.chain = 1;
          this.setState('sweep');
        }
        break;
      case 'pillars':
        if (this.entering()) {
          this.setFrame('cast');
          Sound.play('warn');
          const a = this.arena;
          const xs = this.phase === 3 ? [-240, -120, 0, 120, 240] : [-160, 0, 160];
          xs.forEach((off) => this.scene.spawnPillar(Phaser.Math.Clamp(player.x + off, a.x0 + 30, a.x1 - 30), this.phase === 3 ? 0.65 : 0.85));
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.9) this.setState('recover');
        break;
      case 'summon':
        if (this.entering()) {
          this.setFrame('cast');
          Sound.play('orb');
          [-1, 1].forEach((d) => this.scene.spawnEnemy('wisp', this.x + d * 120, this.y - 200));
        }
        if (this.stateT > 0.7) this.setState('idle');
        break;
      case 'requiem':
        if (this.entering()) {
          this.setFrame('cast');
          Sound.play('roar');
          this.scene.fx.shockRing(this.x, this.y - 100);
        }
        this.body.setVelocityX(0);
        if (this.stateT > 0.8 && !this.fired) {
          this.fired = true;
          const n = 14;
          const offset = Math.random() * Math.PI;
          for (let i = 0; i < n; i++) {
            const ang = offset + (i / n) * Math.PI * 2;
            this.scene.fireProjectile(this.x, this.y - 110, Math.cos(ang) * 170, Math.sin(ang) * 170,
              { tex: 'voidorb', dmg: 1, owner: this, life: 5, radius: 10 });
          }
        }
        if (this.stateT > 1.4) {
          this.fired = false;
          this.setState('recover');
        }
        break;
      case 'recover':
        this.body.setVelocityX(0);
        if (this.stateT > (this.phase === 3 ? 0.4 : 0.7)) this.setState('idle');
        break;
      case 'stun':
        this.invulnerable = false;
        this.setAlpha(Math.floor(this.stun * 12) % 2 ? 0.7 : 1);
        this.setFrame('stun');
        break;
      default:
        this.setState('idle');
    }
  }
}

export const BOSS_TYPES = { kitsune: HollowKitsune, ronin: IronRonin, shogun: ShogunOfTheVoid };
