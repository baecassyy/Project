// Multitouch control tests. Touches are sent as raw CDP touch events (the same
// path a phone uses), and every game frame is recorded inside the page so the
// checks are independent of how fast this headless browser renders.
const { chromium } = require('playwright');
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

(async () => {
  const vw = +(process.argv[2] || 844), vh = +(process.argv[3] || 390);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto((process.env.BASE || 'http://localhost:5173/') + '?stage=1');
  await page.waitForFunction(() => window.__requiem && window.__requiem.scene.isActive('UI'), null, { timeout: 15000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const g = window.__requiem;
    g.loop.inFocus = true; // headless pages never get focus; Phaser clamps time when unfocused
    g.loop._coolDown = 0;
    const game = g.scene.getScene('Game');
    game.enemies.forEach((e) => e.destroy());
    game.enemies.length = 0;
    // This sandbox renders at ~5 fps in software, and touch events arrive a few
    // frames late. Running the game in its own slow-motion keeps jump arcs and
    // combo windows long enough in real time; the game logic is unchanged.
    game.setTimeScale(0.3);
    window.__hist = [];
    game.events.on('postupdate', () => {
      const p = game.player, ui = g.scene.getScene('UI');
      window.__hist.push({
        f: g.loop.frame, x: p.x, vx: p.body.velocity.x, vy: p.body.velocity.y, ground: p.onGround,
        airJumps: p.airJumps, attack: p.attack ? p.attack.frame : null, swing: p.swingId,
        parry: p.parryT > 0, block: p.blocking, dash: p.dashTime > 0, hp: p.hp,
        owners: ui.touch.owner.size, held: [...window.__controls.held.touch], axis: window.__controls.x
      });
    });
  });

  const L = await page.evaluate(() => {
    const g = window.__requiem, ui = g.scene.getScene('UI');
    const r = g.canvas.getBoundingClientRect(), k = r.width / g.scale.width;
    const css = (x, y) => ({ x: r.left + x * k, y: r.top + y * k });
    const btn = {};
    ui.touch.buttons.forEach((bb) => { btn[bb.action] = { ...css(bb.x, bb.y), r: bb.rr * k }; });
    return { btn, stick: css(ui.touch.stick.rest.x, ui.touch.stick.rest.y) };
  });
  const cdp = await ctx.newCDPSession(page);
  const active = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: [...active.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 10, radiusY: 10, force: 1 }))
  });
  const down = async (id, p) => { active.set(id, { ...p }); await send('touchStart'); };
  const move = async (id, p) => { active.set(id, { ...p }); await send('touchMove'); };
  // CDP's touchEnd takes the points being lifted (verified separately), so each
  // finger can be released on its own while the others stay down.
  const up = async (id) => {
    const p = active.get(id);
    active.delete(id);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] });
  };
  const frames = (n) => page.evaluate((n) => new Promise((res) => {
    const g = window.__requiem.scene.getScene('Game');
    let c = 0;
    const h = () => { if (++c >= n) { g.events.off('postupdate', h); res(); } };
    g.events.on('postupdate', h);
  }), n);
  const mark = () => page.evaluate(() => window.__hist.length);
  const since = (m) => page.evaluate((m) => window.__hist.slice(m), m);
  const last = () => page.evaluate(() => window.__hist[window.__hist.length - 1]);
  const resetPlayer = () => page.evaluate(() => {
    const p = window.__requiem.scene.getScene('Game').player;
    p.body.reset(160, 448);
    p.hp = p.maxHp; p.invuln = 0; p.hurtT = 0; p.dashCd = 0; p.attack = null; p.facing = 1;
  });
  const stickRight = async (id) => {
    await down(id, L.stick);
    await move(id, { x: L.stick.x + 35, y: L.stick.y });
    await move(id, { x: L.stick.x + 70, y: L.stick.y });
  };

  // 1. Joystick moves the player.
  await resetPlayer(); await frames(3);
  let m = await mark();
  await stickRight(1);
  await frames(8);
  let h = await since(m);
  check('Joystick moves the player right', h.at(-1).vx > 200 && h.at(-1).x > h[0].x + 20, `vx=${h.at(-1).vx.toFixed(0)}`);
  await move(1, { x: L.stick.x - 70, y: L.stick.y });
  await frames(14);
  check('Joystick moves the player left', (await last()).vx < -200);
  await up(1); await frames(12);
  check('Releasing the joystick stops the player', Math.abs((await last()).vx) < 10 && (await last()).axis === 0);

  // 2. Jump while moving, then double jump in the air (two fingers).
  await resetPlayer(); await frames(3);
  await stickRight(1); await frames(4);
  m = await mark();
  await down(2, L.btn.jump);
  await frames(3);
  h = await since(m);
  check('Jump while moving (stick + JUMP)', h.some((s) => s.vy < -400 && s.vx > 150 && s.held.includes('jump')), `minVy=${Math.min(...h.map((s) => s.vy)).toFixed(0)}`);
  await up(2);
  await page.waitForFunction(() => { const p = window.__requiem.scene.getScene('Game').player; return !p.onGround && p.body.velocity.y > -350; }, null, { timeout: 5000, polling: 'raf' });
  m = await mark();
  await down(2, L.btn.jump);
  await frames(3);
  h = await since(m);
  check('Double jump in mid-air while moving', h.some((s) => s.airJumps === 0 && s.vy < -300 && s.vx > 150), `airJumps=${h.at(-1).airJumps}`);
  await up(2);
  await page.waitForFunction(() => window.__requiem.scene.getScene('Game').player.onGround, null, { timeout: 5000 });
  await up(1);

  // 3. Attack while moving + three-hit combo.
  await resetPlayer(); await frames(3);
  await stickRight(1); await frames(4);
  m = await mark();
  await down(3, L.btn.attack);
  await frames(2);
  h = await since(m);
  check('Attack while moving (stick + ATTACK)', h.some((s) => s.attack === 'atk1' && s.vx > 50), `vx during slash=${(h.find((s) => s.attack) || {}).vx}`);
  await up(3);
  // Tap again during each swing, in rhythm with the combo.
  for (const cur of ['atk1', 'atk2']) {
    await page.waitForFunction((c) => { const a = window.__requiem.scene.getScene('Game').player.attack; return a && a.frame === c; }, cur, { timeout: 8000, polling: 'raf' }).catch(() => {});
    await down(3, L.btn.attack); await frames(1); await up(3);
  }
  await frames(10);
  h = await since(m);
  const swings = new Set(h.map((s) => s.attack).filter(Boolean));
  check('Three-hit combo (atk1 → atk2 → atk3)', swings.has('atk1') && swings.has('atk2') && swings.has('atk3'), [...swings].join(' → '));
  await up(1);

  // 4. Three fingers at once: move + jump + attack.
  await resetPlayer(); await frames(3);
  await stickRight(1); await frames(3);
  m = await mark();
  await down(2, L.btn.jump);
  await down(3, L.btn.attack);
  await frames(3);
  h = await since(m);
  check('Three simultaneous touches (move + jump + attack)',
    h.some((s) => s.owners === 3) && h.some((s) => s.vy < -300) && h.some((s) => s.attack) && h.every((s) => s.axis > 0.5),
    `owners=${Math.max(...h.map((s) => s.owners))}`);
  await up(2); await up(3);
  await page.waitForFunction(() => window.__requiem.scene.getScene('Game').player.onGround, null, { timeout: 5000 });

  // 5. Dash while moving, and air dash.
  m = await mark();
  await down(4, L.btn.dash); await frames(2); await up(4);
  h = await since(m);
  check('Dash while moving', h.some((s) => s.dash && s.vx > 500));
  await frames(12);
  await resetPlayer(); await frames(3);
  await down(2, L.btn.jump); await up(2);
  await page.waitForFunction(() => !window.__requiem.scene.getScene('Game').player.onGround, null, { timeout: 10000, polling: 'raf' });
  m = await mark();
  await down(4, L.btn.dash); await frames(2); await up(4);
  h = await since(m);
  check('Air dash', h.some((s) => s.dash && !s.ground && s.vx > 500));
  await up(1);
  await frames(10);

  // 6. All fingers lifted → nothing stays pressed.
  h = [await last()];
  check('Lifting every finger releases all controls', h[0].owners === 0 && h[0].held.length === 0 && h[0].axis === 0);

  // 7. Sliding a thumb from ATTACK onto JUMP switches buttons.
  await down(5, L.btn.attack);
  await move(5, { x: (L.btn.attack.x + L.btn.jump.x) / 2, y: (L.btn.attack.y + L.btn.jump.y) / 2 });
  await move(5, L.btn.jump);
  await frames(2);
  const sl = await last();
  check('Thumb slide from ATTACK onto JUMP', sl.held.includes('jump') && !sl.held.includes('attack'), sl.held.join(','));
  await up(5);
  await frames(15);

  // 8. Hold PARRY → block stance; release → stance ends.
  await resetPlayer(); await frames(3);
  await down(6, L.btn.parry);
  await page.waitForFunction(() => window.__requiem.scene.getScene('Game').player.blocking, null, { timeout: 8000, polling: 'raf' }).catch(() => {});
  check('Holding PARRY turns into a block stance', (await last()).block);
  await up(6); await frames(3);
  check('Releasing PARRY ends the block', !(await last()).block);
  await frames(10);

  // 9. Parry during combat while holding the joystick: spawn a spear shade next to the player.
  await resetPlayer(); await frames(3);
  await page.evaluate(() => {
    const g = window.__requiem.scene.getScene('Game');
    const p = g.player;
    const shade = g.spawnEnemy('shade', p.x + 72, p.y);
    shade.faceTo(p.x);
    window.__shade = shade;
    window.__parries = 0;
    g.game.events.on('hud-parry', () => window.__parries++);
  });
  await page.waitForFunction(() => window.__shade.state === 'windup' && window.__shade.stateT > 0.25, null, { timeout: 8000, polling: 'raf' });
  await down(6, L.btn.parry);
  await frames(10);
  await up(6);
  const pr = await page.evaluate(() => ({ parries: window.__parries, hp: window.__requiem.scene.getScene('Game').player.hp, state: window.__shade.state, alive: window.__shade.alive, shp: window.__shade.hp }));
  check('Parry deflects the spear lunge (no damage taken)', pr.parries === 1 && pr.hp === 8, `parries=${pr.parries} hp=${pr.hp}`);
  check('Parry staggers the enemy and the counter-slash lands', !pr.alive || pr.state === 'stun' || pr.shp < 3, `state=${pr.state} enemyHp=${pr.shp}`);

  // 10. Without parrying, the same lunge does hurt (proves the parry did the work).
  await resetPlayer(); await frames(3);
  await page.evaluate(() => {
    const g = window.__requiem.scene.getScene('Game');
    const p = g.player;
    const shade = g.spawnEnemy('shade', p.x + 72, p.y);
    shade.faceTo(p.x);
    window.__shade2 = shade;
  });
  await page.waitForFunction(() => window.__shade2.state === 'attack', null, { timeout: 8000, polling: 'raf' });
  await frames(6);
  check('Control case: an unparried lunge deals damage', (await last()).hp < 8, `hp=${(await last()).hp}`);

  if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed  (viewport ${vw}x${vh})`);
  await b.close();
  process.exit(failed || errs.length ? 1 : 0);
})();
