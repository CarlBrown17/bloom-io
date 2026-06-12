// ============================================================
// OBSTACLE — map hazards & power-ups.
//   - BlackHole: -50 biomass on contact, slowly drifts
//   - Boost: temporary +speed/+attack/+shield sparkle (5 sec effect)
// ============================================================
import { CONFIG } from '../config.js';

export class BlackHole extends Phaser.GameObjects.Graphics {
  constructor(scene, x, y) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.radius = 26 + Math.random() * 14;
    this.driftAngle = Math.random() * Math.PI * 2;
    this.setDepth(4);
    this.draw();

    // Slow ominous rotation
    scene.tweens.add({ targets: this, angle: 360, duration: 9000, repeat: -1 });
  }

  draw() {
    this.clear();
    // Outer warp ring
    this.lineStyle(2, 0x7c3aed, 0.5);
    this.strokeCircle(0, 0, this.radius * 1.5);
    // Dark core layers
    this.fillStyle(0x1e1033, 0.85);
    this.fillCircle(0, 0, this.radius * 1.2);
    this.fillStyle(0x000000, 1);
    this.fillCircle(0, 0, this.radius * 0.8);
    // Accretion glint
    this.lineStyle(2, 0xa78bfa, 0.8);
    this.beginPath();
    this.arc(0, 0, this.radius, 0, Math.PI * 0.6);
    this.strokePath();
  }

  /** Drift slowly so camping spots change over time. */
  update(dt) {
    this.driftAngle += (Math.random() - 0.5) * 0.1;
    this.x += Math.cos(this.driftAngle) * 8 * dt;
    this.y += Math.sin(this.driftAngle) * 8 * dt;
    this.x = Phaser.Math.Clamp(this.x, 100, CONFIG.WORLD_WIDTH - 100);
    this.y = Phaser.Math.Clamp(this.y, 100, CONFIG.WORLD_HEIGHT - 100);
  }

  dangerRadius() { return this.radius; }
}

export class Boost extends Phaser.GameObjects.Graphics {
  static TYPES = ['speed', 'attack', 'shield'];
  static COLORS = { speed: 0xfbbf24, attack: 0xf87171, shield: 0x60a5fa };

  constructor(scene, x, y) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.boostType = Phaser.Utils.Array.GetRandom(Boost.TYPES);
    this.setDepth(5);
    this.draw();
    scene.tweens.add({
      targets: this, alpha: { from: 0.5, to: 1 }, scale: { from: 0.8, to: 1.15 },
      duration: 600, yoyo: true, repeat: -1,
    });
  }

  draw() {
    const c = Boost.COLORS[this.boostType];
    this.clear();
    this.fillStyle(c, 0.25);
    this.fillCircle(0, 0, 16);
    // 4-point sparkle star
    this.fillStyle(c, 1);
    this.beginPath();
    this.moveTo(0, -10); this.lineTo(3, -3); this.lineTo(10, 0); this.lineTo(3, 3);
    this.lineTo(0, 10); this.lineTo(-3, 3); this.lineTo(-10, 0); this.lineTo(-3, -3);
    this.closePath();
    this.fillPath();
  }

  pickupRadius() { return 18; }
}
