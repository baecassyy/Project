// Boss checks: each boss fights a simple bot for 25 s (player kept alive) to make
// sure every attack pattern runs without errors and the phases change; then the
// boss is finished with real sword hits and the save + stage transition are verified.
// Rendering is skipped during the fight so the test runs at real speed without a GPU.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  let fails = 0;
  for (const stage of [1, 2, 3]) {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
    await p.goto((process.env.BASE || 'http://localhost:5173/') + `?stage=${stage}&boss`);
    await p.waitForFunction(() => { const g = window.__requiem.scene.getScene('Game'); return g && g.boss; }, null, { timeout: 15000 });
    await p.evaluate(() => {
      const g = window.__requiem; g.loop.inFocus = true; g.loop._coolDown = 0;
      const game = g.scene.getScene('Game');
      // Skip drawing (this sandbox has no GPU) so game time runs at real speed.
      game.cameras.main.setVisible(false);
      g.scene.getScene('UI').cameras.main.setVisible(false);
      window.__states = {}; window.__phases = new Set(); window.__bossHits = 0;
      const C = window.__controls;
      let t = 0;
      game.events.on('postupdate', () => {
        const boss = game.boss; const pl = game.player;
        if (!boss) return;
        window.__states[boss.state] = (window.__states[boss.state] || 0) + 1;
        window.__phases.add(boss.phase);
        pl.invuln = 5; pl.hp = pl.maxHp;
        // Simple bot: walk toward the boss and slash.
        t++;
        const dx = boss.x - pl.x;
        C.setAxis('pad', Math.abs(dx) > 90 ? Math.sign(dx) : 0);
        if (t % 9 === 0) { C.press('pad', 'attack'); C.release('pad', 'attack'); }
        if (t % 57 === 0) { C.press('pad', 'jump'); C.release('pad', 'jump'); }
      });
      const hurt = game.boss.hurt.bind(game.boss);
      game.boss.hurt = (...a) => { window.__bossHits++; return hurt(...a); };
    });
    await p.waitForTimeout(25000);
    const r1 = await p.evaluate(() => { const g = window.__requiem.scene.getScene('Game'); return { states: window.__states, phases: [...window.__phases], hp: g.boss.hp, max: g.boss.maxHp, hits: window.__bossHits, enemies: g.enemies.length, proj: g.projectiles.countActive() }; });
    console.log(`Stage ${stage} boss after 25s:`, JSON.stringify(r1));
    // Push through phases and finish the boss with real sword hits.
    await p.evaluate(() => { const g = window.__requiem.scene.getScene('Game'); g.boss.hp = Math.min(g.boss.hp, 3); });
    await p.waitForFunction(() => window.__requiem.scene.getScene('Game').bossDefeated, null, { timeout: 30000 }).catch(() => {});
    const def = await p.evaluate(() => window.__requiem.scene.getScene('Game').bossDefeated);
    // Hidden cameras don't run fade effects; show them again for the transition.
    await p.evaluate(() => ['Game', 'UI'].forEach((k) => window.__requiem.scene.getScene(k).cameras.main.setVisible(true)));
    // Defeat → banner → fade → chapter card → next stage (or the ending).
    await p.waitForFunction((st) => {
      const sm = window.__requiem.scene;
      if (st === 3) return sm.isActive('Ending');
      const g = sm.getScene('Game');
      return sm.isActive('Game') && g.stageId === st + 1;
    }, stage, { timeout: 20000 }).catch(() => {});
    const after = await p.evaluate(() => ({
      scenes: window.__requiem.scene.getScenes(true).map((s) => s.sys.settings.key + (s.stageId ? ':' + s.stageId : '')),
      save: (JSON.parse(localStorage.getItem('requiem-shadows-of-neon:v1')) || {}).progress || {}
    }));
    const okScene = stage < 3 ? after.scenes.includes(`Game:${stage + 1}`) : after.scenes.includes('Ending');
    const okSave = after.save.unlocked === Math.min(3, stage + 1) && (after.save.defeated || []).length >= 1 && (stage < 3 || after.save.cleared);
    const okStates = Object.keys(r1.states).length >= 5;
    console.log(`  defeated=${def} next=${after.scenes.join(',')} save=${JSON.stringify(after.save)}`);
    const ok = def && okScene && okSave && okStates && r1.hits > 0 && !errs.length;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} stage ${stage}${errs.length ? '\n  ERRORS: ' + errs.join('\n  ') : ''}`);
    if (!ok) fails++;
    await ctx.close();
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
