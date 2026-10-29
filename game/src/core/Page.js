// Page-level mobile behavior: blocks scrolling, zooming, text selection and browser
// gestures, shows the rotate-device overlay in portrait, and handles fullscreen.

export const isTouchDevice = () =>
  (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const orientationListeners = new Set();
let portraitBlocked = false;
let playAnyway = false;

// How the device itself is held. The page's own box can't be trusted for this:
// when the game is embedded (e.g. in a side panel) its frame can be taller than
// wide even with the tablet in landscape.
function deviceIsPortrait() {
  const type = screen.orientation && screen.orientation.type;
  if (type) return type.startsWith('portrait');
  if (typeof window.orientation === 'number') return window.orientation === 0 || window.orientation === 180;
  return window.innerHeight > window.innerWidth;
}

export function isPortraitBlocked() {
  return portraitBlocked;
}

export function onOrientationBlock(fn) {
  orientationListeners.add(fn);
  return () => orientationListeners.delete(fn);
}

function updateOrientation() {
  const overlay = document.getElementById('rotate');
  const blocked = !playAnyway && isTouchDevice() && deviceIsPortrait();
  if (overlay) overlay.classList.toggle('show', blocked);
  if (blocked !== portraitBlocked) {
    portraitBlocked = blocked;
    orientationListeners.forEach((fn) => fn(blocked));
  }
}

export function setupPage() {
  const stop = (e) => e.preventDefault();
  // Stop pull-to-refresh, rubber-band scrolling and pinch zoom.
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  // Stop double-tap zoom and long-press menus / selection.
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop);
  document.addEventListener('selectstart', stop);
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', () => setTimeout(updateOrientation, 120));
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', () => setTimeout(updateOrientation, 120));
  }
  // Never leave the player stuck behind the rotate message.
  const anyway = document.getElementById('rotate-anyway');
  if (anyway) {
    anyway.addEventListener('click', () => {
      playAnyway = true;
      updateOrientation();
    });
  }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateOrientation);
  updateOrientation();
}

export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (!isFullscreen()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) { /* not allowed here; the game still runs windowed */ }
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (e) { /* orientation lock is Android-only and needs fullscreen */ }
}

export async function exitFullscreen() {
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch (e) { /* ignore */ }
}

export function toggleFullscreen() {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}
