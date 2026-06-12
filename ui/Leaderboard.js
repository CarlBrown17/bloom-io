// ============================================================
// LEADERBOARD — top-right overlay, refreshed every 2 seconds.
// Tabs: Biomass (global top), Territory, Blooms (24h), Survival.
// Shows the player's own rank highlighted if they're on the board.
// ============================================================
import { CONFIG } from '../config.js';
import { fetchLeaderboard } from '../network/supabase.js';

const TABS = [
  { key: 'biomass', label: '🧬', title: 'Top Biomass', col: 'biomass', today: false },
  { key: 'territory', label: '🗺️', title: 'Top Territory', col: 'territory', today: false },
  { key: 'blooms_count', label: '🌸', title: 'Blooms (24h)', col: 'blooms_count', today: true },
  { key: 'survival_time_seconds', label: '⏱️', title: 'Survival', col: 'survival_time_seconds', today: false },
];

export class Leaderboard {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.activeTab = TABS[0];

    this.root = document.createElement('div');
    this.root.className = 'hud-layer';
    this.root.style.cssText = 'right:14px;top:14px;width:230px;font-size:13px;';
    this.root.innerHTML = `
      <div style="background:rgba(6,18,26,.75);border:1px solid #1d4438;border-radius:10px;padding:10px 14px;backdrop-filter:blur(4px)">
        <div id="lb-tabs" class="clickable" style="display:flex;gap:6px;margin-bottom:6px"></div>
        <div id="lb-title" style="color:#7ea8a0;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px"></div>
        <ol id="lb-list" style="margin:0;padding-left:22px;line-height:1.7;color:#cdeae0"></ol>
        <div id="lb-empty" style="color:#4d7a6e;display:none">No scores yet — be the first!</div>
      </div>`;
    document.body.appendChild(this.root);

    // Tab buttons
    const tabsEl = this.root.querySelector('#lb-tabs');
    TABS.forEach((tab) => {
      const b = document.createElement('button');
      b.textContent = tab.label;
      b.style.cssText = 'background:none;border:1px solid #1d4438;color:#cdeae0;border-radius:6px;padding:2px 8px;cursor:pointer';
      b.addEventListener('click', () => { this.activeTab = tab; this.refresh(); });
      tabsEl.appendChild(b);
    });

    // Periodic refresh (skipped while offline)
    this.refresh();
    this._timer = setInterval(() => this.refresh(), CONFIG.LEADERBOARD_UPDATE_RATE);
  }

  async refresh() {
    if (this.scene.identity.offline) {
      this.root.querySelector('#lb-title').textContent = 'Offline mode';
      return;
    }
    try {
      const rows = await fetchLeaderboard(this.activeTab.col, 10, this.activeTab.today);
      this.render(rows);
    } catch { /* transient network error — keep previous board */ }
  }

  render(rows) {
    this.root.querySelector('#lb-title').textContent = this.activeTab.title;
    const list = this.root.querySelector('#lb-list');
    const empty = this.root.querySelector('#lb-empty');
    list.innerHTML = '';
    empty.style.display = rows.length ? 'none' : 'block';

    const me = this.scene.identity.username;
    rows.forEach((r) => {
      const li = document.createElement('li');
      const val = this.activeTab.col === 'survival_time_seconds'
        ? `${r[this.activeTab.col]}s`
        : Math.round(r[this.activeTab.col]).toLocaleString();
      li.textContent = `${r.username} — ${val}`;
      if (r.username === me) {
        li.style.color = '#34d399';
        li.style.fontWeight = '700';
      }
      list.appendChild(li);
    });
  }
}
