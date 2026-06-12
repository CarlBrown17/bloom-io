// ============================================================
// SHOP — cosmetics storefront (purely visual items, zero pay-to-win).
// Items the player owns show ✓ and clicking them applies the skin.
// Unowned items launch Stripe checkout (see monetization/iap.js).
// ============================================================
import { IAP } from '../monetization/iap.js';

const RARITY_COLORS = { common: '#94a3b8', rare: '#60a5fa', epic: '#a78bfa', legendary: '#fbbf24' };

export class Shop {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.visible = false;

    this.root = document.createElement('div');
    this.root.className = 'hud-layer';
    this.root.style.cssText =
      'left:50%;top:50%;transform:translate(-50%,-50%);display:none;z-index:48;width:min(420px,92vw);';
    this.root.innerHTML = `
      <div class="clickable" style="background:rgba(6,18,26,.95);border:1px solid #fbbf24;border-radius:14px;padding:20px;backdrop-filter:blur(8px)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <b style="font-size:18px;color:#fbbf24">🛍️ Cosmetics Shop</b>
          <button id="shop-close" style="background:none;border:none;color:#7ea8a0;font-size:20px;cursor:pointer">✕</button>
        </div>
        <div id="shop-items" style="display:flex;flex-direction:column;gap:8px"></div>
        <div style="margin-top:12px;font-size:11px;color:#4d7a6e">All items are visual only — no gameplay advantage. Premium Pack removes ads.</div>
      </div>`;
    document.body.appendChild(this.root);
    this.root.querySelector('#shop-close').addEventListener('click', () => this.toggle());
    this.renderItems();
  }

  renderItems() {
    const container = this.root.querySelector('#shop-items');
    container.innerHTML = '';
    IAP.PRODUCTS.forEach((p) => {
      const owned = IAP.isOwned(p.id);
      const row = document.createElement('div');
      row.style.cssText =
        `display:flex;justify-content:space-between;align-items:center;gap:10px;` +
        `border:1px solid ${RARITY_COLORS[p.rarity]};border-radius:10px;padding:10px 14px;cursor:pointer`;
      row.innerHTML = `
        <div>
          <b style="color:${RARITY_COLORS[p.rarity]}">${p.name}</b> ${owned ? '✓' : ''}
          <div style="font-size:12px;color:#7ea8a0">${p.desc}</div>
        </div>
        <b style="color:#e2f5ec;white-space:nowrap">${owned ? 'APPLY' : p.price}</b>`;
      row.addEventListener('click', () => {
        if (IAP.isOwned(p.id)) {
          // Battle pass / premium pack aren't skins themselves
          const skin = ['glow_effect', 'neon_skin', 'crystal_form'].includes(p.id) ? p.id : null;
          if (skin && IAP.applyCosmetic(this.scene, skin)) this.toggle();
        } else {
          IAP.purchaseItem(p.id);
        }
      });
      container.appendChild(row);
    });
  }

  toggle() {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.renderItems();   // refresh ownership state on open
  }
}
