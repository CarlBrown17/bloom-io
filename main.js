// ============================================================
// BLOOM.IO — BOOTSTRAP
// Initializes Phaser, Supabase, monetization and the start flow.
// Phaser is loaded globally from CDN (window.Phaser).
// ============================================================
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { initAuth, createPlayer } from './network/supabase.js';
import { Ads } from './monetization/ads.js';
import { Analytics } from './monetization/analytics.js';
import { IAP } from './monetization/iap.js';

const DEBUG = { enabled: false };
export { DEBUG };

/** Tiny logger that only speaks in debug mode. */
export function dlog(...args) { if (DEBUG.enabled) console.info('[bloom]', ...args); }

/** Show a transient toast message (connection status, errors, etc). */
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, ms);
}

// ---- Phaser configuration ----
const phaserConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: CONFIG.GAME_WIDTH,
  height: CONFIG.GAME_HEIGHT,
  backgroundColor: '#06121a',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,            // responsive: fits any screen, keeps ratio
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

let game = null;

/** Pick a vivid random color for a new organism. */
function randomColor() {
  const h = Math.random();
  // HSV → RGB with full saturation for vivid, distinguishable players
  const i = Math.floor(h * 6), f = h * 6 - i;
  const q = 1 - f, t = f;
  const rgb = [[1, t, 0], [q, 1, 0], [0, 1, t], [0, q, 1], [t, 0, 1], [1, 0, q]][i % 6];
  return { r: Math.round(rgb[0] * 200 + 55), g: Math.round(rgb[1] * 200 + 55), b: Math.round(rgb[2] * 200 + 55) };
}

/** Sanitize username: strip anything that isn't a safe character. */
function sanitizeUsername(raw) {
  const clean = (raw || '').replace(/[^a-zA-Z0-9 _\-áéíóúñÁÉÍÓÚÑ]/g, '').trim().slice(0, 16);
  return clean.length >= 2 ? clean : 'Organism' + Math.floor(Math.random() * 9999);
}

async function startGame() {
  const btn = document.getElementById('play-btn');
  btn.disabled = true;
  btn.textContent = 'CONNECTING…';

  const username = sanitizeUsername(document.getElementById('username-input').value);
  const color = randomColor();

  try {
    // 1) Anonymous auth with Supabase (creates a session, enables RLS policies)
    const session = await initAuth();

    // 2) Register player row in DB
    const playerRow = await createPlayer(username, color, session?.user?.id ?? null);

    // 3) Boot Phaser with our identity injected into the scene
    if (!game) {
      game = new Phaser.Game(phaserConfig);
      game.registry.set('identity', { username, color, playerRow, userId: session?.user?.id ?? null });
      window.game = game;   // exposed for modules that need identity (e.g. IAP)
    }

    // 4) Monetization: banner immediately, analytics session start
    Ads.init();
    Ads.showBannerAd();
    IAP.init();
    Analytics.init();
    Analytics.track('session_start', { username });

    document.getElementById('start-screen').style.display = 'none';
  } catch (err) {
    console.error(err);
    toast('Connection failed — check config.js Supabase keys. Retrying offline mode…', 4000);
    // Graceful fallback: play offline (no multiplayer) so the game never hard-fails
    if (!game) {
      game = new Phaser.Game(phaserConfig);
      game.registry.set('identity', { username, color, playerRow: null, userId: null, offline: true });
      window.game = game;
    }
    document.getElementById('start-screen').style.display = 'none';
  } finally {
    btn.disabled = false;
    btn.textContent = 'PLAY';
  }
}

// ---- Wire up start screen ----
document.getElementById('play-btn').addEventListener('click', startGame);
document.getElementById('username-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

// ---- Debug mode toggle (CTRL+D) ----
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === CONFIG.DEBUG_KEY) {
    e.preventDefault();
    DEBUG.enabled = !DEBUG.enabled;
    toast(`Debug mode: ${DEBUG.enabled ? 'ON' : 'OFF'}`);
    if (game) {
      const scene = game.scene.getScene('GameScene');
      if (scene) scene.setDebug(DEBUG.enabled);
    }
  }
});

// ---- Global error guard: never let an uncaught error kill the session silently ----
window.addEventListener('error', (e) => {
  if (DEBUG.enabled) console.error('Uncaught:', e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  if (DEBUG.enabled) console.error('Unhandled rejection:', e.reason);
});
