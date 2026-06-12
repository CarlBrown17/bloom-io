// ============================================================
// NUTRIENT — food particles. Green = +10 biomass, blue crystal = +50.
// Procedurally drawn; gently pulses to attract attention.
// ============================================================
import { CONFIG } from '../config.js';

export class Nutrient extends Phaser.GameObjects.Graphics {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {boolean} isCrystal rare blue crystal worth 5x
   */
  constructor(scene, x, y, isCrystal = false) {
    super(scene, { x, y });
    scene.add.existing(this);
    this.isCrystal = isCrystal;
    this.value = isCrystal ? CONFIG.NUTRIENT_CRYSTAL_AMOUNT : CONFIG.NUTRIENT_AMOUNT_BASE;
    this.baseRadius = isCrystal ? 9 : 5;
    this.phase = Math.random() * Math.PI * 2;   // desync pulses
    this.setDepth(5);
    this.draw();

    // Gentle pulse animation
    scene.tweens.add({
      targets: this, scale: { from: 0.85, to: 1.2 },
      duration: 900 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  draw() {
    this.clear();
    if (this.isCrystal) {
      // Blue crystal: diamond shape with glow halo
      this.fillStyle(0x60a5fa, 0.25);
      this.fillCircle(0, 0, this.baseRadius * 2.2);
      this.fillStyle(0x93c5fd, 1);
      this.beginPath();
      this.moveTo(0, -this.baseRadius);
      this.lineTo(this.baseRadius * 0.8, 0);
      this.lineTo(0, this.baseRadius);
      this.lineTo(-this.baseRadius * 0.8, 0);
      this.closePath();
      this.fillPath();
    } else {
      // Green nutrient: simple glowing dot
      this.fillStyle(0x34d399, 0.3);
      this.fillCircle(0, 0, this.baseRadius * 2);
      this.fillStyle(0x6ee7b7, 1);
      this.fillCircle(0, 0, this.baseRadius);
    }
  }

  /** Pickup radius for collision tests. */
  pickupRadius() { return this.baseRadius * 2.5; }
}
