# Requiem: Shadows of Neon — 鎮魂歌

A monochrome Japanese cyberpunk action-platformer that runs in the browser on
iPhone, iPad, Android and desktop from one codebase (HTML5, Phaser 3, JavaScript, Vite).
Nothing needs installing on the phone: open the page and play.

**Stages and bosses**

| Chapter | Stage | Boss |
|---|---|---|
| 第一章 | Forgotten Spirit Shrine — 忘れられた霊の社 | Hollow Kitsune — 虚ろな九尾 |
| 第二章 | Neon Chinatown — 電脳中華街 | Iron Ronin — 鉄の浪人 |
| 第三章 | Abyssal Shrine Realm — 深淵の神域 | Shogun of the Void — 虚無の将軍 |

---

## Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd game
npm install
npm run dev
```

Open the **Local** address Vite prints (usually http://localhost:5173).

## Play on your phone (same Wi-Fi)

1. Start the dev server on your computer with `npm run dev`. Vite prints two addresses:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.1.23:5173/
   ```
2. Make sure the phone is on the **same Wi-Fi network** as the computer.
3. On the phone, open the **Network** address in Safari (iPhone/iPad) or Chrome (Android).
   - No Network line? Find your computer's IP address:
     macOS `ipconfig getifaddr en0` · Windows `ipconfig` (IPv4 Address) · Linux `hostname -I`,
     then open `http://<that-ip>:5173`.
   - If the page doesn't load, allow Node.js through the computer's firewall when asked
     (Windows shows a prompt; on macOS check System Settings → Network → Firewall).
     Some guest or office networks block device-to-device traffic. A phone hotspot works as an alternative.
4. Turn the phone sideways. The game plays in landscape and pauses with a "rotate your device"
   message in portrait.
5. Tap **TAP TO BEGIN**. On Android this also switches to fullscreen and locks landscape.
6. **iPhone fullscreen:** iOS Safari doesn't let web pages go fullscreen on iPhone. Use
   **Share → Add to Home Screen** and launch the game from the new icon; it then opens fullscreen
   with no browser bars. (iPad supports the in-game FULLSCREEN button.)

To try the optimized production build on the phone, run `npm run build` then `npm run preview`
and open the Network address it prints (port 4173).

## Deploy

`npm run build` writes a static site to `game/dist/`. It uses relative paths, so it works from any
folder on any static host (GitHub Pages, Netlify, Cloudflare Pages, S3…). Serve it over HTTPS for
fullscreen and home-screen install.

---

## Controls

| Action | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Move | Left thumb: virtual joystick (appears where you touch) | A / D or ← / → | Left stick / D-pad |
| Drop through a platform | Joystick down + JUMP | S / ↓ + Jump | Down + A |
| Jump / double jump | 跳 JUMP | Space, W, ↑ or Z | A |
| Katana slash, 3-hit combo, air slash | 斬 ATTACK | J or X | X |
| Dash / air dash (brief invulnerability) | 疾 DASH | Shift, L or C | B / RB |
| Parry (tap) / block (hold) | 受 PARRY | K or V | LB / RT |
| Shrines, lore stones | 触 ACT (glows when something is in reach) | E or F | Y |
| Pause | ‖ button (top-right) | Esc or P | Start |

**Combat tips**

- **Parry** is a short window just after you press it. A successful parry negates the hit, slows
  time, staggers the attacker and triggers an automatic counter-slash. Staggered enemies take +50%
  damage.
- **Projectiles** (drone bolts, foxfire, void orbs) can be parried or slashed back at their owner.
- **Shockwaves** and **void pillars** can't be parried. Jump or dash through them.
- **Holding PARRY** keeps a block that stops attacks from the front. The Iron Ronin's iaido draw
  breaks through a block, so parry it instead.
- **Shrines** heal you fully, set your respawn point and save your progress.

**The touch controls**

- Every finger is tracked separately: you can move, jump and attack at the same time.
- Buttons react on touch-down, have generous hit areas, and you can slide a thumb from one button
  to another.
