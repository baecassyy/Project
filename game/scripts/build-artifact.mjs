// Builds a single-file version of the game for hosting as a claude.ai page
// (or any host that only allows inline scripts plus a few public CDNs).
// Phaser is loaded from cdnjs; the game code is inlined as a classic script.
// Output: dist-artifact/index.html
import { build } from 'vite';
import fs from 'node:fs';

const PHASER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.90.0/phaser.min.js';
const OUT = 'dist-artifact';

await build({
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'es2018',
    minify: 'esbuild',
    lib: { entry: 'src/main.js', name: 'Requiem', formats: ['iife'], fileName: () => 'game.js' },
    rollupOptions: { external: ['phaser'], output: { globals: { phaser: 'Phaser' } } }
  }
});

const js = fs.readFileSync(`${OUT}/game.js`, 'utf8').replace(/<\/script/gi, '<\\/script');
const icon = `data:image/svg+xml;base64,${fs.readFileSync('public/icon.svg').toString('base64')}`;
let html = fs.readFileSync('index.html', 'utf8');

// The host wraps the page in its own document skeleton.
html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?(html|head|body)[^>]*>/g, '')
  .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '')
  .replace(/\s*<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>/g, '')
  .replace('href="icon.svg"', `href="${icon}"`)
  .replace('<style>\n', '<style>\n    :root { color-scheme: dark; }\n')
  .replace(
    '<script type="module" src="/src/main.js"></script>',
    `<script src="${PHASER_CDN}"></script>\n  <script>\n${js}\n  </script>`
  );
const title = '<title>Requiem: Shadows of Neon</title>';
html = `${title}\n${html.replace(title, '').trim()}\n`;

fs.writeFileSync(`${OUT}/index.html`, html);
fs.unlinkSync(`${OUT}/game.js`);
console.log(`${OUT}/index.html  ${(html.length / 1024).toFixed(0)} KB`);
