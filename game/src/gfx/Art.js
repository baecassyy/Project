// Procedural art. Every sprite, tile and background is drawn here with Canvas 2D
// at boot, in a monochrome palette with a single cyan accent (the player's katana,
// UI highlights and neon). No image downloads are needed, which keeps loading fast
// on mobile networks. Stage backgrounds are built on demand and freed afterwards.

import { FONT_JP } from '../core/Layout.js';

export const PAL = {
  ink: '#050609',
  dark: '#0d1015',
  body: '#14171d',
  mid: '#2a2f38',
  grey: '#5b626e',
  rim: '#9aa3b0',
  light: '#c9d0d9',
  white: '#eef2f6',
  cyan: '#5fe8ff',
  cyanDeep: '#1aa6c4'
};
export const CYAN = 0x5fe8ff;
export const WHITE = 0xeef2f6;

const TAU = Math.PI * 2;
const dir = (a, l) => ({ x: Math.sin(a) * l, y: Math.cos(a) * l });
const add = (p, v) => ({ x: p.x + v.x, y: p.y + v.y });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
  return tex;
}

// Draws several frames side by side into one canvas texture and registers named frames.
function sheet(scene, key, fw, fh, frames) {
  const cols = frames.length;
  const tex = canvasTexture(scene, key, fw * cols, fh, (ctx) => {
    frames.forEach((f, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * fw, 0, fw, fh);
      ctx.clip();
      f.draw(ctx, i * fw, 0);
      ctx.restore();
    });
  });
  frames.forEach((f, i) => tex.add(f.name, 0, i * fw, 0, fw, fh));
  tex.refresh();
  return tex;
}

function line(ctx, pts, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function rimLine(ctx, pts, w, color, rim) {
  line(ctx, pts, w + 2.4, rim);
  line(ctx, pts, w, color);
}

function disc(ctx, x, y, r, fill, rim) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (rim) {
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = fill;
  ctx.fill();
}

function glowLine(ctx, pts, w, color, core, blur = 8) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  line(ctx, pts, w, color);
  ctx.restore();
  if (core) line(ctx, pts, Math.max(1, w * 0.4), core);
}

// ---------------------------------------------------------------------------
// Humanoid figure, used for the player, foot soldiers, the oni and two bosses.
// Angles are measured from straight down; positive values rotate toward facing.
// ---------------------------------------------------------------------------
const NINJA_STYLE = {
  scale: 1, rim: PAL.rim, body: PAL.body, back: '#0b0d11', limb: 5, torso: 9, headR: 6,
  weapon: 'katana', weaponLen: 30, weaponColor: PAL.cyan, weaponCore: '#ffffff', glow: 9,
  scarf: PAL.white, eyes: PAL.white
};

