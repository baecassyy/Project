// Level layouts. Each stage is built on a tile grid (32px tiles, 18 rows) with a
// small builder API so jumps stay within the player's reach:
// single jump ≈ 3.5 tiles high, double jump ≈ 6.5 tiles, gaps up to ~5 tiles.

export const TILE = 32;
export const ROWS = 18;
export const EMPTY = -1;
export const SOLID = 0;
export const SURFACE = 1;
export const ONEWAY = 2;

class Builder {
  constructor(width) {
    this.w = width;
    this.h = ROWS;
    this.grid = Array.from({ length: ROWS }, () => new Array(width).fill(0)); // 0 empty, 1 solid, 2 one-way
    this.enemies = [];
    this.shrines = [];
    this.lore = [];
    this.decor = [];
    this.spikes = [];
    this.arena = null;
    this.spawn = { x: 3 };
  }

  ground(x0, x1, top) {
    for (let x = x0; x <= x1; x++) for (let y = top; y < this.h; y++) this.grid[y][x] = 1;
    return this;
  }

  block(x0, y0, x1, y1) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.grid[y][x] = 1;
    return this;
  }

  plat(x0, x1, y) {
    for (let x = x0; x <= x1; x++) this.grid[y][x] = 2;
    return this;
  }

  // Row index of the first standable tile in column x (solid or one-way).
  top(x) {
    for (let y = 0; y < this.h; y++) if (this.grid[y][x] !== 0) return y;
    return this.h;
  }

  spike(x0, x1) {
    this.spikes.push({ x0, x1, row: this.top(x0) - 1 });
    return this;
  }

  enemy(type, x, row) {
    this.enemies.push({ type, x, row: row === undefined ? this.top(x) : row, ground: row === undefined });
    return this;
  }

  shrine(x) {
    this.shrines.push({ x, row: this.top(x) });
    return this;
  }

  addLore(x, text) {
    this.lore.push({ x, row: this.top(x), text });
    return this;
  }

  deco(type, x, opts = {}) {
    this.decor.push({ type, x, row: this.top(x), ...opts });
    return this;
  }

  setArena(x0, x1, bossX) {
    this.arena = { x0, x1, bossX };
    return this;
  }

  finish() {
    // Solid walls at both map edges.
    for (let y = 0; y < this.h; y++) {
      this.grid[y][0] = 1;
      this.grid[y][this.w - 1] = 1;
    }
    // Convert to tile indices: surface tiles get a top edge.
    const tiles = this.grid.map((row, y) =>
      row.map((v, x) => {
        if (v === 2) return ONEWAY;
        if (v === 1) return y > 0 && this.grid[y - 1][x] === 1 ? SOLID : SURFACE;
        return EMPTY;
      })
    );
    return {
      width: this.w, height: this.h, tiles,
      enemies: this.enemies, shrines: this.shrines, lore: this.lore,
      decor: this.decor, spikes: this.spikes, arena: this.arena, spawn: this.spawn
    };
  }
}

function stage1() {
  const b = new Builder(176);
  b.ground(0, 24, 14)
    .addLore(6, 'The bell of this shrine has not rung for a hundred years.\nIts spirits still wait for someone to listen.')
    .deco('toro', 10).deco('torii', 14)
    .enemy('wisp', 20, 10);
  b.ground(29, 48, 13).plat(34, 38, 10).enemy('shade', 43).enemy('wisp', 36, 7);
  b.ground(49, 52, 14).ground(53, 58, 11);
  b.ground(59, 76, 14).deco('toro', 60).shrine(64).enemy('shade', 71).enemy('wisp', 74, 10);
  b.plat(78, 79, 12);
  b.ground(81, 100, 13).plat(86, 89, 10).plat(91, 94, 7)
    .addLore(83, 'A fox wearing a hollow mask guards the inner sanctum.\nIt has forgotten whom it was protecting.')
    .enemy('shade', 90).enemy('shade', 98).enemy('wisp', 92, 4);
  b.ground(101, 110, 14).spike(104, 106).enemy('wisp', 108, 10);
  b.ground(111, 127, 12).deco('torii', 115).enemy('shade', 119).shrine(124);
  b.ground(128, 131, 14);
  b.ground(132, 175, 14).plat(138, 142, 10).plat(162, 166, 10).deco('toro', 134).deco('toro', 170);
  b.setArena(132, 174, 160);
  return {
    id: 1, key: 'shrine', name: 'Forgotten Spirit Shrine', jp: '忘れられた霊の社', chapter: '第一章',
    music: 'shrine', ambient: 'spirits', boss: 'kitsune', ...b.finish()
  };
}

