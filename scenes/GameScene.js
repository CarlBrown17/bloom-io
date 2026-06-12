// ============================================================
// GAMESCENE — the heart of Bloom.io.
// World creation, input, collisions, spawning, death/respawn,
// network sync hooks and HUD wiring all live here.
// ============================================================
import { CONFIG } from '../config.js';
import { Player } from '../objects/Player.js';
import { Nutrient } from '../objects/Nutrient.js';
import { BlackHole, Boost } from '../objects/Obstacle.js';
import { Network } from '../network/realtime.js';
import { saveLeaderboardEntry, updatePlayerRow } from '../network/supabase.js';
import { HUD } from '../ui/HUD.js';
import { Leaderboard } from '../ui/Leaderboard.js';
import { Shop } from '../ui/Shop.js';
import { Ads } from '../monetization/ads.js';
import { Analytics } from '../monetization/analytics.js';
import { Sfx } from '../assets/preload-assets.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const identity = this.game.registry.get('identity');
    this.identity = identity;
    this.debugMode = false;
    this.isDead = false;

    // ---- World ----
    this.physics.world.setBounds(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);
    this.drawWorldBackground();

    // ---- Local player ----
    this.player = new Player(this, {
      id: identity.playerRow?.id || ('local-' + Math.random().toString(36).slice(2, 10)),
      username: identity.username,
      x: Phaser.Math.Between(300, CONFIG.WORLD_WIDTH - 300),
      y: Phaser.Math.Between(300, CONFIG.WORLD_HEIGHT - 300),
      color: identity.color,
      isLocal: true,
    });

    // ---- Camera follows player smoothly ----
    this.cameras.main.setBounds(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // ---- Entity collections ----
    this.nutrients = [];
    this.blackHoles = [];
    this.boosts = [];
    this.remotePlayers = new Map();   // id -> Player (managed with Network)

    // Initial population
    for (let i = 0; i < CONFIG.NUTRIENT_MAX_ON_MAP * 0.6; i++) this.spawnNutrient();
    for (let i = 0; i < CONFIG.BLACKHOLE_COUNT; i++) {
      this.blackHoles.push(new BlackHole(this,
        Phaser.Math.Between(200, CONFIG.WORLD_WIDTH - 200),
        Phaser.Math.Between(200, CONFIG.WORLD_HEIGHT - 200)));
    }
    for (let i = 0; i < CONFIG.BOOST_COUNT; i++) this.spawnBoost();

    // Periodic nutrient respawn
    this.time.addEvent({
      delay: CONFIG.NUTRIENT_SPAWN_RATE, loop: true,
      callback: () => { if (this.nutrients.length < CONFIG.NUTRIENT_MAX_ON_MAP) this.spawnNutrient(); },
    });

    // ---- Input: mouse / touch movement ----
    this.input.on('pointermove', (p) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.player.moveToward(wp.x, wp.y);
    });
    this.input.on('pointerdown', (p) => {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.player.moveToward(wp.x, wp.y);
    });

    // ---- Input: SPACE / mobile button = bloom ----
    this.input.keyboard.on('keydown-SPACE', () => this.tryBloom());
    const bloomBtn = document.getElementById('bloom-btn');
    bloomBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tryBloom(); });

    // ---- UI overlays ----
    this.hud = new HUD(this);
    this.leaderboard = new Leaderboard(this);
    this.shop = new Shop(this);

    // ---- Network (skipped gracefully in offline mode) ----
    this.network = new Network(this);
    if (!identity.offline) this.network.connect();

    // ---- Periodic DB persistence (free-tier friendly: every 5s, not 100ms) ----
    this.time.addEvent({
      delay: CONFIG.DB_SYNC_RATE, loop: true,
      callback: () => {
        if (!identity.offline && identity.playerRow) {
          updatePlayerRow(identity.playerRow.id, this.player).catch(() => {});
        }
      },
    });

    // ---- Death screen buttons ----
    document.getElementById('respawn-btn').addEventListener('click', () => this.respawn(false));
    document.getElementById('rewarded-btn').addEventListener('click', () => {
      Ads.showRewardedAd((rewarded) => this.respawn(rewarded));
    });

    // ---- Audio (procedurally generated — zero asset downloads) ----
    Sfx.init();
  }

  // ------------------------------------------------------------
  // SPAWNERS
  // ------------------------------------------------------------
  spawnNutrient() {
    const isCrystal = Math.random() < CONFIG.NUTRIENT_CRYSTAL_CHANCE;
    this.nutrients.push(new Nutrient(this,
      Phaser.Math.Between(60, CONFIG.WORLD_WIDTH - 60),
      Phaser.Math.Between(60, CONFIG.WORLD_HEIGHT - 60), isCrystal));
  }

  spawnBoost() {
    this.boosts.push(new Boost(this,
      Phaser.Math.Between(100, CONFIG.WORLD_WIDTH - 100),
      Phaser.Math.Between(100, CONFIG.WORLD_HEIGHT - 100)));
  }

  // ------------------------------------------------------------
  // BLOOM
  // ------------------------------------------------------------
  tryBloom() {
    if (this.isDead) return;
    if (this.player.bloom()) {
      Sfx.play('bloom');
      Analytics.track('bloom', { biomass: Math.round(this.player.biomass) });
      // Burst particle ring
      this.bloomBurst(this.player.x, this.player.y, this.player.colorInt);
      // Camera punch for juice
      this.cameras.main.shake(120, 0.004);
    }
  }

  /** Expanding ring + particle burst effect. */
  bloomBurst(x, y, color) {
    const ring = this.add.graphics({ x, y }).setDepth(20);
    ring.lineStyle(4, color, 0.9);
    ring.strokeCircle(0, 0, 10);
    this.tweens.add({
      targets: ring, scale: 12, alpha: 0, duration: 600, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 14; i++) {
      const dot = this.add.graphics({ x, y }).setDepth(20);
      dot.fillStyle(color, 1);
      dot.fillCircle(0, 0, 3);
      const ang = (i / 14) * Math.PI * 2;
      this.tweens.add({
        targets: dot, x: x + Math.cos(ang) * 120, y: y + Math.sin(ang) * 120,
        alpha: 0, duration: 500, onComplete: () => dot.destroy(),
      });
    }
  }

  // ------------------------------------------------------------
  // MAIN LOOP
  // ------------------------------------------------------------
  update(time, delta) {
    if (this.isDead) return;
    const dt = delta / 1000;

    // Resonance synergy: similar-hue organisms nearby boost each other's growth
    const resonance = this.computeResonance();

    this.player.update(dt, resonance);
    this.blackHoles.forEach((bh) => bh.update(dt));

    this.checkNutrientCollisions();
    this.checkBoostCollisions();
    this.checkBlackHoleCollisions();
    this.checkPlayerCollisions();

    // Push our state to the network (throttled internally to NETWORK_UPDATE_RATE)
    this.network.maybeBroadcast(this.player);

    // HUD refresh
    this.hud.update(this.player, this.network);

    if (this.debugMode) this.drawDebug();
  }

  /** +25% growth if a similar-colored organism is within resonance radius. */
  computeResonance() {
    const myHue = this.colorHue(this.player.color);
    for (const rp of this.remotePlayers.values()) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
      if (d < CONFIG.RESONANCE_RADIUS && Math.abs(this.colorHue(rp.color) - myHue) < 0.12) {
        return CONFIG.RESONANCE_BONUS;
      }
    }
    return 0;
  }

  colorHue({ r, g, b }) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h / 6) + 1) % 1;
  }

  // ------------------------------------------------------------
  // COLLISIONS (simple distance checks — cheap and reliable at this scale)
  // ------------------------------------------------------------
  checkNutrientCollisions() {
    const pr = this.player.radius();
    for (let i = this.nutrients.length - 1; i >= 0; i--) {
      const n = this.nutrients[i];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y) < pr + n.pickupRadius()) {
        this.player.addBiomass(n.value);
        Sfx.play(n.isCrystal ? 'crystal' : 'pickup');
        this.floatText(n.x, n.y, `+${n.value}`, n.isCrystal ? '#93c5fd' : '#6ee7b7');
        n.destroy();
        this.nutrients.splice(i, 1);
      }
    }
  }

  checkBoostCollisions() {
    const pr = this.player.radius();
    for (let i = this.boosts.length - 1; i >= 0; i--) {
      const b = this.boosts[i];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y) < pr + b.pickupRadius()) {
        this.player.boosts[b.boostType] = Date.now() + CONFIG.BOOST_DURATION;
        this.floatText(b.x, b.y, `+${b.boostType.toUpperCase()}`, '#fbbf24');
        Sfx.play('pickup');
        b.destroy();
        this.boosts.splice(i, 1);
        // Respawn a new boost elsewhere after 10s
        this.time.delayedCall(10000, () => this.spawnBoost());
      }
    }
  }

  checkBlackHoleCollisions() {
    if (this.player._bhCooldown && this.player._bhCooldown > Date.now()) return;
    const pr = this.player.radius();
    for (const bh of this.blackHoles) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, bh.x, bh.y) < pr + bh.dangerRadius()) {
        this.player.takeDamage(CONFIG.BLACKHOLE_DAMAGE);
        this.player._bhCooldown = Date.now() + 1500;   // i-frames so it doesn't drain instantly
        this.floatText(this.player.x, this.player.y, `-${CONFIG.BLACKHOLE_DAMAGE}`, '#f87171');
        Sfx.play('hit');
        this.cameras.main.shake(150, 0.006);
        if (this.player.biomass <= 5) this.handleDeath('a black hole');
        break;
      }
    }
  }

  /** Player vs player: on overlap, the one with more POWER absorbs the other. */
  checkPlayerCollisions() {
    const pr = this.player.radius();
    for (const rp of this.remotePlayers.values()) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, rp.x, rp.y);
      if (d < pr + rp.radius()) {
        const myPower = this.player.power();
        const theirPower = rp.power();
        if (myPower > theirPower * 1.1) {
          // We win: absorb a chunk of their biomass (their client resolves their own death)
          this.player.addBiomass(rp.biomass * 0.5);
          this.player.kills++;
          this.network.broadcastKill(rp.id);
          this.floatText(rp.x, rp.y, 'ABSORBED!', '#a7f3d0');
          Sfx.play('crystal');
        } else if (theirPower > myPower * 1.1) {
          this.handleDeath(rp.username);
        }
        // Within 10% of each other: bounce, nobody dies (prevents coin-flip deaths)
      }
    }
  }

  // ------------------------------------------------------------
  // DEATH & RESPAWN
  // ------------------------------------------------------------
  handleDeath(killerName) {
    if (this.isDead) return;
    this.isDead = true;
    Sfx.play('death');
    this.bloomBurst(this.player.x, this.player.y, 0xf87171);

    const stats = this.player.die();   // also resets player state for respawn
    Analytics.track('death', stats);

    // Persist score to global leaderboard
    if (!this.identity.offline) {
      saveLeaderboardEntry(this.identity.username, stats, this.identity.userId).catch(() => {});
    }

    // Show death screen with run summary
    document.getElementById('death-stats').innerHTML =
      `Absorbed by <b>${killerName}</b><br>` +
      `Peak biomass: <b>${stats.biomass}</b> · Territory: <b>${stats.territory}</b><br>` +
      `Kills: <b>${stats.kills}</b> · Blooms: <b>${stats.blooms}</b> · Survived: <b>${stats.survivalSeconds}s</b>`;
    document.getElementById('death-screen').style.display = 'flex';

    // Interstitial ad after a 3-second grace period (frequency-capped in ads.js)
    setTimeout(() => Ads.showInterstitialAd(), CONFIG.INTERSTITIAL_DELAY_AFTER_DEATH);
  }

  respawn(fullBiomass) {
    document.getElementById('death-screen').style.display = 'none';
    if (fullBiomass) this.player.biomass = Math.max(this.player.maxBiomassEver, CONFIG.START_BIOMASS);
    this.isDead = false;
    this.cameras.main.flash(400, 52, 211, 153);
    Analytics.track('respawn', { full: !!fullBiomass });
  }

  // ------------------------------------------------------------
  // VISUAL HELPERS
  // ------------------------------------------------------------
  drawWorldBackground() {
    const g = this.add.graphics().setDepth(0);
    // Subtle grid so movement reads visually
    g.lineStyle(1, 0x10303f, 0.5);
    for (let x = 0; x <= CONFIG.WORLD_WIDTH; x += 100) g.lineBetween(x, 0, x, CONFIG.WORLD_HEIGHT);
    for (let y = 0; y <= CONFIG.WORLD_HEIGHT; y += 100) g.lineBetween(0, y, CONFIG.WORLD_WIDTH, y);
    // World boundary
    g.lineStyle(6, 0x34d399, 0.6);
    g.strokeRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);
  }

  floatText(x, y, text, color) {
    const t = this.add.text(x, y, text, {
      fontSize: '16px', fontFamily: 'Segoe UI, sans-serif', color,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(25);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------
  // DEBUG MODE (CTRL+D)
  // ------------------------------------------------------------
  setDebug(on) {
    this.debugMode = on;
    if (!on && this._debugGfx) { this._debugGfx.clear(); }
    this.hud.setDebug(on);
  }

  drawDebug() {
    if (!this._debugGfx) this._debugGfx = this.add.graphics().setDepth(30);
    const g = this._debugGfx;
    g.clear();
    g.lineStyle(1, 0xff00ff, 0.8);
    g.strokeCircle(this.player.x, this.player.y, this.player.radius());
    for (const rp of this.remotePlayers.values()) g.strokeCircle(rp.x, rp.y, rp.radius());
    for (const bh of this.blackHoles) {
      g.lineStyle(1, 0xff0000, 0.8);
      g.strokeCircle(bh.x, bh.y, bh.dangerRadius());
    }
  }
}
