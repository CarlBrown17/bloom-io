// ============================================================
// IAP — cosmetics via Stripe Payment Links (zero-backend checkout).
//
// Flow:
//   1. Player clicks an item in the Shop → redirected to a Stripe
//      Payment Link (created in the Stripe Dashboard, no code).
//   2. The Payment Link's success URL returns to the game with
//      ?purchase=<cosmeticId>&session_id={CHECKOUT_SESSION_ID}.
//   3. SERVER-SIDE fulfillment: a Stripe webhook hits a Supabase Edge
//      Function which verifies the session and inserts into
//      user_cosmetics. The client-side grant below is optimistic UX;
//      the Edge Function is the source of truth (anti-fraud).
//      See README → "Stripe setup" for the 10-line Edge Function.
//
// Cosmetics are purely visual — zero gameplay advantage.
// ============================================================
import { CONFIG } from '../config.js';
import { saveCosmetic, fetchOwnedCosmetics } from '../network/supabase.js';
import { Analytics } from './analytics.js';
import { Ads } from './ads.js';
import { toast } from '../main.js';

export const IAP = {
  /** Product catalog (mirror of the cosmetics table). */
  PRODUCTS: [
    { id: 'glow_effect',  name: 'Glow Effect',   price: '$0.99', rarity: 'common',    desc: 'Permanent soft glow around your organism.' },
    { id: 'neon_skin',    name: 'Neon Skin',     price: '$1.99', rarity: 'rare',      desc: 'Ultra-bright neon core.' },
    { id: 'crystal_form', name: 'Crystal Form',  price: '$2.99', rarity: 'epic',      desc: 'Rotating crystalline lattice.' },
    { id: 'battle_pass',  name: 'Battle Pass',   price: '$4.99/mo', rarity: 'epic',   desc: 'Exclusive cosmetics + weekly drops.' },
    { id: 'premium_pack', name: 'Premium Pack',  price: '$9.99', rarity: 'legendary', desc: 'ALL cosmetics + NO ADS, forever.' },
  ],

  owned: new Set(),
  userId: null,

  init() {
    // Restore ownership from Supabase for returning players
    const tryRestore = async () => {
      try {
        const identity = window?.game?.registry?.get?.('identity');
        this.userId = identity?.userId ?? null;
        const rows = await fetchOwnedCosmetics(this.userId);
        rows.forEach((r) => this.owned.add(r.cosmetic_id));
        if (this.owned.has('premium_pack')) Ads.disableAds();
      } catch { /* offline — shop still browsable */ }
    };
    tryRestore();
    this.handleReturnFromCheckout();
  },

  /** Open Stripe Checkout for a product (hosted page — PCI handled by Stripe). */
  purchaseItem(productId) {
    const link = CONFIG.STRIPE_PAYMENT_LINKS[productId];
    if (!link || link.includes('REPLACE')) {
      toast('Shop not configured yet — see README → Stripe setup');
      return;
    }
    Analytics.track('checkout_start', { productId });
    // client_reference_id ties the Stripe session to this player for webhook fulfillment
    const url = new URL(link);
    if (this.userId) url.searchParams.set('client_reference_id', this.userId);
    window.location.href = url.toString();
  },

  /** Detect ?purchase=<id> on return from a successful Stripe checkout. */
  handleReturnFromCheckout() {
    const params = new URLSearchParams(window.location.search);
    const purchased = params.get('purchase');
    if (!purchased) return;

    // Optimistic grant for instant UX (webhook → Edge Function is authoritative)
    this.owned.add(purchased);
    if (this.userId) saveCosmetic(this.userId, purchased).catch(() => {});
    if (purchased === 'premium_pack') Ads.disableAds();
    Analytics.track('purchase_complete', { productId: purchased });
    toast(`🎉 ${purchased.replace('_', ' ')} unlocked!`);

    // Clean the URL so refreshing doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
  },

  /** Apply a cosmetic to the local player. */
  applyCosmetic(scene, cosmeticId) {
    if (!this.owned.has(cosmeticId) && !this.owned.has('premium_pack')) {
      toast('You don’t own that cosmetic yet');
      return false;
    }
    scene.player.cosmetic = cosmeticId;
    Analytics.track('cosmetic_applied', { cosmeticId });
    return true;
  },

  isOwned(id) { return this.owned.has(id) || this.owned.has('premium_pack'); },
};
