// ============================================================
// PLAYER — the living organism.
// Used for BOTH the local player and remote players (isLocal flag).
// Rendered procedurally with Phaser Graphics (no sprite assets needed).
// ============================================================
import { CONFIG } from '../config.js';

export class Player extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} opts {id, username, x, y, color:{r,g,b}, biomass, territory, isLocal, cosmetic}
   */
  constructor(scene, opts) {
    super(scene, opts.x, opts.y);
    scene.add.existing(this);

    this.id = opts.id;
    this.username = opts.username || 'organism';
    this.color = opts.color || { r: 100, g: 220, b: 150 };
    this.colorInt = Phaser.Display.Color.GetColor(this.color.r, this.color.g, this.color.b);
    this.biomass = opts.biomass ?? CONFIG.START_BIOMASS;
    this.territory = opts.territory ?? 1;
    this.isLocal = !!opts.isLocal;
    this.cosmetic = opts.cosmetic || null;

    // Bloom state machine
    this.isBlooming = false;
    this.bloomEndsAt = 0;
    this.bloomReadyAt = 0;       // timestamp when cooldown finishes

    // Stats for leaderboard
    this.kills = 0;
    this.bloomsCount = 0;
    this.spawnTime = Date.now();
    this.maxBiomassEver = this.biomass;
    this.maxTerritoryEver = this.territory;

    // Movement target (where cursor points / network position)
    this.targetX = opts.x;
    this.targetY = opts.y;

    // Boost effects {speed, attack, shield} with expiry timestamps
    this.boosts = {};

    // ---- Visual layers ----
    this.territoryGfx = scene.add.graphics();   // territory drawn UNDER everything
    this.territoryGfx.setDepth(1);
    this.bodyGfx = scene.add.graphics();        // organism body
    this.nameText = scene.add.text(0, 0, this.username, {
      fontSize: '14px', fontFamily: 'Segoe UI, sans-serif',
      color: '#e2f5ec', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(11);
    this.add(this.bodyGfx);
    this.setDepth(10);

    // Physics body for collision broad-phase
    scene.physics.add.existing(this);
    this.body.setCircle(this.radius());

    this.redraw();
  }

  /** Organism radius scales with sqrt of biomass for visual balance. */
  radius() {
    return 16 + Math.sqrt(Math.max(this.biomass, 1)) * 1.6;
  }

  /** Territory circle radius derives from territory "area" value. */
  territoryRadius() {
    return this.radius() + Math.sqrt(Math.max(this.territory, 0)) * 6;
  }

  /** Movement speed: bigger = slower, blooming = faster, boosts apply. */
  speed() {
    let s = CONFIG.BASE_SPEED * Math.pow(CONFIG.START_BIOMASS / Math.max(this.biomass, 50), 0.25);
    if (this.isBlooming) s *= CONFIG.BLOOM_SPEED_MULTIPLIER;
    if (this.boosts.speed && this.boosts.speed > Date.now()) s *= 1.4;
    return s;
  }

  /** Effective combat power. Bloom triples attack (+200%). */
  power() {
    let p = this.biomass;
    if (this.isBlooming) p *= 3;
    if (this.boosts.attack && this.boosts.attack > Date.now()) p *= 1.3;
    return p;
  }

  hasShield() { return this.boosts.shield && this.boosts.shield > Date.now(); }

  /** Attempt to activate bloom. Returns true if it fired. */
  bloom() {
    const now = Date.now();
    if (this.isBlooming || now < this.bloomReadyAt || this.biomass < CONFIG.BLOOM_COST + 10) return false;
    this.biomass -= CONFIG.BLOOM_COST;
    this.isBlooming = true;
    this.bloomEndsAt = now + CONFIG.BLOOM_DURATION;
    this.bloomReadyAt = this.bloomEndsAt + CONFIG.BLOOM_COOLDOWN;
    this.bloomsCount++;
    return true;
  }

  addBiomass(amount) {
    this.biomass = Math.max(0, this.biomass + amount);
    this.maxBiomassEver = Math.max(this.maxBiomassEver, this.biomass);
  }

  takeDamage(amount) {
    if (this.hasShield()) return;
    this.biomass = Math.max(0, this.biomass - amount);
  }

  moveToward(x, y) { this.targetX = x; this.targetY = y; }

  /**
   * Per-frame update (local player only — remote players are interpolated
   * by realtime.js instead).
   * @param {number} dt delta seconds
   * @param {number} resonanceBonus extra growth multiplier from nearby same-hue allies
   */
  update(dt, resonanceBonus = 0) {
    const now = Date.now();

    // End bloom when timer expires
    if (this.isBlooming && now >= this.bloomEndsAt) this.isBlooming = false;

    // Territory growth: normal vs bloom, plus resonance synergy
    const mult = (this.isBlooming ? CONFIG.BLOOM_GROWTH_MULTIPLIER : 1) * (1 + resonanceBonus);
    this.territory += CONFIG.NORMAL_GROWTH_RATE * mult * dt;
    this.biomass = Math.max(1, this.biomass - CONFIG.NORMAL_BIOMASS_COST * dt);
    this.maxTerritoryEver = Math.max(this.maxTerritoryEver, this.territory);

    // Steer toward target (cursor / touch point)
    const dx = this.targetX - this.x, dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const v = Math.min(this.speed(), dist / dt);
      this.x += (dx / dist) * v * dt;
      this.y += (dy / dist) * v * dt;
    }

    // Clamp to world bounds
    this.x = Phaser.Math.Clamp(this.x, this.radius(), CONFIG.WORLD_WIDTH - this.radius());
    this.y = Phaser.Math.Clamp(this.y, this.radius(), CONFIG.WORLD_HEIGHT - this.radius());

    this.redraw();
  }

  /** Redraw body + territory. Called on every change (cheap: 2 graphics objects). */
  redraw() {
    const r = this.radius();
    const tr = this.territoryRadius();
    const pulse = this.isBlooming ? 1 + 0.15 * Math.sin(Date.now() / 60) : 1;

    // --- Territory: gradient fade from center to edge ---
    this.territoryGfx.clear();
    this.territoryGfx.setPosition(this.x, this.y);
    for (let i = 3; i >= 1; i--) {
      this.territoryGfx.fillStyle(this.colorInt, 0.05 * i);
      this.territoryGfx.fillCircle(0, 0, tr * (1 - (i - 1) * 0.18));
    }
    this.territoryGfx.lineStyle(2, this.colorInt, 0.35);
    this.territoryGfx.strokeCircle(0, 0, tr);

    // --- Body: layered blob, glows when blooming ---
    this.bodyGfx.clear();
    if (this.isBlooming || this.cosmetic === 'glow_effect') {
      this.bodyGfx.fillStyle(0xffffff, 0.25);
      this.bodyGfx.fillCircle(0, 0, r * pulse * 1.5);
    }
    if (this.hasShield()) {
      this.bodyGfx.lineStyle(3, 0x60a5fa, 0.9);
      this.bodyGfx.strokeCircle(0, 0, r * pulse * 1.25);
    }
    // Intensity scales with biomass (brighter core when bigger)
    const coreAlpha = Math.min(1, 0.6 + this.biomass / 2000);
    this.bodyGfx.fillStyle(this.colorInt, coreAlpha);
    this.bodyGfx.fillCircle(0, 0, r * pulse);
    this.bodyGfx.fillStyle(0xffffff, this.cosmetic === 'neon_skin' ? 0.6 : 0.35);
    this.bodyGfx.fillCircle(0, 0, r * pulse * 0.45);
    if (this.cosmetic === 'crystal_form') {
      this.bodyGfx.lineStyle(2, 0xa5f3fc, 0.9);
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + Date.now() / 1500;
        this.bodyGfx.lineBetween(0, 0, Math.cos(ang) * r * pulse, Math.sin(ang) * r * pulse);
      }
    }

    // Name label floats above
    this.nameText.setPosition(this.x, this.y - r - 16);

    // Keep physics circle in sync with growth
    if (this.body) {
      this.body.setCircle(r);
      this.body.setOffset(-r, -r);
    }
  }

  /** Handle death: return final stats, then reset for respawn. */
  die() {
    const stats = {
      biomass: Math.round(this.maxBiomassEver),
      territory: Math.round(this.maxTerritoryEver),
      kills: this.kills,
      blooms: this.bloomsCount,
      survivalSeconds: Math.round((Date.now() - this.spawnTime) / 1000),
    };
    // Respawn state: half biomass, territory resets
    this.biomass = Math.max(CONFIG.START_BIOMASS * CONFIG.RESPAWN_BIOMASS_FRACTION, 50);
    this.territory = 1;
    this.isBlooming = false;
    this.bloomReadyAt = 0;
    this.spawnTime = Date.now();
    this.x = Phaser.Math.Between(200, CONFIG.WORLD_WIDTH - 200);
    this.y = Phaser.Math.Between(200, CONFIG.WORLD_HEIGHT - 200);
    this.targetX = this.x;
    this.targetY = this.y;
    return stats;
  }

  /** Network serialization — keep payload tiny (sent 10x/sec). */
  serialize() {
    return {
      id: this.id, u: this.username,
      x: Math.round(this.x), y: Math.round(this.y),
      b: Math.round(this.biomass), t: Math.round(this.territory * 10) / 10,
      c: [this.color.r, this.color.g, this.color.b],
      bl: this.isBlooming ? 1 : 0, cos: this.cosmetic,
    };
  }

  /** Apply a network snapshot to a remote player (positions are interpolated elsewhere). */
  deserialize(d) {
    this.username = d.u ?? this.username;
    this.biomass = d.b ?? this.biomass;
    this.territory = d.t ?? this.territory;
    this.isBlooming = !!d.bl;
    this.cosmetic = d.cos ?? this.cosmetic;
    if (d.c) {
      this.color = { r: d.c[0], g: d.c[1], b: d.c[2] };
      this.colorInt = Phaser.Display.Color.GetColor(...d.c);
    }
    this.nameText.setText(this.username);
  }

  destroy(fromScene) {
    this.territoryGfx.destroy();
    this.nameText.destroy();
    super.destroy(fromScene);
  }
}
