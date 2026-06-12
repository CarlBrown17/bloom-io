// ============================================================
// BLOOM.IO — CONFIGURATION
// Fill in the values marked YOUR_*. Everything else has sane defaults.
// ============================================================
export const CONFIG = {
  // ---- Supabase (Dashboard → Settings → API) ----
  SUPABASE_URL: 'https://ryjrimvirlkpsiidtaro.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5anJpbXZpcmxrcHNpaWR0YXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyODY3NTUsImV4cCI6MjA5Njg2Mjc1NX0.nzf_2F7oFXvRYrUgXOtrJVdHCSSxI55B0BLhVInZlrk',

  // ---- Google AdSense (after approval) ----
  GOOGLE_AD_CLIENT: 'ca-pub-XXXXXXXXXXXXXXXX',
  BANNER_AD_SLOT: 'YOUR_BANNER_SLOT',

  // ---- Stripe (Payment Links — created in Stripe Dashboard, no code) ----
  STRIPE_PUBLIC_KEY: 'pk_test_YOUR_TEST_KEY_HERE',
  // Map cosmetic IDs to Stripe Payment Link URLs:
  STRIPE_PAYMENT_LINKS: {
    glow_effect:  'https://buy.stripe.com/test_REPLACE_GLOW',     // $0.99
    neon_skin:    'https://buy.stripe.com/test_REPLACE_NEON',     // $1.99
    crystal_form: 'https://buy.stripe.com/test_REPLACE_CRYSTAL',  // $2.99
    battle_pass:  'https://buy.stripe.com/test_REPLACE_PASS',     // $4.99/mo
    premium_pack: 'https://buy.stripe.com/test_REPLACE_PREMIUM',  // $9.99
  },

  // ---- Google Analytics (optional, GA4 measurement ID) ----
  GA_MEASUREMENT_ID: '',   // e.g. 'G-XXXXXXXXXX' — leave empty to disable

  // ---- Canvas / world ----
  GAME_WIDTH: 1280,
  GAME_HEIGHT: 720,
  WORLD_WIDTH: 3000,
  WORLD_HEIGHT: 3000,

  // ---- Core mechanics ----
  START_BIOMASS: 100,
  NORMAL_GROWTH_RATE: 1,            // territory per SECOND in normal state
  NORMAL_BIOMASS_COST: 0.05,        // biomass consumed per second of growth
  BLOOM_COST: 50,                   // biomass cost to activate bloom
  BLOOM_DURATION: 3000,             // ms
  BLOOM_COOLDOWN: 15000,            // ms
  BLOOM_GROWTH_MULTIPLIER: 5,       // 5x territory growth during bloom
  BLOOM_SPEED_MULTIPLIER: 1.5,      // +50% speed during bloom
  BASE_SPEED: 220,                  // px/sec at 100 biomass (shrinks as you grow)
  RESONANCE_RADIUS: 350,            // organisms of similar hue within this radius...
  RESONANCE_BONUS: 0.25,            // ...gain +25% growth (synergy mechanic)

  // ---- Nutrients & hazards ----
  NUTRIENT_AMOUNT_BASE: 10,
  NUTRIENT_CRYSTAL_AMOUNT: 50,
  NUTRIENT_CRYSTAL_CHANCE: 0.08,    // 8% of spawns are crystals
  NUTRIENT_SPAWN_RATE: 2000,        // ms between spawns
  NUTRIENT_MAX_ON_MAP: 100,
  BLACKHOLE_COUNT: 6,
  BLACKHOLE_DAMAGE: 50,
  BOOST_COUNT: 4,
  BOOST_DURATION: 5000,             // ms

  // ---- Death / respawn ----
  RESPAWN_BIOMASS_FRACTION: 0.5,    // respawn with half biomass

  // ---- Monetization behavior ----
  INTERSTITIAL_DELAY_AFTER_DEATH: 3000,  // ms
  INTERSTITIAL_MIN_INTERVAL: 60000,      // never more than 1 interstitial/min
  REWARDED_BIOMASS: 50,

  // ---- Network ----
  NETWORK_UPDATE_RATE: 100,         // ms between position broadcasts
  DB_SYNC_RATE: 5000,               // ms between persistent DB writes (free-tier friendly)
  LEADERBOARD_UPDATE_RATE: 2000,    // ms between leaderboard refreshes
  MAX_VISIBLE_PLAYERS: 50,          // cull beyond this
  INTERPOLATION_FACTOR: 0.25,       // smoothing for remote players

  // ---- Debug ----
  DEBUG_KEY: 'KeyD',                // CTRL+D toggles debug mode
};
