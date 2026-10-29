import Phaser from 'phaser';
import { getStage, TILE, SOLID, SURFACE, ONEWAY } from '../data/stages.js';
import { ensureStageArt, CYAN } from '../gfx/Art.js';
import { Fx } from '../gfx/Fx.js';
import { Player } from '../entities/Player.js';
import { ENEMY_TYPES } from '../entities/Enemy.js';
import { BOSS_TYPES } from '../entities/Bosses.js';
import { Projectile } from '../entities/Projectile.js';
import { Controls } from '../core/Controls.js';
import { Sound } from '../core/Audio.js';
import { Store } from '../core/Storage.js';
import { Perf } from '../core/Perf.js';
import { difficulty } from '../core/Difficulty.js';

const R = Phaser.Geom.Rectangle;
const overlap = Phaser.Geom.Intersects.RectangleToRectangle;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.stageId = data.stage || 1;
    this.checkpoint = data.checkpoint ?? null;
    this.debugBoss = !!data.debugBoss;
  }

  create() {
    const stage = (this.stage = getStage(this.stageId));
    ensureStageArt(this, this.stageId);
    this.mapW = stage.width * TILE;
    this.mapH = stage.height * TILE;
    this.timeScaleV = 1;
    this.slowT = 0;
    this.hitStopT = 0;
    this.enemies = [];
    this.hazards = [];
    this.arenaActive = false;
    this.boss = null;
    this.bossDefeated = false;
    this.ending = false;
    this.prompt = null;
    this.perfT = 0;
    this.fpsWarmup = 3;
    this._pRect = new R();
    this._eRect = new R();

    this.buildBackground();
    this.buildMap();
    this.fx = new Fx(this);
    this.buildObjects();

    // Player at the start or at the last shrine.
    const cp = this.checkpoint !== null ? stage.shrines[this.checkpoint] : null;
    let sx = (cp ? cp.x + 1.5 : stage.spawn.x) * TILE;
    let row = cp ? cp.row : this.topRow(stage.spawn.x);
    if (this.debugBoss) {
      sx = (stage.arena.x0 + 5) * TILE;
      row = this.topRow(stage.arena.x0 + 5);
    }
    this.player = new Player(this, sx, row * TILE);
    this.physics.add.collider(this.player, this.layer, null, (p, tile) => !(tile.index === ONEWAY && p.dropT > 0), this);

    this.projectiles = this.physics.add.group({ classType: Projectile, maxSize: 90, runChildUpdate: false, allowGravity: false });

    stage.enemies.forEach((e) => this.spawnEnemy(e.type, (e.x + 0.5) * TILE, e.ground ? e.row * TILE : e.row * TILE + 16));

    // Camera.
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.mapW, this.mapH);
    cam.startFollow(this.player, true, 0.14, 0.1, 0, 30);
    cam.setDeadzone(60, 70);
    cam.setRoundPixels(true);
    cam.fadeIn(350, 5, 6, 9);

    this.physics.world.setBounds(0, -200, this.mapW, this.mapH + 600);
    this.physics.world.setBoundsCollision(true, true, false, false);

    this.buildAmbient();
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(90).setAlpha(0.55);
    this.onResize();

    // HUD.
    if (!this.scene.isActive('UI')) this.scene.launch('UI');
    this.scene.bringToTop('UI');
    const hud = { stage: this.stageId, name: stage.name, jp: stage.jp, hp: this.player.hp, max: this.player.maxHp };
    this.registry.set('hud', hud);
    this.game.events.emit('hud-init', hud);

    Sound.playMusic(stage.music);
    Controls.clearBuffered();
    Controls.enabled = true;

    this.scale.on('resize', this.onResize, this);
    const offPerf = Perf.onChange(() => this.applyQuality());
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      offPerf();
      this.game.events.emit('hud-prompt', null);
    });
    this.applyQuality();
  }

  // ---------------------------------------------------------------------------
  // World building
  // ---------------------------------------------------------------------------
  buildBackground() {
    const id = this.stageId;
    const { width, height } = this.scale;
    this.sky = this.add.image(0, 0, `sky${id}`).setOrigin(0).setScrollFactor(0).setDepth(-20);
    this.moon = this.add.image(0, 0, `moon${id}`).setScrollFactor(0).setDepth(-19);
    const layers = [
      { key: `bg${id}a`, f: 0.08, d: -18, a: 1, lift: 60 },
      { key: `bg${id}b`, f: 0.25, d: -16, a: 1, lift: 20 },
      { key: `bg${id}c`, f: 0.45, d: -14, a: id === 2 ? 1 : 0.9, lift: id === 2 ? 0 : -40, top: id === 2 }
    ];
    this.layers = layers.map((l) => {
      const h = this.textures.get(l.key).getSourceImage().height;
      const ts = this.add.tileSprite(0, 0, width, h, l.key).setOrigin(0).setScrollFactor(0).setDepth(l.d).setAlpha(l.a);
      return { ...l, ts, h };
    });
  }

  buildMap() {
    const id = this.stageId;
    const map = this.make.tilemap({ data: this.stage.tiles, tileWidth: TILE, tileHeight: TILE });
    const tileset = map.addTilesetImage(`tiles${id}`, `tiles${id}`, TILE, TILE, 0, 0);
    this.map = map;
    this.layer = map.createLayer(0, tileset, 0, 0).setDepth(10);
    map.setCollision([SOLID, SURFACE]);
    this.layer.forEachTile((t) => {
      if (t.index === ONEWAY) t.setCollision(false, false, true, false, false);
    });
    this.layer.calculateFacesWithin(0, 0, map.width, map.height);
  }

  topRow(x) {
    const g = this.stage.tiles;
    for (let y = 0; y < g.length; y++) if (g[y][x] !== -1) return y;
    return g.length;
  }

  // First solid row in a column, ignoring one-way platforms.
  groundRow(x) {
    const g = this.stage.tiles;
    for (let y = 0; y < g.length; y++) if (g[y][x] === SOLID || g[y][x] === SURFACE) return y;
    return g.length;
  }

  buildObjects() {
    const s = this.stage;
    const id = this.stageId;
    // Decorations (no physics).
    s.decor.forEach((d) => {
      const x = (d.x + 0.5) * TILE, y = d.row * TILE;
      if (d.type === 'toro') {
        this.add.image(x, y, 'toro').setOrigin(0.5, 1).setDepth(8);
        if (!Perf.low) this.add.image(x, y - 40, 'glow').setScale(0.6).setAlpha(0.35).setBlendMode('ADD').setDepth(8);
      } else if (d.type === 'torii') {
        this.add.image(x, y, 'toriiFg').setOrigin(0.5, 1).setDepth(5).setAlpha(0.95);
      } else if (d.type === 'sign') {
        this.add.image(x, y - 70, `sign${(d.x * 7) % 4}`).setOrigin(0.5, 1).setDepth(5);
      } else if (d.type === 'pillar') {
        this.add.image(x, y, 'brokenPillar').setOrigin(0.5, 1).setDepth(5);
      }
    });

    // Hazard strips.
    this.spikeRects = s.spikes.map((sp) => {
      const x = sp.x0 * TILE, w = (sp.x1 - sp.x0 + 1) * TILE, y = sp.row * TILE;
      this.add.tileSprite(x, y, w, TILE, `spike${id}`).setOrigin(0).setDepth(11);
      return new R(x + 4, y + 14, w - 8, 18);
    });

    // Shrines (checkpoint + heal + save) and lore stones.
    this.interactables = [];
    s.shrines.forEach((sh, i) => {
      const x = (sh.x + 0.5) * TILE, y = sh.row * TILE;
      const lit = this.checkpoint !== null && i <= this.checkpoint;
      const img = this.add.image(x, y, 'shrine', lit ? 'on' : 'off').setOrigin(0.5, 1).setDepth(9);
      const glow = this.add.image(x, y - 28, 'glow').setBlendMode('ADD').setTint(CYAN).setDepth(9).setAlpha(lit ? 0.6 : 0);
      this.interactables.push({ kind: 'shrine', index: i, x, y, img, glow, label: 'Pray at the shrine' });
    });
    s.lore.forEach((l) => {
      const x = (l.x + 0.5) * TILE, y = l.row * TILE;
      this.add.image(x, y, 'stele').setOrigin(0.5, 1).setDepth(9);
      this.interactables.push({ kind: 'lore', x, y, text: l.text, label: 'Read the stone' });
    });

    // Arena bounds in pixels.
    const a = s.arena;
    this.arenaBounds = { x0: a.x0 * TILE, x1: (a.x1 + 1) * TILE };
  }

  buildAmbient() {
    const { width, height } = this.scale;
    const kind = this.stage.ambient;
    let cfg;
    if (kind === 'spirits') {
      cfg = {
        x: { min: 0, max: width }, y: { min: height * 0.3, max: height }, lifespan: 6000,
        speedY: { min: -30, max: -8 }, speedX: { min: -10, max: 10 }, scale: { start: 0.35, end: 0.1 },
        alpha: { start: 0.7, end: 0 }, blendMode: 'ADD', tint: [0xffffff, CYAN], frequency: 260
      };
      this.ambient = this.add.particles(0, 0, 'dot', cfg);
    } else if (kind === 'rain') {
      cfg = {
        x: { min: -40, max: width + 120 }, y: -20, lifespan: 750, speedY: { min: 820, max: 980 }, speedX: -90,
        rotate: 6, alpha: { start: 0.7, end: 0.4 }, frequency: 12, quantity: 2
      };
      this.ambient = this.add.particles(0, 0, 'raindrop', cfg);
    } else {
      cfg = {
        x: { min: 0, max: width }, y: height + 10, lifespan: 7000, speedY: { min: -50, max: -15 },
        speedX: { min: -15, max: 15 }, rotate: { start: 0, end: 360 }, scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.6, end: 0 }, frequency: 140
      };
      this.ambient = this.add.particles(0, 0, 'shard', cfg);
    }
    this.ambient.setScrollFactor(0).setDepth(kind === 'rain' ? 60 : -12);
    this.ambientBase = { frequency: cfg.frequency, quantity: cfg.quantity || 1 };
  }

  applyQuality() {
    if (!this.ambient) return;
    const low = Perf.low;
    this.ambient.frequency = low ? this.ambientBase.frequency * 3 : this.ambientBase.frequency;
    this.ambient.quantity = low ? 1 : this.ambientBase.quantity;
    if (this.layers) this.layers[2].ts.setVisible(!low || this.stageId === 2);
  }

  onResize() {
    const { width, height } = this.scale;
    this.cameras.main.setSize(width, height);
    this.sky.setDisplaySize(width, height);
    this.moon.setPosition(width * 0.74, 120);
    this.layers.forEach((l) => {
      l.ts.setSize(width, l.h);
      l.ts.y = l.top ? 0 : height - l.h + l.lift;
    });
    if (this.vignette) this.vignette.setDisplaySize(width, height);
    if (this.ambient) {
      const kind = this.stage.ambient;
      if (kind === 'rain') this.ambient.ops.x.loadConfig({ x: { min: -40, max: width + 120 } });
      else this.ambient.ops.x.loadConfig({ x: { min: 0, max: width } });
    }
  }

  // ---------------------------------------------------------------------------
  // Spawning helpers used by entities
  // ---------------------------------------------------------------------------
  spawnEnemy(type, x, y) {
    const Cls = ENEMY_TYPES[type];
    if (!Cls) return null;
    const e = new Cls(this, x, y);
    this.enemies.push(e);
    return e;
  }

  countAlive(Cls) {
    return this.enemies.filter((e) => e.alive && e instanceof Cls).length;
  }

  fireProjectile(x, y, vx, vy, opts) {
    const p = this.projectiles.get(x, y);
    if (!p) return null;
    const k = difficulty().projectileSpeed;
    return p.fire(x, y, vx * k, vy * k, opts);
  }

  spawnPillar(x, delay) {
    const marker = this.add.rectangle(x, this.arenaGroundY - 120, 4, 240, 0xffffff, 0.5).setDepth(12);
    this.hazards.push({ x, t: 0, delay, dur: 0.45, marker, img: null, hit: false });
  }

  groundAhead(e, dir) {
    const t = this.layer.getTileAtWorldXY(e.x + dir * 22, e.y + 8);
    return !!t && t.index !== -1;
  }

  isOnOneWay(p) {
    const t = this.layer.getTileAtWorldXY(p.x, p.y + 4);
    return !!t && t.index === ONEWAY;
  }

  isHazardAt(x, y) {
    return this.spikeRects.some((r) => x > r.x - 24 && x < r.right + 24 && Math.abs(y - r.bottom) < 40);
  }

  shake(duration, intensity) {
    if (Store.settings.screenShake) this.cameras.main.shake(duration, intensity);
  }

  hitStop(ms) {
    this.hitStopT = Math.max(this.hitStopT, ms / 1000);
    this.physics.world.pause();
  }

  slowmo(seconds, scale) {
    this.slowT = seconds;
    this.setTimeScale(scale);
  }

  setTimeScale(s) {
    this.timeScaleV = s;
    this.physics.world.timeScale = 1 / s;
    this.anims.globalTimeScale = s;
    this.tweens.timeScale = s;
  }

  // ---------------------------------------------------------------------------
  // Game events
  // ---------------------------------------------------------------------------
  onPlayerHurt(hp) {
    this.game.events.emit('hud-hp', hp);
    this.shake(180, 0.01);
    this.hitStop(60);
    this.cameras.main.flash(120, 255, 255, 255, false);
  }

  onPlayerDeath() {
    this.slowmo(0.8, 0.35);
    Controls.enabled = false;
    this.game.events.emit('hud-banner', { big: '死', small: 'YOUR SPIRIT FADES' });
    this.time.delayedCall(1700, () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.restart({ stage: this.stageId, checkpoint: this.checkpoint });
      });
    });
  }

  onPlayerFall() {
    const p = this.player;
    if (p.hp <= 2) {
      p.hp = 0;
      this.game.events.emit('hud-hp', 0);
      p.body.setVelocity(0, 0);
      p.body.setAllowGravity(false);
      p.setVisible(false);
      p.die();
      return;
    }
    p.hp -= 2;
    this.game.events.emit('hud-hp', p.hp);
    p.body.reset(p.lastSafe.x, p.lastSafe.y - 4);
    p.invuln = 1.2;
    Sound.play('hurt');
    this.cameras.main.flash(200, 0, 0, 0);
  }

  onParrySuccess(player) {
    this.fx.parrySuccess(player.x + player.facing * 16, player.y - 34);
    this.slowmo(0.28, 0.25);
    this.shake(120, 0.006);
    this.game.events.emit('hud-parry');
  }

  onEnemyKilled(e) {
    this.fx.death(e.x, e.y - (e.isBoss ? 60 : 20), e.isBoss);
    this.hitStop(e.isBoss ? 160 : 70);
  }

  onBossHp(boss) {
    this.game.events.emit('hud-boss-hp', Math.max(0, boss.hp / boss.maxHp));
  }

  onBossPhase(boss, phase) {
    if (phase === 3) {
      this.tweens.add({ targets: this.vignette, alpha: 0.9, duration: 800 });
      Sound.playMusic('final');
    }
    this.game.events.emit('hud-toast', { text: phase === 3 ? 'The void deepens…' : 'The Shogun stirs…', kind: 'warn' });
  }

  onBossDefeated(boss) {
    this.bossDefeated = true;
    this.arenaActive = false;
    this.slowmo(1.2, 0.3);
    this.cameras.main.flash(500, 255, 255, 255);
    this.shake(500, 0.015);
    Sound.stopMusic(0.5);
    Sound.play('bossDown');
    this.game.events.emit('hud-boss-hide');
    this.game.events.emit('hud-banner', { big: '討伐', small: `${boss.title} VANQUISHED` });
    this.projectiles.getChildren().forEach((p) => p.active && p.kill());
    this.enemies.forEach((e) => e !== boss && e.alive && e.die());

    const p = Store.progress;
    const next = Math.min(3, this.stageId + 1);
    Store.saveProgress({
      unlocked: Math.max(p.unlocked, next),
      stage: next,
      checkpoint: null,
      defeated: Array.from(new Set([...(p.defeated || []), boss.key])),
      cleared: p.cleared || this.stageId === 3
    });
    this.ending = true;
    Controls.enabled = false;
    this.time.delayedCall(3600, () => {
      this.cameras.main.fadeOut(700, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.stop('UI');
        if (this.stageId < 3) this.scene.start('StageCard', { stage: this.stageId + 1 });
        else this.scene.start('Ending');
      });
    });
  }

  lockArena() {
    this.arenaActive = true;
    const a = this.arenaBounds;
    const groundRow = this.groundRow(this.stage.arena.x0 + 2);
    this.arenaGroundY = groundRow * TILE;
    // Seal both ends of the arena.
    this.walls = [a.x0 - 16, a.x1 + 16].map((x) => {
      const wall = this.add.rectangle(x, this.mapH / 2, 32, this.mapH * 2, 0x000000, 0);
      this.physics.add.existing(wall, true);
      this.physics.add.collider(this.player, wall);
      this.add.tileSprite(x, this.arenaGroundY, 28, 220, 'gate').setOrigin(0.5, 1).setDepth(12).setAlpha(0.9);
      return wall;
    });
    const cam = this.cameras.main;
    const w = a.x1 - a.x0;
    const extra = Math.max(0, cam.width - w) / 2;
    cam.setBounds(a.x0 - extra, 0, w + extra * 2, this.mapH);

    const Boss = BOSS_TYPES[this.stage.boss];
    const bx = (this.stage.arena.bossX + 0.5) * TILE;
    this.boss = new Boss(this, bx, this.groundRow(this.stage.arena.bossX) * TILE);
    this.boss.faceTo(this.player.x);
    this.enemies.push(this.boss);
    this.walls.forEach((w2) => this.physics.add.collider(this.boss, w2));

    Sound.play('roar');
    Sound.playMusic(this.stageId === 3 ? 'final' : 'boss');
    this.shake(400, 0.006);
    this.game.events.emit('hud-boss', { title: this.boss.title, jp: this.boss.jp });
    this.game.events.emit('hud-boss-hp', 1);
  }

  interact(target) {
    if (target.kind === 'shrine') {
      this.player.heal();
      this.game.events.emit('hud-hp', this.player.hp);
      Sound.play('shrine');
      this.fx.shrine(target.x, target.y - 30);
      target.img.setFrame('on');
      this.tweens.add({ targets: target.glow, alpha: 0.6, duration: 400 });
      this.checkpoint = Math.max(this.checkpoint ?? -1, target.index);
      Store.saveProgress({ stage: this.stageId, checkpoint: this.checkpoint });
      this.game.events.emit('hud-toast', { text: 'Spirit restored · Progress saved', kind: 'save' });
    } else if (target.kind === 'lore') {
      Sound.play('lore');
      this.game.events.emit('hud-toast', { text: target.text, kind: 'lore' });
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  update(time, delta) {
    Controls.pollGamepad();
    Controls.frameMs = this.game.loop.rawDelta || delta;
    const dt = Math.min(delta, 100) / 1000;

    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.setTimeScale(1);
    }
    this.fx.update(dt);
    this.updateParallax();

    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      if (this.hitStopT <= 0) this.physics.world.resume();
      return;
    }

    const sdt = dt * this.timeScaleV;
    const player = this.player;
    player.update(sdt);

    this.updateEnemies(sdt);
    this.resolveCombat();
    this.updateProjectiles(sdt);
    this.updateHazards(sdt);
    this.updateWorldChecks();
    this.updateInteract();
    this.samplePerf(time);
  }

  updateParallax() {
    const sx = this.cameras.main.scrollX;
    this.layers.forEach((l) => {
      l.ts.tilePositionX = sx * l.f;
    });
    this.moon.x = this.scale.width * 0.74 - sx * 0.01;
  }

  updateEnemies(dt) {
    const cam = this.cameras.main;
    const left = cam.scrollX - 220, right = cam.scrollX + cam.width + 220;
    const player = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) {
        this.enemies.splice(i, 1);
        continue;
      }
      if (!e.alive) continue;
      const near = e.isBoss || (e.x > left && e.x < right);
      if (near === !e.body.enable) e.sleep(!near);
      if (!near) continue;
      e.tick(dt, player);
      if (e.y > this.mapH + 80) e.die();
    }
  }

  bodyRect(obj, out) {
    const b = obj.body;
    out.setTo(b.x, b.y, b.width, b.height);
    return out;
  }

  resolveCombat() {
    const player = this.player;
    if (player.dead) return;
    const pRect = this.bodyRect(player, this._pRect);
    const box = player.getAttackBox();

    for (const e of this.enemies) {
      if (!e.alive || !e.body.enable) continue;
      const eRect = this.bodyRect(e, this._eRect);

      // Player sword → enemy.
      if (box && e.hitBySwing !== player.swingId && overlap(box, eRect)) {
        e.hitBySwing = player.swingId;
        const dir = Math.sign(e.x - player.x) || player.facing;
        const counter = !!(player.attack && player.attack.counter);
        const killed = e.hurt(player.attackDamage, dir, { counter });
        this.fx.hit(Phaser.Math.Clamp(e.x, box.x, box.right), player.y - 30, counter || killed);
        this.hitStop(killed ? 80 : counter ? 90 : 45);
        if (counter || e.isBoss) this.shake(90, 0.004);
        if (!killed && counter) e.stun = Math.max(e.stun, 0.6);
        // Small air bounce when slashing in the air keeps combat flowing.
        if (!player.onGround && player.body.velocity.y > -100) player.body.setVelocityY(-180);
        if (!e.alive) continue;
      }

      // Enemy melee strike → player.
      if (e.attackBox && e.lastHitId !== e.attackId && overlap(e.attackBox, pRect)) {
        const res = player.takeHit(e.attackDamage, e.x, e.attackOpts);
        if (res !== 'ignored') e.lastHitId = e.attackId;
        if (res === 'parry') e.onParried();
        continue;
      }

      // Body contact.
      if (e.contactDamage && e.stun <= 0 && overlap(eRect, pRect)) {
        const res = player.takeHit(e.contactDamage, e.x, { contact: true });
        if (res === 'parry') e.onParried();
      }
    }

    // Sword cuts enemy projectiles and sends them back.
    if (box) {
      this.projectiles.getChildren().forEach((p) => {
        if (p.active && !p.friendly && p.parryable && overlap(box, p.getBounds())) this.reflect(p);
      });
    }
  }

  reflect(p) {
    const target = p.owner && p.owner.alive ? p.owner : this.nearestEnemy(p.x, p.y);
    if (target) p.reflect(target.x, target.y - (target.isBoss ? 70 : 20));
    else p.reflect(p.x - p.body.velocity.x, p.y - p.body.velocity.y);
    Sound.play('clang');
    this.fx.sparks(p.x, p.y, 8);
  }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !e.body.enable) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  updateProjectiles(dt) {
    const player = this.player;
    const pRect = this.bodyRect(player, this._pRect);
    this.projectiles.getChildren().forEach((p) => {
      if (!p.active) return;
      p.step(dt, player);
      if (!p.active) return;
      if (p.x < -50 || p.x > this.mapW + 50 || p.y > this.mapH + 100 || p.y < -300) {
        p.kill();
        return;
      }
      if (!p.ground) {
        const t = this.layer.getTileAtWorldXY(p.x, p.y);
        if (t && (t.index === SOLID || t.index === SURFACE)) {
          this.fx.sparks(p.x, p.y, 4);
          p.kill();
          return;
        }
      }
      const pb = p.getBounds();
      if (p.friendly) {
        for (const e of this.enemies) {
          if (e.alive && e.body.enable && overlap(pb, this.bodyRect(e, this._eRect))) {
            e.hurt(2, Math.sign(p.body.velocity.x) || 1, { projectile: true });
            this.fx.hit(p.x, p.y, true);
            p.kill();
            return;
          }
        }
      } else if (!player.dead && overlap(pb, pRect)) {
        const res = player.takeHit(p.dmg, p.x, { projectile: p.parryable, unblockable: false, noParry: !p.parryable });
        if (res === 'parry') this.reflect(p);
        else if (res !== 'ignored') p.kill();
      }
    });
  }

  updateHazards(dt) {
    const player = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.t += dt;
      if (h.t < h.delay) {
        h.marker.setAlpha(0.25 + 0.5 * Math.abs(Math.sin(h.t * 18)));
        continue;
      }
      if (!h.img) {
        h.marker.destroy();
        h.img = this.add.image(h.x, this.arenaGroundY, 'pillar').setOrigin(0.5, 1).setBlendMode('ADD').setDepth(19).setScale(1, 0.1);
        this.tweens.add({ targets: h.img, scaleY: 1.2, duration: 90 });
        Sound.play('slam');
        this.shake(100, 0.005);
      }
      const active = h.t < h.delay + h.dur;
      if (active && !h.hit && !player.dead && Math.abs(player.x - h.x) < 26 && player.y > this.arenaGroundY - 300) {
        const res = player.takeHit(2, h.x, { unblockable: true, noParry: true });
        if (res !== 'ignored') h.hit = true;
      }
      h.img.setAlpha(active ? 1 : Math.max(0, 1 - (h.t - h.delay - h.dur) * 4));
      if (h.t > h.delay + h.dur + 0.3) {
        h.img.destroy();
        this.hazards.splice(i, 1);
      }
    }
  }

  updateWorldChecks() {
    const player = this.player;
    if (player.dead) return;
    // Spikes and electrified strips.
    const pRect = this.bodyRect(player, this._pRect);
    for (const r of this.spikeRects) {
      if (overlap(r, pRect)) {
        const res = player.takeHit(1, player.x - player.facing, { unblockable: true, noParry: true });
        if (res === 'hit') player.body.setVelocityY(-430);
        break;
      }
    }
    // Pits.
    if (player.y > this.mapH + 60) this.onPlayerFall();
    // Boss arena.
    if (!this.arenaActive && !this.bossDefeated && player.x > this.arenaBounds.x0 + TILE * 3) this.lockArena();
  }

  updateInteract() {
    const p = this.player;
    let best = null;
    if (!p.dead && !this.ending) {
      for (const it of this.interactables) {
        if (Math.abs(it.x - p.x) < 52 && Math.abs(it.y - p.y) < 60) {
          best = it;
          break;
        }
      }
    }
    if (best !== this.prompt) {
      this.prompt = best;
      this.game.events.emit('hud-prompt', best ? best.label : null);
    }
    if (Controls.consume('interact', 150) && best) this.interact(best);
  }

  // Samples the frame rate once per real second (slow frames must not slow the sampling).
  samplePerf(time) {
    if (time - this.perfT < 1000) return;
    this.perfT = time;
    if (this.fpsWarmup > 0) {
      this.fpsWarmup--;
      return;
    }
    Perf.sample(this.game.loop.actualFps);
  }
}