- The controls are semi-transparent, stay fixed on screen while the camera moves, and are laid out
  inside the safe area (notches, rounded corners, home indicator).
- Opacity and button size are adjustable in Settings. With Touch Controls set to *Auto* they appear
  on touch screens and hide when you play with a keyboard or gamepad.

## Settings (saved on the device)

Music volume · Sound effects · Touch control opacity · Touch button size · Touch controls
(Auto/On/Off) · Effects quality (Auto/High/Low) · Screen shake · **Difficulty** · Fullscreen ·
Reset progress.

**Difficulty** defaults to **Hard (2×)**:
- Every hit deals double damage.
- Enemies and bosses have 1.5× health.
- Enemies wind up and attack 25% faster, and bosses 30% faster.
- Projectiles fly 25% faster.
- The parry window is shorter (0.17 s instead of 0.22 s).

**Normal** keeps the original balance. The stage name in the HUD shows "HARD" when it's on.

Progress (unlocked chapters, the last shrine, defeated bosses) and settings are stored in the
browser's `localStorage`. **CONTINUE** on the title screen resumes from the last shrine.

## Mobile performance

- All art is drawn procedurally at startup and all audio is synthesized with the Web Audio API, so
  there are no image or sound downloads (about 385 KB gzipped in total).
- Each stage's backgrounds are built when it loads, and the previous stage's are freed.
- On 90/120 Hz screens the frame rate is capped at 60 fps to halve the work and reduce heat.
- **Auto quality** starts from a device estimate and switches to *Low* if the frame rate stays
  under 50 fps. Low reduces particles, rain, afterimages and the fog layer; gameplay is unchanged.
- Effects and projectiles are pooled, off-screen enemies sleep, there are no real-time lights
  (glow is additive sprites), and the game pauses itself and suspends audio when the tab is hidden.
- In testing, game logic takes about 0.6 ms per frame.

## Project structure

```
game/
├─ index.html              viewport/safe-area setup, rotate overlay, gesture blocking
├─ public/                 web manifest + icons (home-screen install)
├─ src/
│  ├─ main.js              Phaser config, responsive resize, refresh-rate cap
│  ├─ core/                Controls (keyboard/touch/gamepad), Audio, Storage, Layout, Page, Perf
│  ├─ gfx/                 Art (procedural sprites/backgrounds), Fx (pooled effects)
│  ├─ entities/            Player, Enemy types, Bosses, Projectile
│  ├─ data/stages.js       level layouts for the three stages
│  ├─ ui/                  TouchControls, Widgets (buttons/sliders), SettingsPanel
│  └─ scenes/              Boot, Menu, StageCard, Game, UI (HUD + pause), Ending
└─ tests/                  end-to-end tests (Playwright)
```

## Tests

The end-to-end tests drive the real game in Chromium with raw multitouch events (the same path a
phone uses):

- **`tests/touch.test.cjs`** checks the multitouch controls:
  - joystick movement and release
  - jumping while moving, and double jumps
  - attacking while moving, and the 3-hit combo
  - three fingers at once
  - dash and air dash
  - sliding a thumb between buttons
  - block
  - parrying a real enemy attack (with a control case that takes damage)
- **`tests/flow.test.cjs`** checks the game flow:
  - title screen by touch
  - shrine heal and save, lore stones
  - death and respawn
  - Continue after a reload
  - pause and the settings slider by touch
  - portrait/landscape rotation
  - auto quality
  - desktop keyboard
- **`tests/bosses.test.cjs`** checks all three boss fights, the phase changes, the save data and the
  move to the next stage or the ending.

```bash
npx playwright install chromium   # once
npm run dev                       # in one terminal
npm run test:e2e                  # in another (or BASE=http://localhost:4173/ against `npm run preview`)
```

Handy URL parameters while developing: `?stage=2` (jump to a stage), `?stage=3&boss` (start at the
boss), `?debug` (FPS and quality readout), `?physics` (hitboxes), `?art` / `?art=1..3` (texture
preview).
