// ============================================================
// HUD — DOM overlay with player stats, bloom cooldown, connection
// status, controls hint, mute button and debug info (FPS, latency).
// DOM is used instead of Phaser text for crisp rendering at any scale.
// ============================================================
import { CONFIG } from '../config.js';
import { Sfx } from '../assets/preload-assets.js';

export class HUD {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.debug = false;

    this.root = document.createElement('div');
    this.root.className = 'hud-layer';
    this.root.style.cssText = 'left:14px;bottom:14px;font-size:14px;line-height:1.65;';
    this.root.innerHTML = `
      <div id="hud-stats" style="background:rgba(6,18,26,.7);border:1px solid #1d4438;border-radius:10px;padding:10px 16px;backdrop-filter:blur(4px)">
        <div><b id="hud-name"></b></div>
        <div>🧬 Biomass: <b id="hud-biomass">0</b></div>
        <div>🗺️ Territory: <b id="hud-territory">0</b></div>
        <div>⏱️ Alive: <b id="hud-alive">0s</b></div>
        <div id="hud-bloom" style="color:#34d399">🌸 BLOOM READY — press SPACE</div>
        <div id="hud-conn" style="font-size:12px;color:#4d7a6e">● connecting…</div>
        <div id="hud-debug" style="display:none;font-size:12px;color:#fbbf24"></div>
      </div>
      <div style="margin-top:6px">
        <button id="hud-mute" class="clickable" style="background:none;border:1px solid #1d4438;color:#7ea8a0;border-radius:8px;padding:4px 12px;cursor:pointer">🔊 sound</button>
        <button id="hud-shop" class="clickable" style="background:none;border:1px solid #fbbf24;color:#fbbf24;border-radius:8px;padding:4px 12px;cursor:pointer;margin-left:6px">🛍️ shop</button>
      </div>`;
    document.body.appendChild(this.root);

    document.getElementById('hud-name').textContent = scene.identity.username;
    document.getElementById('hud-mute').addEventListener('click', (e) => {
      const muted = Sfx.toggleMute();
      e.target.textContent = muted ? '🔇 muted' : '🔊 sound';
    });
    document.getElementById('hud-shop').addEventListener('click', () => scene.shop.toggle());

    this._lastTick = 0;
  }

  /** Called every frame from GameScene; internally throttled to 5Hz. */
  update(player, network) {
    const now = Date.now();
    if (now - this._lastTick < 200) return;
    this._lastTick = now;

    document.getElementById('hud-biomass').textContent = Math.round(player.biomass);
    document.getElementById('hud-territory').textContent = Math.round(player.territory);
    document.getElementById('hud-alive').textContent =
      Math.round((now - player.spawnTime) / 1000) + 's';

    // Bloom status: ready / active / cooldown countdown
    const bloomEl = document.getElementById('hud-bloom');
    const mobileBtn = document.getElementById('bloom-btn');
    if (player.isBlooming) {
      bloomEl.textContent = '🌸 BLOOMING!';
      bloomEl.style.color = '#fbbf24';
      mobileBtn.classList.remove('cooldown');
    } else if (now < player.bloomReadyAt) {
      const secs = Math.ceil((player.bloomReadyAt - now) / 1000);
      bloomEl.textContent = `🌸 Bloom in ${secs}s`;
      bloomEl.style.color = '#64748b';
      mobileBtn.classList.add('cooldown');
      mobileBtn.textContent = `${secs}s`;
    } else if (player.biomass < CONFIG.BLOOM_COST + 10) {
      bloomEl.textContent = `🌸 Need ${CONFIG.BLOOM_COST + 10} biomass to bloom`;
      bloomEl.style.color = '#64748b';
    } else {
      bloomEl.textContent = '🌸 BLOOM READY — press SPACE';
      bloomEl.style.color = '#34d399';
      mobileBtn.classList.remove('cooldown');
      mobileBtn.textContent = 'BLOOM';
    }

    // Connection indicator
    const conn = document.getElementById('hud-conn');
    if (this.scene.identity.offline) {
      conn.textContent = '● offline mode (single player)';
      conn.style.color = '#fbbf24';
    } else if (network.connected) {
      conn.textContent = `● online · ${this.scene.remotePlayers.size} nearby`;
      conn.style.color = '#34d399';
    } else {
      conn.textContent = '● reconnecting…';
      conn.style.color = '#f87171';
    }

    // Debug readout
    if (this.debug) {
      document.getElementById('hud-debug').textContent =
        `FPS ${Math.round(this.scene.game.loop.actualFps)} · latency ~${network.latency}ms · entities ${this.scene.nutrients.length + this.scene.remotePlayers.size}`;
    }
  }

  setDebug(on) {
    this.debug = on;
    document.getElementById('hud-debug').style.display = on ? 'block' : 'none';
  }
}