function humanoid(ctx, cx, base, pose, styleOverrides = {}) {
  const S = { ...NINJA_STYLE, ...styleOverrides };
  const P = {
    lean: 0, bob: 0, crouch: 0, fl: [0.15, -0.05], bl: [-0.15, 0.05],
    fa: [0.6, 1.4], ba: [0.2, 0.7], sword: 1.6, scarf: 0, ...pose
  };
  ctx.save();
  ctx.translate(cx, base);
  ctx.scale(S.scale, S.scale);
  const hip = { x: 0, y: -25 + P.bob + P.crouch };
  const legPts = (a) => {
    const knee = add(hip, dir(a[0], 12.5));
    return [hip, knee, add(knee, dir(a[1], 12.5))];
  };
  const up = Math.PI - P.lean;
  const sh = add(hip, dir(up, S.bulk ? 17 : 15));
  const head = add(sh, dir(Math.PI - P.lean * 0.6, S.headR + 2.5));
  const armPts = (a) => {
    const el = add(sh, dir(a[0], 9));
    return [sh, el, add(el, dir(a[1], 9.5))];
  };

  // Cape (behind everything).
  if (S.cape) {
    ctx.fillStyle = S.capeColor || '#07080b';
    ctx.strokeStyle = S.rim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sh.x - 3, sh.y);
    const w = P.scarf;
    ctx.quadraticCurveTo(sh.x - 22, sh.y + 10 + Math.sin(w) * 3, sh.x - 26 + Math.sin(w + 1) * 3, 0 - 2);
    for (let i = 0; i <= 4; i++) ctx.lineTo(sh.x - 26 + i * 6, -2 - (i % 2) * 5);
    ctx.lineTo(hip.x + 4, hip.y + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Scarf / headband tails.
  if (S.scarf) {
    const pts = [];
    const start = add(head, { x: -S.headR * 0.6, y: -1 });
    for (let i = 0; i < 6; i++) {
      pts.push({ x: start.x - i * 4.4, y: start.y + Math.sin(i * 0.95 + P.scarf) * 2.2 + i * 0.9 });
    }
    line(ctx, pts, 3.2, S.rim);
    line(ctx, pts, 1.8, S.scarf);
  }

  const backLeg = legPts(P.bl);
  const frontLeg = legPts(P.fl);
  const backArm = armPts(P.ba);
  const frontArm = armPts(P.fa);

  rimLine(ctx, backLeg, S.limb, S.back, '#4a515c');
  rimLine(ctx, backArm, S.limb - 1, S.back, '#4a515c');

  // Torso.
  rimLine(ctx, [hip, sh], S.torso, S.body, S.rim);
  if (S.bulk) rimLine(ctx, [add(hip, { x: 2, y: -2 }), add(sh, { x: 2, y: 2 })], S.torso + 3, S.body, S.rim);
  // Sash.
  line(ctx, [add(hip, { x: -4, y: -2 }), add(hip, { x: 4, y: -3 })], 2, S.sash || '#4a515c');

  rimLine(ctx, frontLeg, S.limb, S.body, S.rim);

  // Head.
  disc(ctx, head.x, head.y, S.headR, S.body, S.rim);
  if (S.topknot) disc(ctx, head.x - 3, head.y - S.headR - 1, 2.2, S.body, S.rim);
  // Eye slit.
  ctx.save();
  ctx.shadowColor = S.eyes;
  ctx.shadowBlur = S.eyeGlow || 4;
  line(ctx, [add(head, { x: 0.5, y: -1 }), add(head, { x: S.headR - 0.8, y: -1.3 })], 1.6, S.eyes);
  ctx.restore();

  // Straw hat (jingasa).
  if (S.hat) {
    ctx.fillStyle = S.body;
    ctx.strokeStyle = S.rim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(head.x - 13, head.y - 1);
    ctx.lineTo(head.x + 1, head.y - 10);
    ctx.lineTo(head.x + 15, head.y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Kabuto helmet with crescent crest.
  if (S.kabuto) {
    ctx.fillStyle = S.body;
    ctx.strokeStyle = S.rim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(head.x, head.y - 1, S.headR + 1.5, Math.PI, TAU);
    ctx.lineTo(head.x + S.headR + 5, head.y + 2);
    ctx.lineTo(head.x - S.headR - 5, head.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = S.crestColor || S.rim;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = S.crestColor || S.light || PAL.light;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(head.x, head.y - S.headR - 6, 7, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();
    ctx.restore();
  }
  // Horns.
  if (S.horns) {
    ctx.fillStyle = PAL.light;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.moveTo(head.x + s * 3, head.y - S.headR + 1);
      ctx.lineTo(head.x + s * 8, head.y - S.headR - 9);
      ctx.lineTo(head.x + s * 1, head.y - S.headR + 2);
      ctx.closePath();
      ctx.fill();
    });
  }
  // Crown of the void shogun.
  if (S.crown) {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(head.x - 9, head.y - S.headR - 12);
    ctx.quadraticCurveTo(head.x, head.y - S.headR + 2, head.x + 9, head.y - S.headR - 12);
    ctx.stroke();
    ctx.restore();
  }
  // Shoulder plates.
  if (S.armor) {
    ctx.fillStyle = S.body;
    ctx.strokeStyle = S.rim;
    ctx.lineWidth = 1.2;
    [-1, 1].forEach((s) => {
      ctx.beginPath();
      ctx.rect(sh.x + s * 5 - 4, sh.y - 1, 8, 9);
      ctx.fill();
      ctx.stroke();
      line(ctx, [{ x: sh.x + s * 5 - 4, y: sh.y + 3 }, { x: sh.x + s * 5 + 4, y: sh.y + 3 }], 0.8, S.rim);
    });
  }

  rimLine(ctx, frontArm, S.limb - 1, S.body, S.rim);
  const hand = frontArm[2];

  // Weapon.
  const tip = add(hand, dir(P.sword, S.weaponLen));
  const pommel = add(hand, dir(P.sword + Math.PI, 6));
  if (S.weapon === 'katana' || S.weapon === 'nodachi') {
    line(ctx, [pommel, hand], 3, '#3a404a');
    line(ctx, [add(hand, dir(P.sword + Math.PI / 2, 2.5)), add(hand, dir(P.sword - Math.PI / 2, 2.5))], 2, S.rim);
    glowLine(ctx, [hand, tip], S.weapon === 'nodachi' ? 3.2 : 2.6, S.weaponColor, S.weaponCore, S.glow);
  } else if (S.weapon === 'yari') {
    const butt = add(hand, dir(P.sword + Math.PI, 16));
    line(ctx, [butt, tip], 2, '#6b7380');
    ctx.fillStyle = S.weaponColor;
    const a = add(tip, dir(P.sword, 7));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const l = add(tip, dir(P.sword + Math.PI / 2, 2.5));
    const r = add(tip, dir(P.sword - Math.PI / 2, 2.5));
    ctx.lineTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.closePath();
    ctx.fill();
  } else if (S.weapon === 'kanabo') {
    line(ctx, [pommel, tip], 4, '#3a404a');
    rimLine(ctx, [add(hand, dir(P.sword, S.weaponLen * 0.45)), tip], 7, S.body, S.rim);
    for (let i = 0.5; i <= 1; i += 0.12) {
      const p = add(hand, dir(P.sword, S.weaponLen * i));
      disc(ctx, p.x + Math.cos(P.sword) * 3, p.y - Math.sin(P.sword) * 3, 1, PAL.light);
    }
  }
  ctx.restore();
}

// Player poses (sword angles are tuned for a readable silhouette).
function runPose(i) {
  const t = (i / 6) * TAU;
  const leg = (ph) => {
    const thigh = 0.85 * Math.sin(ph);
    const bend = 0.25 + 1.15 * Math.max(0, Math.cos(ph));
    return [thigh, thigh - bend];
  };
  return {
    lean: 0.38, bob: -Math.abs(Math.cos(t)) * 2, fl: leg(t), bl: leg(t + Math.PI),
    fa: [-0.5, -0.9], ba: [0.8, 1.6], sword: -1.95, scarf: t
  };
}

const PLAYER_POSES = {
  idle0: { lean: 0.08, fl: [0.28, -0.04], bl: [-0.22, 0.06], fa: [0.7, 1.7], ba: [0.3, 1.0], sword: 2.2, scarf: 0 },
  idle1: { lean: 0.1, bob: 1, crouch: 0.5, fl: [0.3, -0.06], bl: [-0.24, 0.08], fa: [0.72, 1.75], ba: [0.32, 1.05], sword: 2.24, scarf: 1.6 },
  jump: { lean: 0.15, fl: [1.3, 0.25], bl: [0.25, -0.7], fa: [1.3, 2.2], ba: [-0.6, -0.2], sword: 2.6, scarf: 2 },
  fall: { lean: 0.05, fl: [0.55, 0.15], bl: [-0.3, -0.45], fa: [1.6, 2.1], ba: [-0.9, -0.5], sword: 2.3, scarf: 3.5 },
  dash: { lean: 1.05, crouch: 3, fl: [-0.4, -1.0], bl: [-1.0, -1.5], fa: [-0.4, -0.7], ba: [1.4, 1.6], sword: -1.65, scarf: 4 },
  atk1: { lean: 0.3, crouch: 2, fl: [0.65, 0.05], bl: [-0.6, -0.2], fa: [1.55, 1.6], ba: [0.2, 0.6], sword: 1.62, scarf: 1 },
  atk2: { lean: 0.2, crouch: 1, fl: [0.5, 0], bl: [-0.55, -0.15], fa: [2.25, 2.55], ba: [0.3, 0.8], sword: 2.8, scarf: 2 },
  atk3: { lean: 0.55, crouch: 5, fl: [0.95, 0.25], bl: [-0.95, -0.5], fa: [1.3, 1.1], ba: [-0.2, 0.3], sword: 0.95, scarf: 3 },
  airatk: { lean: 0.25, fl: [1.2, 0.2], bl: [0.3, -0.7], fa: [1.7, 1.7], ba: [-0.6, -0.3], sword: 1.75, scarf: 2.5 },
  parry: { lean: -0.05, crouch: 2, fl: [0.42, 0], bl: [-0.42, 0.1], fa: [1.25, 2.6], ba: [1.0, 2.2], sword: 3.05, scarf: 0.5 },
  hurt: { lean: -0.4, fl: [0.3, 0.55], bl: [-0.25, 0.35], fa: [2.5, 2.85], ba: [-2.2, -2.6], sword: 2.9, scarf: 2 }
};

// ---------------------------------------------------------------------------
// Fox spirit boss.
// ---------------------------------------------------------------------------
function kitsune(ctx, cx, base, pose) {
  const P = { crouch: 0, stretch: 0, head: 0, tails: 0, legs: 0, ...pose };
  ctx.save();
  ctx.translate(cx, base);
  const bodyY = -36 + P.crouch;
  const len = 34 + P.stretch;
  const W = '#d9dee5', S2 = '#8b939e', O = '#1a1d23';

  // Tails: five flowing spirit tails.
  for (let i = 0; i < 5; i++) {
    const a = -0.5 - i * 0.28 + P.tails * 0.3;
    const sx = -len * 0.5, sy = bodyY - 4;
    const ex = sx - 38 * Math.cos(a * 0.6), ey = sy - 34 * Math.sin(-a) - 6 + i * 3;
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, W);
    grad.addColorStop(0.75, '#bfe9f2');
    grad.addColorStop(1, 'rgba(95,232,255,0.15)');
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 - i * 0.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx - 22, sy - 26 - i * 4 + P.tails * 6, ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // Legs.
  const legs = [
    { x: -len * 0.38, ph: 0 }, { x: -len * 0.22, ph: Math.PI },
    { x: len * 0.3, ph: Math.PI }, { x: len * 0.42, ph: 0 }
  ];
  legs.forEach((l, i) => {
    const swing = Math.sin(l.ph + P.legs) * 0.45 * (P.stretch ? 1.6 : 1);
    const hip = { x: l.x, y: bodyY + 6 };
    const knee = add(hip, dir(swing + (i < 2 ? -0.3 : 0.3), 12));
    const foot = add(knee, dir(swing * 0.5, 13 + P.crouch * 0.5));
    rimLine(ctx, [hip, knee, foot], 3.2, i % 2 ? S2 : W, O);
  });

  // Body.
  ctx.fillStyle = W;
  ctx.strokeStyle = O;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, bodyY, len * 0.62, 10, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = S2;
  ctx.beginPath();
  ctx.ellipse(-4, bodyY + 4, len * 0.45, 4, 0, 0, Math.PI);
  ctx.fill();

  // Neck and head with fox mask.
  const neck = { x: len * 0.5, y: bodyY - 4 };
  const hd = { x: neck.x + 10, y: bodyY - 14 + P.head };
  rimLine(ctx, [neck, hd], 8, W, O);
  ctx.fillStyle = W;
  ctx.beginPath();
  ctx.moveTo(hd.x - 8, hd.y - 4);
  ctx.lineTo(hd.x - 6, hd.y - 19); // ear
  ctx.lineTo(hd.x - 1, hd.y - 7);
  ctx.lineTo(hd.x + 3, hd.y - 19); // ear
  ctx.lineTo(hd.x + 6, hd.y - 6);
  ctx.lineTo(hd.x + 20, hd.y + 1); // snout
  ctx.lineTo(hd.x + 4, hd.y + 6);
  ctx.lineTo(hd.x - 8, hd.y + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Mask markings and hollow eye.
  ctx.fillStyle = O;
  ctx.beginPath();
  ctx.moveTo(hd.x + 1, hd.y - 2);
  ctx.lineTo(hd.x + 9, hd.y - 1);
  ctx.lineTo(hd.x + 2, hd.y + 1);
  ctx.closePath();
  ctx.fill();
  disc(ctx, hd.x + 4, hd.y - 0.6, 0.9, '#ffffff');
  line(ctx, [{ x: hd.x + 12, y: hd.y + 3 }, { x: hd.x + 18, y: hd.y + 1.5 }], 1, O);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Small enemies.
// ---------------------------------------------------------------------------
function wisp(ctx, cx, cy, ph) {
  const g = ctx.createRadialGradient(cx, cy + 4, 1, cx, cy + 4, 13);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(210,245,255,0.85)');
  g.addColorStop(1, 'rgba(95,232,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 6);
  ctx.quadraticCurveTo(cx - 8, cy - 8, cx + Math.sin(ph) * 4, cy - 17);
  ctx.quadraticCurveTo(cx + 8, cy - 6, cx + 9, cy + 6);
  ctx.arc(cx, cy + 6, 9, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#0a0c10';
  disc(ctx, cx - 3, cy + 3, 1.5, '#0a0c10');
  disc(ctx, cx + 3, cy + 3, 1.5, '#0a0c10');
}

function drone(ctx, cx, cy, ph, charge) {
  ctx.save();
  ctx.translate(cx, cy);
  // Rotor blur.
  ctx.strokeStyle = 'rgba(200,210,220,0.5)';
  ctx.lineWidth = 1.2;
  [-11, 11].forEach((x) => {
    ctx.beginPath();
    ctx.ellipse(x, -10, 8 + Math.sin(ph) * 2, 1.5, 0, 0, TAU);
    ctx.stroke();
    line(ctx, [{ x, y: -9 }, { x: x * 0.6, y: -4 }], 1.5, PAL.grey);
  });
  // Hull.
  ctx.fillStyle = PAL.body;
  ctx.strokeStyle = PAL.rim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 8);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Eye.
  ctx.save();
  ctx.shadowColor = charge ? '#ffffff' : PAL.light;
  ctx.shadowBlur = charge ? 12 : 4;
  disc(ctx, 4, 0, charge ? 4 : 3, charge ? '#ffffff' : PAL.light);
  ctx.restore();
  disc(ctx, 4, 0, 1.2, PAL.ink);
  // Antenna.
  line(ctx, [{ x: -6, y: 6 }, { x: -9, y: 13 }], 1, PAL.grey);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tiles, hazards and props (one set per stage).
// ---------------------------------------------------------------------------
const THEME_TILES = {
  1: { base: '#16191f', alt: '#1b1f26', edge: '#aab2bd', accent: '#6f7884', plat: '#2b2f37' },
  2: { base: '#121419', alt: '#181b21', edge: '#5fe8ff', accent: '#3a414c', plat: '#20242c' },
  3: { base: '#0a0b0e', alt: '#0f1115', edge: '#ffffff', accent: '#3b414b', plat: '#16181d' }
};

function drawTiles(ctx, stage) {
  const T = THEME_TILES[stage];
  const r = rng(stage * 97);
  for (let t = 0; t < 2; t++) {
    const ox = t * 32;
    ctx.fillStyle = T.base;
    ctx.fillRect(ox, 0, 32, 32);
    if (stage === 1) {
      // Stone blocks.
      ctx.strokeStyle = '#0b0d10';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, 0.5, 31, 15);
      ctx.strokeRect(ox + 0.5 - 16, 16.5, 31, 15);
      ctx.strokeRect(ox + 16.5, 16.5, 31, 15);
      ctx.fillStyle = T.alt;
      ctx.fillRect(ox + 2, 2, 12, 3);
    } else if (stage === 2) {
      // Metal panels with rivets.
      ctx.fillStyle = T.alt;
      ctx.fillRect(ox + 1, 1, 30, 30);
      ctx.strokeStyle = '#0a0b0e';
      ctx.strokeRect(ox + 1.5, 1.5, 29, 29);
      [[4, 4], [27, 4], [4, 27], [27, 27]].forEach(([x, y]) => disc(ctx, ox + x, y, 1, '#3d4450'));
      line(ctx, [{ x: ox + 6, y: 16 }, { x: ox + 26, y: 16 }], 1, '#22262e');
    } else {
      // Obsidian with glowing white cracks.
      ctx.fillStyle = T.alt;
      ctx.fillRect(ox + 3 + r() * 10, 3 + r() * 10, 10, 8);
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = ox + 4 + r() * 24, y = 2;
      ctx.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        x += (r() - 0.5) * 10;
        y += 7;
        ctx.lineTo(Math.max(ox + 1, Math.min(ox + 31, x)), y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  // Tile 1 = surface tile: add a top edge.
  ctx.save();
  if (stage === 2) {
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 6;
  }
  ctx.fillStyle = T.edge;
  ctx.fillRect(32, 0, 32, stage === 2 ? 2 : 3);
  ctx.restore();
  ctx.fillStyle = T.accent;
  ctx.fillRect(32, stage === 2 ? 2 : 3, 32, 2);
  if (stage === 1) {
    // Moss tufts.
    for (let i = 0; i < 5; i++) ctx.fillRect(32 + 3 + i * 6, 3, 2, 2 + (i % 2) * 2);
  }
  if (stage === 3) {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 0, 32, 1.5);
    ctx.restore();
  }
  // Tile 2 = one-way platform.
  const ox = 64;
  if (stage === 1) {
    ctx.fillStyle = '#3a3128';
    ctx.fillRect(ox, 0, 32, 8);
    ctx.fillStyle = '#5a5047';
    ctx.fillRect(ox, 0, 32, 2);
    line(ctx, [{ x: ox + 10, y: 1 }, { x: ox + 10, y: 8 }], 1, '#221d18');
    line(ctx, [{ x: ox + 22, y: 1 }, { x: ox + 22, y: 8 }], 1, '#221d18');
    ctx.fillStyle = '#2b241e';
    ctx.fillRect(ox + 3, 8, 3, 6);
    ctx.fillRect(ox + 26, 8, 3, 6);
  } else if (stage === 2) {
    ctx.fillStyle = T.plat;
    ctx.fillRect(ox, 0, 32, 8);
    ctx.strokeStyle = '#4a525e';
    for (let i = 0; i < 8; i++) line(ctx, [{ x: ox + i * 4 + 1, y: 1 }, { x: ox + i * 4 + 3, y: 7 }], 1, '#3a414c');
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 5;
    ctx.fillStyle = PAL.cyan;
    ctx.fillRect(ox, 0, 32, 1.5);
    ctx.restore();
  } else {
    ctx.fillStyle = T.plat;
    ctx.beginPath();
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox + 32, 0);
    ctx.lineTo(ox + 28, 10);
    ctx.lineTo(ox + 18, 14);
    ctx.lineTo(ox + 8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, 0, 32, 1);
  }
}

function drawSpikes(ctx, stage) {
  if (stage === 2) {
    // Electrified emitter strip.
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 24, 32, 8);
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = PAL.cyan;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    for (let x = 0; x <= 32; x += 4) ctx.lineTo(x, 22 - (x % 8 === 0 ? 10 : 2));
    ctx.stroke();
    ctx.restore();
    return;
  }
  const col = stage === 3 ? '#0a0b0e' : '#3b414b';
  const rim = stage === 3 ? '#ffffff' : '#aab2bd';
  for (let i = 0; i < 4; i++) {
    const x = i * 8;
    ctx.fillStyle = col;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, 32);
    ctx.lineTo(x + 4, 12 + (i % 2) * 4);
    ctx.lineTo(x + 7, 32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function hokora(ctx, x0, lit) {
  // A small roadside shrine with a lantern flame.
  const cx = x0 + 32;
  ctx.fillStyle = '#1b1e24';
  ctx.strokeStyle = PAL.rim;
  ctx.lineWidth = 1.5;
  // Base.
  ctx.fillRect(cx - 18, 70, 36, 10);
  ctx.strokeRect(cx - 18, 70, 36, 10);
  // Body.
  ctx.fillRect(cx - 13, 40, 26, 30);
  ctx.strokeRect(cx - 13, 40, 26, 30);
  // Roof.
  ctx.beginPath();
  ctx.moveTo(cx - 24, 42);
  ctx.quadraticCurveTo(cx, 20, cx + 24, 42);
  ctx.lineTo(cx + 20, 38);
  ctx.quadraticCurveTo(cx, 22, cx - 20, 38);
  ctx.closePath();
  ctx.fillStyle = '#2a2f38';
  ctx.fill();
  ctx.stroke();
  // Door with flame.
  ctx.fillStyle = '#07080b';
  ctx.fillRect(cx - 7, 48, 14, 16);
  if (lit) {
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 16;
    const g = ctx.createRadialGradient(cx, 58, 1, cx, 58, 9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, PAL.cyan);
    g.addColorStop(1, 'rgba(95,232,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 4, 62);
    ctx.quadraticCurveTo(cx - 5, 54, cx, 49);
    ctx.quadraticCurveTo(cx + 5, 54, cx + 4, 62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    disc(ctx, cx, 60, 2, '#3a404a');
  }
  // Shimenawa rope with paper streamers.
  line(ctx, [{ x: cx - 14, y: 44 }, { x: cx + 14, y: 44 }], 2, '#b9c0c9');
  [-8, 0, 8].forEach((dx) => {
    ctx.fillStyle = '#eef2f6';
    ctx.beginPath();
    ctx.moveTo(cx + dx, 45);
    ctx.lineTo(cx + dx + 3, 49);
    ctx.lineTo(cx + dx, 52);
    ctx.lineTo(cx + dx + 3, 56);
    ctx.lineTo(cx + dx + 1, 56);
    ctx.lineTo(cx + dx - 2, 52);
    ctx.lineTo(cx + dx + 1, 49);
    ctx.closePath();
    ctx.fill();
  });
}

function torii(ctx, x, y, w, h, color, rim) {
  ctx.fillStyle = color;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  const pw = w * 0.08;
  // Pillars.
  ctx.fillRect(x + w * 0.16, y + h * 0.12, pw, h * 0.88);
  ctx.fillRect(x + w * 0.76, y + h * 0.12, pw, h * 0.88);
  // Kasagi (top beam, curved).
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.04);
  ctx.quadraticCurveTo(x + w / 2, y + h * 0.12, x + w, y + h * 0.04);
  ctx.lineTo(x + w * 0.96, y + h * 0.12);
  ctx.quadraticCurveTo(x + w / 2, y + h * 0.18, x + w * 0.04, y + h * 0.12);
  ctx.closePath();
  ctx.fill();
  if (rim) ctx.stroke();
  // Nuki (lower beam).
  ctx.fillRect(x + w * 0.08, y + h * 0.26, w * 0.84, h * 0.05);
  ctx.fillRect(x + w * 0.47, y + h * 0.14, w * 0.06, h * 0.12);
}

function neonSign(ctx, x, y, text, glow) {
  const n = text.length;
  const w = 30, h = 14 + n * 30;
  ctx.fillStyle = '#0c0e12';
  ctx.strokeStyle = glow ? PAL.cyan : '#cfd6df';
  ctx.lineWidth = 2;
  ctx.save();
  ctx.shadowColor = glow ? PAL.cyan : '#ffffff';
  ctx.shadowBlur = 10;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = glow ? PAL.cyan : '#eef2f6';
  ctx.font = `900 22px ${FONT_JP}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) ctx.fillText(text[i], x + w / 2, y + 22 + i * 30);
  ctx.restore();
  return { w, h };
}

// ---------------------------------------------------------------------------
// Backgrounds. Layers wrap horizontally (drawn at x and x ± width).
// ---------------------------------------------------------------------------
const BG_W = 1024;

function wrap(ctx, fn) {
  fn(0);
  fn(-BG_W);
  fn(BG_W);
}

// A soft horizontal fog bank, flattened so it fits inside the layer's height.
function fogPuff(ctx, x, y, rw, inner, outer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.28);
  const g = ctx.createRadialGradient(0, 0, 5, 0, 0, rw / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(-rw / 2, -rw / 2, rw, rw);
  ctx.restore();
}

function buildSky(scene, stage) {
  canvasTexture(scene, `sky${stage}`, 256, 270, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (stage === 1) {
      g.addColorStop(0, '#05060a');
      g.addColorStop(0.6, '#13161c');
      g.addColorStop(1, '#22262d');
    } else if (stage === 2) {
      g.addColorStop(0, '#040507');
      g.addColorStop(0.7, '#0e1218');
      g.addColorStop(1, '#16303a');
    } else {
      g.addColorStop(0, '#000000');
      g.addColorStop(0.7, '#07080a');
      g.addColorStop(1, '#14161a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = rng(stage * 13);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.45})`;
      ctx.fillRect(r() * w, r() * h * 0.6, r() < 0.1 ? 1.2 : 0.6, r() < 0.1 ? 1.2 : 0.6);
    }
  });
  // The moon is a separate image so it stays round when the sky is stretched.
  canvasTexture(scene, `moon${stage}`, 220, 220, (ctx) => {
    const cx = 110, cy = 110;
    const halo = ctx.createRadialGradient(cx, cy, 30, cx, cy, 110);
    halo.addColorStop(0, stage === 2 ? 'rgba(95,232,255,0.18)' : 'rgba(255,255,255,0.22)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 220, 220);
    if (stage === 3) {
      // Black sun with a white corona.
      ctx.save();
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 24;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 52, 0, TAU);
      ctx.stroke();
      ctx.restore();
      disc(ctx, cx, cy, 51, '#000000');
    } else {
      const m = ctx.createRadialGradient(cx - 12, cy - 12, 5, cx, cy, 52);
      m.addColorStop(0, '#f4f6f9');
      m.addColorStop(1, stage === 2 ? '#8fa6ae' : '#aeb5be');
      ctx.fillStyle = m;
      ctx.beginPath();
      ctx.arc(cx, cy, 50, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,88,98,0.25)';
      [[-14, -8, 9], [12, 10, 12], [8, -18, 6], [-10, 18, 5]].forEach(([x, y, rr]) => {
        ctx.beginPath();
        ctx.arc(cx + x, cy + y, rr, 0, TAU);
        ctx.fill();
      });
    }
  });
}

function buildLayers(scene, stage) {
  const r = rng(stage * 31 + 7);
  if (stage === 1) {
    canvasTexture(scene, 'bg1a', BG_W, 300, (ctx, w, h) => {
      // Distant mountains.
      [['#15181e', 0.55, 120], ['#1c2027', 0.75, 70]].forEach(([c, base, amp], li) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = h * base - Math.abs(Math.sin((x / w) * TAU * (2 + li) + li)) * amp - Math.sin((x / w) * TAU * 7) * 10;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fill();
      });
    });
    canvasTexture(scene, 'bg1b', BG_W, 420, (ctx, w, h) => {
      ctx.fillStyle = '#0e1014';
      // Cedar silhouettes.
      for (let i = 0; i < 22; i++) {
        const x = r() * w, th = 120 + r() * 160, tw = 30 + r() * 30;
        wrap(ctx, (o) => {
          ctx.beginPath();
          ctx.moveTo(x + o - tw / 2, h);
          ctx.lineTo(x + o, h - th);
          ctx.lineTo(x + o + tw / 2, h);
          ctx.fill();
        });
      }
      // Pagoda.
      wrap(ctx, (o) => {
        const px = 640 + o;
        for (let t = 0; t < 4; t++) {
          const y = h - 80 - t * 46, ww = 120 - t * 18;
          ctx.fillRect(px - ww / 4, y, ww / 2, 46);
          ctx.beginPath();
          ctx.moveTo(px - ww / 2 - 10, y + 4);
          ctx.quadraticCurveTo(px, y - 18, px + ww / 2 + 10, y + 4);
          ctx.lineTo(px + ww / 2 - 6, y + 10);
          ctx.lineTo(px - ww / 2 + 6, y + 10);
          ctx.fill();
        }
        ctx.fillRect(px - 2, h - 80 - 4 * 46 - 30, 4, 34);
        ctx.fillRect(px - 50, h - 80, 100, 80);
      });
      // Torii.
      wrap(ctx, (o) => torii(ctx, 200 + o, h - 170, 150, 170, '#121418', null));
      // Spirit-lit windows.
      ctx.fillStyle = 'rgba(200,230,240,0.25)';
      wrap(ctx, (o) => ctx.fillRect(636 + o, h - 60, 8, 12));
    });
    canvasTexture(scene, 'bg1c', BG_W, 200, (ctx, w, h) => {
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = 60 + r() * 120, rw = 160 + r() * 200;
        wrap(ctx, (o) => {
          fogPuff(ctx, x + o, y, rw, 'rgba(200,210,220,0.12)', 'rgba(200,210,220,0)');
        });
      }
    });
  } else if (stage === 2) {
    canvasTexture(scene, 'bg2a', BG_W, 360, (ctx, w, h) => {
      let x = 0;
      while (x < w) {
        const bw = 40 + r() * 70, bh = 120 + r() * 220;
        ctx.fillStyle = '#0f1217';
        ctx.fillRect(x, h - bh, bw, bh);
        for (let wy = h - bh + 8; wy < h - 6; wy += 9) {
          for (let wx = x + 5; wx < x + bw - 5; wx += 7) {
            if (r() < 0.22) {
              ctx.fillStyle = r() < 0.2 ? 'rgba(95,232,255,0.55)' : 'rgba(220,228,236,0.35)';
              ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
        if (r() < 0.4) {
          ctx.fillStyle = '#0f1217';
          ctx.fillRect(x + bw / 2 - 1, h - bh - 30, 2, 30);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + bw / 2 - 1.5, h - bh - 31, 3, 3);
        }
        x += bw + r() * 6;
      }
    });
    const kanji = ['龍', '酒場', '電脳', '拉麺', '夜市', '薬', '影', '霊', '雨', '刀'];
    canvasTexture(scene, 'bg2b', BG_W, 470, (ctx, w, h) => {
      let x = 10;
      let k = 0;
      while (x < w - 60) {
        const bw = 90 + r() * 80, bh = 200 + r() * 190;
        ctx.fillStyle = '#0a0c10';
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.strokeStyle = '#1d2128';
        ctx.lineWidth = 1;
        for (let fy = h - bh + 30; fy < h; fy += 34) line(ctx, [{ x, y: fy }, { x: x + bw, y: fy }], 1, '#1a1e25');
        // AC units, pipes.
        ctx.fillStyle = '#15181e';
        ctx.fillRect(x + 8, h - bh + 50, 18, 12);
        // Neon sign.
        const text = kanji[k++ % kanji.length];
        neonSign(ctx, x + bw - 40, h - bh + 20 + r() * 40, text, k % 2 === 0);
        // Horizontal shop sign.
        if (r() < 0.6) {
          ctx.save();
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 6;
          ctx.strokeStyle = 'rgba(230,236,242,0.8)';
          ctx.strokeRect(x + 10, h - 70, bw - 30, 18);
          ctx.restore();
        }
        x += bw + 30 + r() * 30;
      }
      // Hanging lantern strings.
      for (let s = 0; s < 4; s++) {
        const sx = s * 256 + 40, ex = sx + 200, y = 60 + r() * 60;
        ctx.strokeStyle = '#2a2f38';
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.quadraticCurveTo((sx + ex) / 2, y + 40, ex, y);
        ctx.stroke();
        for (let i = 1; i < 6; i++) {
          const t = i / 6, lx = sx + (ex - sx) * t, ly = y + 40 * 2 * t * (1 - t) + 6;
          ctx.save();
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 8;
          ctx.fillStyle = i % 2 ? '#d7dde4' : '#5fe8ff';
          ctx.beginPath();
          ctx.ellipse(lx, ly, 4, 6, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    });
    canvasTexture(scene, 'bg2c', BG_W, 160, (ctx, w, h) => {
      // Overhead power lines in the foreground.
      ctx.strokeStyle = '#050608';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 20 + i * 14);
        ctx.quadraticCurveTo(w / 2, 90 + i * 14, w, 20 + i * 14);
        ctx.stroke();
      }
    });
  } else {
    canvasTexture(scene, 'bg3a', BG_W, 360, (ctx, w, h) => {
      // Floating islands carrying broken torii.
      for (let i = 0; i < 6; i++) {
        const x = 60 + i * 170 + r() * 40, y = 60 + r() * 180, iw = 60 + r() * 60;
        wrap(ctx, (o) => {
          ctx.fillStyle = '#0d0f12';
          ctx.beginPath();
          ctx.moveTo(x + o - iw / 2, y);
          ctx.lineTo(x + o + iw / 2, y);
          ctx.lineTo(x + o + iw * 0.2, y + iw * 0.7);
          ctx.lineTo(x + o - iw * 0.1, y + iw * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + o - iw / 2, y);
          ctx.lineTo(x + o + iw / 2, y);
          ctx.stroke();
          if (i % 2 === 0) torii(ctx, x + o - 25, y - 50, 50, 50, '#16191e', null);
        });
      }
    });
    canvasTexture(scene, 'bg3b', BG_W, 480, (ctx, w, h) => {
      // Hanging chains and cracked pillars.
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 150 + r() * 30;
        wrap(ctx, (o) => {
          const len = 120 + r() * 200;
          for (let y = 0; y < len; y += 10) {
            ctx.strokeStyle = '#2a2f38';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x + o, y, 3, 5, 0, 0, TAU);
            ctx.stroke();
          }
        });
      }
      for (let i = 0; i < 4; i++) {
        const x = 120 + i * 260, ph = 160 + r() * 140;
        wrap(ctx, (o) => {
          ctx.fillStyle = '#0b0c0f';
          ctx.fillRect(x + o, h - ph, 46, ph);
          ctx.save();
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 6;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + o + 10, h - ph);
          ctx.lineTo(x + o + 22, h - ph + 40);
          ctx.lineTo(x + o + 14, h - ph + 80);
          ctx.lineTo(x + o + 30, h - ph + 130);
          ctx.stroke();
          ctx.restore();
          // Broken top.
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.moveTo(x + o - 1, h - ph);
          ctx.lineTo(x + o + 15, h - ph + 12);
          ctx.lineTo(x + o + 30, h - ph + 2);
          ctx.lineTo(x + o + 47, h - ph + 14);
          ctx.lineTo(x + o + 47, h - ph - 2);
          ctx.lineTo(x + o - 1, h - ph - 2);
          ctx.fill();
        });
      }
    });
    canvasTexture(scene, 'bg3c', BG_W, 200, (ctx, w, h) => {
      for (let i = 0; i < 12; i++) {
        const x = r() * w, y = 60 + r() * 120, rw = 200 + r() * 220;
        wrap(ctx, (o) => {
          fogPuff(ctx, x + o, y, rw, 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0)');
        });
      }
    });
  }
}

// Builds (and caches) the textures for one stage; frees the other stages' backgrounds.
export function ensureStageArt(scene, stage) {
  [1, 2, 3].forEach((s) => {
    if (s === stage) return;
    ['a', 'b', 'c'].forEach((l) => scene.textures.exists(`bg${s}${l}`) && scene.textures.remove(`bg${s}${l}`));
  });
  if (!scene.textures.exists(`bg${stage}a`)) buildLayers(scene, stage);
  if (!scene.textures.exists(`sky${stage}`)) buildSky(scene, stage);
}

// ---------------------------------------------------------------------------
// Boot-time generation of all shared sprites.
// ---------------------------------------------------------------------------
export function generateArt(scene) {
  // Player: 96x96 frames, feet at y=84.
  const pf = [];
  Object.entries(PLAYER_POSES).forEach(([name, pose]) => pf.push({ name, draw: (c, ox) => humanoid(c, ox + 48, 84, pose, { topknot: true }) }));
  for (let i = 0; i < 6; i++) pf.push({ name: `run${i}`, draw: (c, ox) => humanoid(c, ox + 48, 84, runPose(i), { topknot: true }) });
  sheet(scene, 'ninja', 96, 96, pf);

  // Ashigaru shade: spear-wielding spirit soldier.
  const shadeStyle = {
    rim: '#6b7380', body: '#0b0d10', back: '#07080a', weapon: 'yari', weaponLen: 26,
    weaponColor: PAL.light, scarf: null, hat: true, eyes: '#ffffff', eyeGlow: 8
  };
  const sw = (i) => {
    const t = (i / 4) * TAU;
    return { lean: 0.15, fl: [0.5 * Math.sin(t), 0.5 * Math.sin(t) - 0.3], bl: [-0.5 * Math.sin(t), -0.5 * Math.sin(t) - 0.3], fa: [1.0, 1.5], ba: [0.6, 1.2], sword: 1.75 };
  };
  sheet(scene, 'shade', 96, 96, [
    ...[0, 1, 2, 3].map((i) => ({ name: `walk${i}`, draw: (c, ox) => humanoid(c, ox + 48, 84, sw(i), shadeStyle) })),
    { name: 'windup', draw: (c, ox) => humanoid(c, ox + 48, 84, { lean: -0.2, crouch: 2, fl: [0.4, 0], bl: [-0.5, -0.1], fa: [-0.3, 0.6], ba: [0.3, 1.0], sword: 1.6 }, { ...shadeStyle, eyes: '#ffffff', eyeGlow: 14 }) },
    { name: 'attack', draw: (c, ox) => humanoid(c, ox + 48, 84, { lean: 0.6, crouch: 3, fl: [0.9, 0.3], bl: [-0.8, -0.4], fa: [1.6, 1.6], ba: [1.4, 1.6], sword: 1.6 }, { ...shadeStyle, weaponLen: 34 }) },
    { name: 'stun', draw: (c, ox) => humanoid(c, ox + 48, 84, PLAYER_POSES.hurt, shadeStyle) }
  ]);

  // Oni brute.
  const oniStyle = {
    scale: 1.55, rim: '#7a8290', body: '#101216', back: '#08090b', limb: 6.5, torso: 13, headR: 7,
    bulk: true, horns: true, weapon: 'kanabo', weaponLen: 30, scarf: null, eyes: '#ffffff', eyeGlow: 10
  };
  sheet(scene, 'oni', 144, 144, [
    { name: 'idle', draw: (c, ox) => humanoid(c, ox + 72, 132, { lean: 0.1, fl: [0.3, 0], bl: [-0.3, 0], fa: [0.6, 1.2], ba: [0.3, 0.6], sword: 1.3 }, oniStyle) },
    { name: 'walk', draw: (c, ox) => humanoid(c, ox + 72, 132, { lean: 0.15, bob: -1, fl: [0.5, 0.1], bl: [-0.45, -0.3], fa: [0.7, 1.3], ba: [0.2, 0.5], sword: 1.4 }, oniStyle) },
    { name: 'windup', draw: (c, ox) => humanoid(c, ox + 72, 132, { lean: -0.25, crouch: 2, fl: [0.4, 0], bl: [-0.4, 0.1], fa: [2.9, 3.4], ba: [2.6, 3.1], sword: 3.6 }, { ...oniStyle, eyeGlow: 16 }) },
    { name: 'slam', draw: (c, ox) => humanoid(c, ox + 72, 132, { lean: 0.5, crouch: 5, fl: [0.8, 0.2], bl: [-0.7, -0.3], fa: [1.2, 0.9], ba: [1.1, 0.9], sword: 0.7 }, oniStyle) },
    { name: 'stun', draw: (c, ox) => humanoid(c, ox + 72, 132, PLAYER_POSES.hurt, oniStyle) }
  ]);

  // Iron Ronin boss.
  const roninStyle = {
    scale: 1.9, rim: '#8d96a3', body: '#1a1d23', back: '#0c0e11', limb: 5.5, torso: 11, headR: 6,
    armor: true, kabuto: true, crestColor: '#dfe5ec', cape: true, capeColor: '#0a0b0e', bulk: true,
    weapon: 'katana', weaponLen: 34, weaponColor: '#dfe5ec', weaponCore: '#ffffff', glow: 6, scarf: null, eyes: '#ffffff', eyeGlow: 10
  };
  sheet(scene, 'ronin', 176, 176, [
    { name: 'idle', draw: (c, ox) => humanoid(c, ox + 88, 164, { lean: 0.1, fl: [0.35, 0], bl: [-0.35, 0.05], fa: [0.9, 1.7], ba: [0.6, 1.6], sword: 2.3 }, roninStyle) },
    { name: 'walk', draw: (c, ox) => humanoid(c, ox + 88, 164, { lean: 0.18, bob: -1, fl: [0.55, 0.1], bl: [-0.5, -0.3], fa: [0.95, 1.75], ba: [0.65, 1.6], sword: 2.35, scarf: 1 }, roninStyle) },
    { name: 'guard', draw: (c, ox) => humanoid(c, ox + 88, 164, { lean: -0.05, crouch: 2, fl: [0.45, 0], bl: [-0.45, 0.1], fa: [1.3, 2.7], ba: [1.1, 2.4], sword: 3.1 }, roninStyle) },
    { name: 'windup', draw: (c, ox) => humanoid(c, ox + 88, 164, { lean: 0.35, crouch: 6, fl: [0.9, 0.3], bl: [-0.8, -0.5], fa: [-0.2, 0.3], ba: [-0.1, 0.6], sword: -0.6 }, { ...roninStyle, eyeGlow: 18 }) },
    { name: 'slash', draw: (c, ox) => humanoid(c, ox + 88, 164, { lean: 0.6, crouch: 4, fl: [1.0, 0.3], bl: [-1.0, -0.6], fa: [1.7, 1.8], ba: [1.4, 1.6], sword: 1.85, scarf: 3 }, roninStyle) },
    { name: 'stun', draw: (c, ox) => humanoid(c, ox + 88, 164, PLAYER_POSES.hurt, roninStyle) }
  ]);

  // Shogun of the Void, final boss.
  const shogunStyle = {
    scale: 2.7, rim: '#ffffff', body: '#020203', back: '#000000', limb: 5.5, torso: 11, headR: 6.5,
    armor: true, kabuto: true, crestColor: '#ffffff', crown: true, cape: true, capeColor: '#000000', bulk: true,
    weapon: 'nodachi', weaponLen: 42, weaponColor: '#ffffff', weaponCore: '#000000', glow: 14, scarf: null,
    eyes: '#ffffff', eyeGlow: 14, sash: '#ffffff'
  };
  sheet(scene, 'shogun', 240, 240, [
    { name: 'idle', draw: (c, ox) => humanoid(c, ox + 120, 226, { lean: 0.06, fl: [0.3, 0], bl: [-0.3, 0.05], fa: [0.8, 1.6], ba: [0.5, 1.2], sword: 2.0 }, shogunStyle) },
    { name: 'cast', draw: (c, ox) => humanoid(c, ox + 120, 226, { lean: -0.1, fl: [0.35, 0], bl: [-0.35, 0.05], fa: [2.4, 2.9], ba: [2.2, 2.7], sword: 3.0, scarf: 2 }, shogunStyle) },
    { name: 'windup', draw: (c, ox) => humanoid(c, ox + 120, 226, { lean: -0.25, crouch: 3, fl: [0.5, 0.1], bl: [-0.5, -0.1], fa: [-0.9, -0.3], ba: [-0.5, 0.3], sword: -1.2 }, shogunStyle) },
    { name: 'slash', draw: (c, ox) => humanoid(c, ox + 120, 226, { lean: 0.5, crouch: 4, fl: [0.9, 0.3], bl: [-0.9, -0.5], fa: [1.6, 1.6], ba: [1.3, 1.5], sword: 1.5, scarf: 3 }, shogunStyle) },
    { name: 'stun', draw: (c, ox) => humanoid(c, ox + 120, 226, PLAYER_POSES.hurt, shogunStyle) }
  ]);

  // Hollow Kitsune boss.
  sheet(scene, 'kitsune', 176, 128, [
    { name: 'idle', draw: (c, ox) => kitsune(c, ox + 88, 112, { tails: 0 }) },
    { name: 'run0', draw: (c, ox) => kitsune(c, ox + 88, 112, { legs: 0, tails: 0.5 }) },
    { name: 'run1', draw: (c, ox) => kitsune(c, ox + 88, 112, { legs: Math.PI, tails: -0.3 }) },
    { name: 'crouch', draw: (c, ox) => kitsune(c, ox + 88, 112, { crouch: 8, tails: 1.2, head: 4 }) },
    { name: 'lunge', draw: (c, ox) => kitsune(c, ox + 88, 112, { stretch: 14, legs: 1.2, tails: -1, head: 2 }) },
    { name: 'cast', draw: (c, ox) => kitsune(c, ox + 88, 112, { head: -6, tails: 2 }) },
    { name: 'stun', draw: (c, ox) => kitsune(c, ox + 88, 112, { crouch: 10, head: 8, tails: -1.5 }) }
  ]);

  sheet(scene, 'wisp', 40, 44, [
    { name: 'w0', draw: (c, ox) => wisp(c, ox + 20, 24, 0) },
    { name: 'w1', draw: (c, ox) => wisp(c, ox + 20, 24, 2) }
  ]);
  sheet(scene, 'drone', 48, 40, [
    { name: 'd0', draw: (c, ox) => drone(c, ox + 24, 22, 0, false) },
    { name: 'd1', draw: (c, ox) => drone(c, ox + 24, 22, 2, false) },
    { name: 'charge', draw: (c, ox) => drone(c, ox + 24, 22, 1, true) }
  ]);

  // Projectiles.
  canvasTexture(scene, 'bolt', 20, 20, (ctx) => {
    const g = ctx.createRadialGradient(10, 10, 1, 10, 10, 10);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, 'rgba(230,236,242,0.9)');
    g.addColorStop(1, 'rgba(230,236,242,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 20, 20);
  });
  canvasTexture(scene, 'foxfire', 28, 28, (ctx) => {
    const g = ctx.createRadialGradient(14, 17, 1, 14, 16, 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, 'rgba(180,240,255,0.9)');
    g.addColorStop(1, 'rgba(95,232,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(4, 18);
    ctx.quadraticCurveTo(6, 6, 14, 1);
    ctx.quadraticCurveTo(22, 6, 24, 18);
    ctx.arc(14, 18, 10, 0, Math.PI);
    ctx.fill();
  });
  canvasTexture(scene, 'voidorb', 32, 32, (ctx) => {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(16, 16, 10, 0, TAU);
    ctx.stroke();
    ctx.restore();
    disc(ctx, 16, 16, 9, '#000000');
  });
  canvasTexture(scene, 'wave', 44, 30, (ctx) => {
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.9 - i * 0.25})`;
      ctx.lineWidth = 3 - i * 0.6;
      ctx.beginPath();
      ctx.moveTo(4 + i * 6, 30);
      ctx.quadraticCurveTo(22, -4 + i * 8, 40 - i * 6, 30);
      ctx.stroke();
    }
    ctx.restore();
  });
  canvasTexture(scene, 'pillar', 56, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 56, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.65, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 56, 256);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 0, 6, 256);
  });

  // Effects.
  canvasTexture(scene, 'slash', 128, 96, (ctx) => {
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(95,232,255,0)');
    g.addColorStop(0.55, 'rgba(95,232,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(20, 48, 96, -0.75, 0.75);
    ctx.arc(2, 48, 92, 0.72, -0.72, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  canvasTexture(scene, 'ring', 96, 96, (ctx) => {
    ctx.save();
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(48, 48, 38, 0, TAU);
    ctx.stroke();
    ctx.restore();
  });
  canvasTexture(scene, 'dot', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
  canvasTexture(scene, 'shard', 6, 6, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 6, 6);
  });
  canvasTexture(scene, 'raindrop', 2, 18, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 18);
    g.addColorStop(0, 'rgba(200,230,240,0)');
    g.addColorStop(1, 'rgba(200,230,240,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 18);
  });
  canvasTexture(scene, 'glow', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTexture(scene, 'vignette', 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 182);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });

  // Props.
  sheet(scene, 'shrine', 64, 84, [
    { name: 'off', draw: (c, ox) => hokora(c, ox, false) },
    { name: 'on', draw: (c, ox) => hokora(c, ox, true) }
  ]);
  canvasTexture(scene, 'stele', 40, 60, (ctx) => {
    ctx.fillStyle = '#1d2026';
    ctx.strokeStyle = PAL.rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, 60);
    ctx.lineTo(6, 10);
    ctx.quadraticCurveTo(20, 0, 34, 10);
    ctx.lineTo(34, 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9d0d9';
    ctx.font = `900 13px ${FONT_JP}`;
    ctx.textAlign = 'center';
    ['記', '憶'].forEach((k, i) => ctx.fillText(k, 20, 28 + i * 15));
  });
  canvasTexture(scene, 'gate', 28, 220, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 28, 0);
    g.addColorStop(0, 'rgba(95,232,255,0)');
    g.addColorStop(0.5, 'rgba(95,232,255,0.55)');
    g.addColorStop(1, 'rgba(95,232,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 28, 220);
    // Ofuda talismans.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#eef2f6';
      ctx.fillRect(8, 20 + i * 52, 12, 30);
      ctx.fillStyle = '#0a0b0e';
      ctx.font = `900 10px ${FONT_JP}`;
      ctx.textAlign = 'center';
      ctx.fillText('封', 14, 40 + i * 52);
    }
  });
  canvasTexture(scene, 'toro', 34, 70, (ctx) => {
    ctx.fillStyle = '#23272e';
    ctx.strokeStyle = '#6b7380';
    ctx.lineWidth = 1;
    ctx.fillRect(13, 40, 8, 26);
    ctx.fillRect(7, 64, 20, 6);
    ctx.fillRect(9, 22, 16, 16);
    ctx.strokeRect(9, 22, 16, 16);
    ctx.beginPath();
    ctx.moveTo(2, 24);
    ctx.lineTo(17, 10);
    ctx.lineTo(32, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(230,240,245,0.85)';
    ctx.fillRect(13, 26, 8, 8);
    ctx.restore();
  });
  canvasTexture(scene, 'toriiFg', 220, 230, (ctx) => torii(ctx, 0, 0, 220, 230, '#0c0e11', '#3b414b'));
  ['夜', '鬼', '電', '魂'].forEach((k, i) => {
    canvasTexture(scene, `sign${i}`, 44, 120, (ctx) => {
      line(ctx, [{ x: 22, y: 0 }, { x: 22, y: 12 }], 2, '#2a2f38');
      neonSign(ctx, 7, 10, k + (i % 2 ? '酒' : '市'), i % 2 === 0);
    });
  });
  canvasTexture(scene, 'brokenPillar', 52, 170, (ctx) => {
    ctx.fillStyle = '#0b0c0f';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(4, 170);
    ctx.lineTo(4, 20);
    ctx.lineTo(18, 30);
    ctx.lineTo(30, 6);
    ctx.lineTo(48, 24);
    ctx.lineTo(48, 170);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  for (let s = 1; s <= 3; s++) {
    canvasTexture(scene, `tiles${s}`, 96, 32, (ctx) => drawTiles(ctx, s));
    canvasTexture(scene, `spike${s}`, 32, 32, (ctx) => drawSpikes(ctx, s));
  }
}

export function createAnimations(scene) {
  const A = scene.anims;
  const mk = (key, tex, frames, frameRate, repeat = -1) => {
    if (A.exists(key)) return;
    A.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate, repeat });
  };
  mk('p-idle', 'ninja', ['idle0', 'idle1'], 3);
  mk('p-run', 'ninja', ['run0', 'run1', 'run2', 'run3', 'run4', 'run5'], 14);
  mk('shade-walk', 'shade', ['walk0', 'walk1', 'walk2', 'walk3'], 7);
  mk('oni-walk', 'oni', ['idle', 'walk'], 3);
  mk('ronin-walk', 'ronin', ['idle', 'walk'], 4);
  mk('kitsune-run', 'kitsune', ['run0', 'run1'], 10);
  mk('wisp-float', 'wisp', ['w0', 'w1'], 5);
  mk('drone-hover', 'drone', ['d0', 'd1'], 12);
  mk('shrine-idle', 'shrine', ['off'], 1, 0);
}
