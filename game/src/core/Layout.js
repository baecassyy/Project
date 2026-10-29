// Responsive sizing. The game world is always 540 units tall; its width follows the
// screen's aspect ratio (4:3 iPad up to ~21:9 phones), so nothing is letterboxed.

export const BASE_H = 540;
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 2.34;

export function computeGameSize() {
  const vw = window.innerWidth || 960;
  const vh = window.innerHeight || 540;
  let aspect = vw / vh;
  // In portrait we size for the landscape the player is about to rotate into.
  if (aspect < 1) aspect = 1 / aspect;
  aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect));
  return { w: Math.round((BASE_H * aspect) / 2) * 2, h: BASE_H };
}

// Device safe-area insets (notches, rounded corners, home indicator) in game units.
export function safeInsets(game) {
  const probe = document.getElementById('safe-probe');
  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe || !game) return out;
  const cs = window.getComputedStyle(probe);
  const scale = game.scale.displayScale.x || 1;
  out.top = (parseFloat(cs.paddingTop) || 0) * scale;
  out.right = (parseFloat(cs.paddingRight) || 0) * scale;
  out.bottom = (parseFloat(cs.paddingBottom) || 0) * scale;
  out.left = (parseFloat(cs.paddingLeft) || 0) * scale;
  return out;
}

export const FONT = 'Rajdhani, "Segoe UI", Roboto, system-ui, sans-serif';
export const FONT_JP = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif';
export const TEXT_RES = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