function stage2() {
  const b = new Builder(196);
  b.ground(0, 20, 14)
    .addLore(5, 'Neon replaced the lanterns. The ghosts stayed.\nThey simply learned to flicker.')
    .deco('sign', 9).deco('sign', 17).enemy('drone', 18, 8);
  b.ground(25, 40, 12).plat(28, 31, 9).enemy('shade', 34).deco('sign', 38);
  b.ground(41, 46, 14).spike(42, 44);
  b.ground(47, 62, 12).shrine(50).deco('sign', 55).enemy('drone', 58, 7).enemy('shade', 60);
  b.plat(64, 65, 11);
  b.ground(67, 84, 13).plat(70, 73, 10).plat(76, 79, 7).enemy('shade', 72).enemy('shade', 81).enemy('drone', 77, 4);
  b.ground(85, 90, 10).deco('sign', 87);
  b.ground(91, 104, 14).spike(95, 98).enemy('drone', 100, 9);
  b.plat(106, 107, 11);
  b.ground(109, 128, 12).enemy('shade', 115).enemy('shade', 125).enemy('drone', 120, 6).deco('sign', 112);
  b.ground(129, 140, 13)
    .addLore(131, 'The Iron Ronin sold his oath to the syndicate.\nSteel remembers what men forget.')
    .shrine(137);
  b.ground(141, 147, 14);
  b.ground(148, 195, 14).plat(154, 158, 10).plat(178, 182, 10).deco('sign', 150).deco('sign', 190);
  b.setArena(148, 194, 178);
  return {
    id: 2, key: 'neon', name: 'Neon Chinatown', jp: '電脳中華街', chapter: '第二章',
    music: 'neon', ambient: 'rain', boss: 'ronin', ...b.finish()
  };
}

function stage3() {
  const b = new Builder(206);
  b.ground(0, 18, 14)
    .addLore(4, 'Below the city, below the shrine,\nthe void keeps every name ever spoken in vain.')
    .enemy('wisp', 14, 10);
  b.plat(20, 21, 11);
  b.ground(23, 36, 13).deco('pillar', 25).enemy('oni', 31);
  b.ground(41, 52, 12).enemy('wisp', 46, 8).enemy('wisp', 50, 6).enemy('shade', 49);
  b.plat(55, 58, 10);
  b.ground(61, 76, 13).shrine(64).enemy('oni', 72).deco('torii', 67);
  b.plat(80, 82, 10).plat(85, 87, 8).plat(90, 92, 10).enemy('wisp', 86, 4);
  b.ground(95, 112, 13).enemy('shade', 100).enemy('wisp', 104, 8).enemy('oni', 109);
  b.ground(113, 120, 11).spike(115, 117);
  b.ground(121, 140, 13).enemy('wisp', 128, 9).enemy('wisp', 134, 7).enemy('shade', 137).deco('pillar', 124);
  b.ground(145, 160, 12)
    .addLore(147, 'The Shogun rules a kingdom of echoes.\nEnd his reign, and let the requiem finally play.')
    .enemy('oni', 151).shrine(157);
  b.ground(161, 164, 14);
  b.ground(165, 205, 14).plat(171, 175, 10).plat(195, 199, 10).deco('pillar', 167).deco('pillar', 201);
  b.setArena(165, 204, 192);
  return {
    id: 3, key: 'abyss', name: 'Abyssal Shrine Realm', jp: '深淵の神域', chapter: '第三章',
    music: 'abyss', ambient: 'ash', boss: 'shogun', ...b.finish()
  };
}

export const STAGES = [stage1(), stage2(), stage3()];
export const getStage = (id) => STAGES[id - 1];
