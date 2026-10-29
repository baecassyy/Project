// End-to-end flow checks: shrines & saving, continue, death/respawn, pause and
// settings by touch, desktop keyboard, rotation handling and auto quality.
const { chromium } = require('playwright');
const results = [];
const check = (name, ok, info = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  const cdp = await ctx.newCDPSession(page);
  const tap = async (x, y, hold = 120) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 9 }] });
    await page.waitForTimeout(hold);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y, id: 9 }] });
  };
  const css = (scene, x, y) => page.evaluate(([x, y]) => {
    const g = window.__requiem, r = g.canvas.getBoundingClientRect(), k = r.width / g.scale.width;
    return { x: r.left + x * k, y: r.top + y * k };
  }, [x, y]);
  const game = (fn, arg) => page.evaluate(fn, arg);
  const ready = () => page.waitForFunction(() => {
    const g = window.__requiem;
    return g && g.scene.isActive('Game') && g.scene.isActive('UI') && g.scene.getScene('Game').player;
  }, null, { timeout: 20000 });
  const focus = () => game(() => { const l = window.__requiem.loop; l.inFocus = true; l._coolDown = 0; });

  // ---- Title screen by touch: tap to begin → New Game ----
  await page.goto((process.env.BASE || 'http://localhost:5173/') + '');
  await page.waitForFunction(() => window.__requiem && window.__requiem.scene.isActive('Menu'), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await tap(422, 200);
  await page.waitForTimeout(600);
  const newGame = await game(() => {
    const m = window.__requiem.scene.getScene('Menu');
    const btn = m.ui.list.find((o) => o.label && o.label.text === 'NEW GAME');
    return btn ? { x: btn.x, y: btn.y } : null;
  });
  check('Title: tap-to-begin reveals the menu', !!newGame);
  const ng = await css('Menu', newGame.x, newGame.y);
  await tap(ng.x, ng.y);
  await page.waitForFunction(() => window.__requiem.scene.isActive('StageCard'), null, { timeout: 8000 }).catch(() => {});
  check('Title: NEW GAME button starts the chapter card', await game(() => window.__requiem.scene.isActive('StageCard') || window.__requiem.scene.isActive('Game')));
  await ready();
  await focus();
  await game(() => { const g = window.__requiem.scene.getScene('Game'); g.enemies.forEach((e) => e.destroy()); g.enemies.length = 0; });

  // ---- Shrine: walk up, tap ACT, check heal + save ----
  await game(() => {
    const g = window.__requiem.scene.getScene('Game');
    const sh = g.interactables.find((i) => i.kind === 'shrine');
    g.player.body.reset(sh.x - 20, sh.y - 2);
    g.player.hp = 3;
  });
  await page.waitForFunction(() => window.__requiem.scene.getScene('Game').prompt, null, { timeout: 5000 }).catch(() => {});
  const prompt = await game(() => { const ui = window.__requiem.scene.getScene('UI'); return { text: ui.promptT.visible && ui.promptT.text, glow: ui.touch.highlightInteract }; });
  check('Shrine: prompt appears and ACT button glows', !!prompt.text && prompt.glow, prompt.text);
  const act = await game(() => { const b = window.__requiem.scene.getScene('UI').touch.buttons.find((x) => x.action === 'interact'); return { x: b.x, y: b.y }; });
  const actCss = await css('UI', act.x, act.y);
  await tap(actCss.x, actCss.y, 200);
  await page.waitForTimeout(800);
  const afterShrine = await game(() => ({ hp: window.__requiem.scene.getScene('Game').player.hp, cp: window.__requiem.scene.getScene('Game').checkpoint, save: JSON.parse(localStorage.getItem('requiem-shadows-of-neon:v1')).progress }));
  check('Shrine: ACT heals to full', afterShrine.hp === 8, `hp=${afterShrine.hp}`);
  check('Shrine: checkpoint saved to local storage', afterShrine.cp === 0 && afterShrine.save.checkpoint === 0 && afterShrine.save.stage === 1, JSON.stringify(afterShrine.save));

  // ---- Lore stone ----
  await game(() => {
    const g = window.__requiem.scene.getScene('Game');
    const st = g.interactables.find((i) => i.kind === 'lore');
    g.player.body.reset(st.x - 10, st.y - 2);
  });
  await page.waitForFunction(() => window.__requiem.scene.getScene('Game').prompt, null, { timeout: 5000 }).catch(() => {});
  await tap(actCss.x, actCss.y, 200);
  await page.waitForTimeout(700);
  check('Lore stone: ACT shows the inscription', await game(() => { const ui = window.__requiem.scene.getScene('UI'); return ui.toastC.visible && ui.toastT.text.length > 20; }));

  // ---- Death → respawn at the shrine ----
  await game(() => { const g = window.__requiem.scene.getScene('Game'); g.player.invuln = 0; g.player.takeHit(99, g.player.x + 10, {}); });
  await page.waitForFunction(() => { const g = window.__requiem.scene.getScene('Game'); return g.player && !g.player.dead && g.player.hp === 8; }, null, { timeout: 15000 }).catch(() => {});
  const resp = await game(() => { const g = window.__requiem.scene.getScene('Game'); const sh = g.stage.shrines[0]; return { dx: Math.abs(g.player.x - (sh.x + 1.5) * 32), hp: g.player.hp, cp: g.checkpoint }; });
  check('Death: respawn at the last shrine with full health', resp.dx < 4 && resp.hp === 8 && resp.cp === 0, JSON.stringify(resp));
  await focus();

  // ---- Continue after reload ----
  await page.reload();
  await page.waitForFunction(() => window.__requiem && window.__requiem.scene.isActive('Menu'), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  await tap(422, 200);
  await page.waitForTimeout(600);
  const cont = await game(() => { const m = window.__requiem.scene.getScene('Menu'); const b = m.ui.list.find((o) => o.label && o.label.text.startsWith('CONTINUE')); return b ? { x: b.x, y: b.y, t: b.label.text } : null; });
  check('Reload: CONTINUE is offered', !!cont, cont && cont.t);
  const cc = await css('Menu', cont.x, cont.y);
  await tap(cc.x, cc.y);
  await ready();
  const cstate = await game(() => { const g = window.__requiem.scene.getScene('Game'); return { stage: g.stageId, cp: g.checkpoint }; });
  check('Reload: CONTINUE resumes at the saved shrine', cstate.stage === 1 && cstate.cp === 0, JSON.stringify(cstate));
  await focus();

  // ---- Pause by touch, settings by touch ----
  const pb = await game(() => { const b = window.__requiem.scene.getScene('UI').pauseBtn; return { x: b.x, y: b.y }; });
  const pbc = await css('UI', pb.x, pb.y);
  await tap(pbc.x, pbc.y);
  await page.waitForTimeout(400);
  check('Pause button pauses the game', await game(() => window.__requiem.scene.isPaused('Game') && window.__requiem.scene.getScene('UI').paused));
  const pressedDuringPause = await game(() => window.__requiem.scene.getScene('UI').touch.owner.size);
  check('Pause tap does not trigger a control', pressedDuringPause === 0);
  await game(() => window.__requiem.scene.getScene('UI').openSettings());
  await page.waitForTimeout(400);
  // Drag the button-size slider handle to the far right with a finger.
  const slider = await game(() => {
    const ui = window.__requiem.scene.getScene('UI');
    const sl = ui.settings.panel.list.find((o) => o.labelT && o.labelT.text === 'TOUCH BUTTON SIZE');
    const m = sl.getWorldTransformMatrix();
    const k = (sl.value - sl.min) / (sl.max - sl.min);
    return { x: m.tx + sl.w * k * m.scaleX, y: m.ty + 10 * m.scaleY, x2: m.tx + sl.w * m.scaleX + 30 };
  });
  const s1 = await css('UI', slider.x, slider.y), s2 = await css('UI', slider.x2, slider.y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s1.x, y: s1.y, id: 3 }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: s1.x + ((s2.x - s1.x) * i) / 5, y: s1.y, id: 3 }] });
    await page.waitForTimeout(60);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: s2.x, y: s1.y, id: 3 }] });
  await page.waitForTimeout(300);
  const sz = await game(() => ({ v: JSON.parse(localStorage.getItem('requiem-shadows-of-neon:v1')).settings.buttonScale, r: window.__requiem.scene.getScene('UI').touch.buttons[0].rr }));
  check('Settings: dragging the button-size slider saves and resizes buttons', sz.v === 1.4 && Math.abs(sz.r - 70) < 0.01, JSON.stringify(sz));
  await game(() => { const ui = window.__requiem.scene.getScene('UI'); ui.settings.close(); });
  await page.waitForTimeout(200);
  await tap(pbc.x, pbc.y);
  await page.waitForTimeout(400);
  check('Pause button resumes the game', await game(() => !window.__requiem.scene.isPaused('Game') && !window.__requiem.scene.getScene('UI').paused));

  // ---- Rotation: portrait pauses + overlay; landscape restores and resizes ----
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  const por = await game(() => ({ overlay: document.getElementById('rotate').classList.contains('show'), paused: window.__requiem.scene.isPaused('Game') }));
  check('Portrait: rotate overlay shown and game paused', por.overlay && por.paused, JSON.stringify(por));
  await page.setViewportSize({ width: 932, height: 430 });
  await page.waitForTimeout(800);
  const land = await game(() => ({ overlay: document.getElementById('rotate').classList.contains('show'), w: window.__requiem.scale.width, h: window.__requiem.scale.height }));
  check('Landscape again: overlay hidden, world resized to new aspect', !land.overlay && land.h === 540 && land.w === Math.round((540 * 932 / 430) / 2) * 2, JSON.stringify(land));
  const btnInside = await game(() => { const ui = window.__requiem.scene.getScene('UI'); const W = ui.scale.width, H = ui.scale.height; return ui.touch.buttons.every((b) => b.x + b.rr <= W && b.y + b.rr <= H && b.x - b.rr >= 0); });
  check('Touch buttons stay on screen after resize', btnInside);

  // ---- Quality auto-downgrade on a slow device ----
  await game(() => { localStorage.setItem('requiem-shadows-of-neon:v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('requiem-shadows-of-neon:v1')), settings: { ...JSON.parse(localStorage.getItem('requiem-shadows-of-neon:v1')).settings, quality: 'auto' } })); });
  await game(() => window.__requiem.scene.getScene('UI').closePause());
  await page.waitForTimeout(9000); // this sandbox renders slowly, so auto mode should drop to low quality
  const perf = await game(() => { const g = window.__requiem.scene.getScene('Game'); return { freq: g.ambient.frequency, fog: g.layers[2].ts.visible }; });
  check('Auto quality reduces effects on a slow device', perf.freq > 260 && perf.fog === false, JSON.stringify(perf));

  // ---- Desktop keyboard ----
  const dctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errs.push('desktop: ' + e.message));
  await dp.goto((process.env.BASE || 'http://localhost:5173/') + '?stage=1');
  await dp.waitForFunction(() => window.__requiem && window.__requiem.scene.isActive('UI'), null, { timeout: 15000 });
  await dp.evaluate(() => { const g = window.__requiem; g.loop.inFocus = true; g.loop._coolDown = 0; const s = g.scene.getScene('Game'); s.enemies.forEach((e) => e.destroy()); s.enemies.length = 0; s.setTimeScale(0.3);
    window.__h = []; s.events.on('postupdate', () => { const p = s.player; window.__h.push({ vx: p.body.velocity.x, vy: p.body.velocity.y, atk: p.attack && p.attack.frame, dash: p.dashTime > 0, block: p.blocking }); }); });
  const touchHidden = await dp.evaluate(() => !window.__requiem.scene.getScene('UI').touch.visible);
  check('Desktop: touch controls hidden without a touchscreen', touchHidden);
  await dp.keyboard.down('KeyD');
  await dp.waitForTimeout(1200);
  await dp.keyboard.press('Space');
  await dp.waitForTimeout(400);
  await dp.keyboard.down('KeyJ'); await dp.waitForTimeout(150); await dp.keyboard.up('KeyJ');
  await dp.waitForTimeout(1500);
  await dp.keyboard.down('ShiftLeft'); await dp.waitForTimeout(150); await dp.keyboard.up('ShiftLeft');
  await dp.waitForTimeout(800);
  await dp.keyboard.up('KeyD');
  await dp.waitForTimeout(800);
  await dp.evaluate(() => { const g = window.__requiem; g.loop.inFocus = true; g.loop._coolDown = 0; g.scene.getScene('Game').setTimeScale(1); });
  await dp.waitForFunction(() => window.__requiem.scene.getScene('Game').player.dashTime <= 0, null, { timeout: 10000 });
  await dp.evaluate(() => { const p = window.__requiem.scene.getScene('Game').player; p.body.reset(200, 448); p.hp = 8; p.invuln = 0; p.hurtT = 0; });
  await dp.waitForTimeout(400);
  await dp.keyboard.down('KeyK');
  const blk = await dp.waitForFunction(() => window.__requiem.scene.getScene('Game').player.blocking, null, { timeout: 8000 }).then(() => true, () => false);
  await dp.keyboard.up('KeyK');
  const h = await dp.evaluate(() => window.__h);
  check('Desktop: D moves right', h.some((s) => s.vx > 200));
  check('Desktop: Space jumps', h.some((s) => s.vy < -400));
  check('Desktop: J attacks', h.some((s) => s.atk));
  check('Desktop: Shift dashes', h.some((s) => s.dash));
  check('Desktop: holding K blocks', blk);
  await dp.keyboard.press('Escape');
  await dp.waitForTimeout(500);
  check('Desktop: Esc pauses', await dp.evaluate(() => window.__requiem.scene.isPaused('Game')));
  await dctx.close();

  if (errs.length) console.log('PAGE ERRORS:\n' + errs.join('\n'));
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();
  process.exit(failed || errs.length ? 1 : 0);
})();
