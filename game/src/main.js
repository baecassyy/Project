import Phaser from 'phaser';
import { setupPage } from './core/Page.js';
import { computeGameSize } from './core/Layout.js';
import { Perf } from './core/Perf.js';
import { Controls } from './core/Controls.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { StageCardScene } from './scenes/StageCardScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { ArtPreviewScene } from './scenes/ArtPreviewScene.js';

setupPage();
Perf.init();

// Measures the display refresh rate so 90/120 Hz phones can be capped at 60 fps,
// which halves CPU/GPU work and avoids overheating.
function measureRefresh() {
  return new Promise((resolve) => {
    const times = [];
    const tick = (t) => {
      times.push(t);
      if (times.length < 20) requestAnimationFrame(tick);
      else resolve(1000 / ((times[times.length - 1] - times[2]) / (times.length - 3)));
    };
    requestAnimationFrame(tick);
    setTimeout(() => resolve(60), 1500);
  });
}

// Web fonts are drawn into textures at boot, so wait for them (briefly).
function loadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const glyphs = '鎮魂歌忘れられた霊の社電脳中華街深淵神域九尾空狐鉄浪人虚無将軍封記憶回転斬跳疾受触命討伐弾第一二三章';
  return Promise.race([
    Promise.all([
      document.fonts.load('900 32px "Noto Serif JP"', glyphs),
      document.fonts.load('700 20px Rajdhani'),
      document.fonts.load('500 20px Rajdhani')
    ]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500))
  ]);
}

async function start() {
  const [hz] = await Promise.all([measureRefresh(), loadFonts()]);
  const size = computeGameSize();
  const params = new URLSearchParams(window.location.search);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: size.w,
    height: size.h,
    backgroundColor: '#050609',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { y: 1500 }, tileBias: 24, debug: params.has('physics') } },
    input: { activePointers: 6, touch: { capture: true }, mouse: { preventDefaultWheel: true } },
    render: { antialias: true, roundPixels: true, powerPreference: 'high-performance', batchSize: 2048 },
    fps: hz > 75 ? { target: 60, limit: 60 } : { target: 60 },
    audio: { noAudio: true }, // all sound is synthesized by core/Audio.js
    disableContextMenu: true,
    banner: false,
    scene: [BootScene, MenuScene, StageCardScene, GameScene, UIScene, EndingScene, ArtPreviewScene]
  });

  // Resize the world width to the new aspect ratio when the screen changes.
  let pending = null;
  const onResize = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const s = computeGameSize();
      if (s.w !== game.scale.gameSize.width || s.h !== game.scale.gameSize.height) {
        game.scale.setGameSize(s.w, s.h);
      }
      game.scale.refresh();
    }, 80);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onResize);

  const boot = document.getElementById('boot');
  if (boot) boot.remove();

  // Exposed for automated tests and debugging.
  window.__requiem = game;
  window.__controls = Controls;
}

start();
