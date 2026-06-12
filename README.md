# 🌸 BLOOM.IO

**Multiplayer organism growth battle.** Grow your organism, collect nutrients, and risk everything with explosive BLOOMS to dominate the global leaderboard.

- 💰 **$0/month hosting** — Vercel (frontend) + Supabase (backend), both free tiers
- 🌐 **Real-time multiplayer** — Supabase Realtime WebSockets
- 💵 **Monetization built in** — AdSense banners/interstitials/rewarded + Stripe cosmetics
- 🧑‍💻 **Zero coding needed to deploy** — just copy/paste keys into one file

---

## 🚀 Deploy in ~20 minutes (no code)

### Step 1 — Supabase (backend, 5 min)

1. Create a free account at [supabase.com](https://supabase.com) → **New project** (pick a region near your players).
2. Open **SQL Editor → New query**, paste the entire contents of `sql-setup.sql`, click **Run**. ✅ All tables, security policies and indexes are created.
3. Go to **Authentication → Sign In / Up → Anonymous sign-ins → Enable**.
4. Go to **Settings → API** and copy:
   - **Project URL** → paste into `config.js` as `SUPABASE_URL`
   - **anon public key** → paste into `config.js` as `SUPABASE_KEY`

### Step 2 — Vercel (hosting, 5 min)

1. Push this folder to a GitHub repository (GitHub Desktop works fine — no terminal needed).
2. Create a free account at [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Framework preset: **Other**. No build command needed (the game runs as static files). Click **Deploy**.
4. Your game is live at `https://your-project.vercel.app` 🎉

> The game works **right now** with just Steps 1–2. Ads and the shop activate when you complete Steps 3–4.

### Step 3 — Google AdSense (ads revenue)

1. Apply at [google.com/adsense](https://www.google.com/adsense) with your Vercel domain (approval: usually 1–14 days).
2. Once approved: **Ads → By ad unit → Display ad** → create a banner unit.
3. In `index.html`, replace `ca-pub-XXXXXXXXXXXXXXXX` in the AdSense `<script>` tag with your publisher ID.
4. In `config.js`, set `GOOGLE_AD_CLIENT` and `BANNER_AD_SLOT`.
5. Interstitials and rewarded ads use Google's **H5 Games Ads** (Ad Placement API) — already wired up in `monetization/ads.js`. Apply for H5 Games Ads in your AdSense account for best fill rates.

### Step 4 — Stripe (cosmetics shop)

1. Create a free account at [stripe.com](https://stripe.com).
2. **Product catalog → Add product** — create the 5 cosmetics (Glow $0.99, Neon $1.99, Crystal $2.99, Battle Pass $4.99/mo, Premium $9.99).
3. For each product: **Create payment link**. In the link settings, set the confirmation page to redirect to:
   `https://your-project.vercel.app/?purchase=glow_effect` (matching each product's ID).
4. Paste the 5 payment link URLs into `config.js` → `STRIPE_PAYMENT_LINKS`.
5. **(Recommended, anti-fraud)** Server-side fulfillment: in Supabase → **Edge Functions**, create `stripe-webhook` with this code, then point a Stripe webhook (`checkout.session.completed`) at it:

```ts
import Stripe from 'npm:stripe';
import { createClient } from 'npm:@supabase/supabase-js';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')!;
  const event = await stripe.webhooks.constructEventAsync(
    await req.text(), sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    await sb.from('user_cosmetics').upsert({
      user_id: s.client_reference_id,
      cosmetic_id: s.metadata?.cosmetic_id ?? 'premium_pack',
      is_active: true,
    });
    await sb.from('transactions').insert({
      user_id: s.client_reference_id, transaction_type: 'purchase',
      amount_usd: (s.amount_total ?? 0) / 100, revenue_source: 'iap',
      stripe_session_id: s.id,
    });
  }
  return new Response('ok');
});
```

### Step 5 — Test everything

1. Open the game in **two different browsers** (or one normal + one incognito).
2. Move in one window → the organism appears and moves in the other. ✅ Multiplayer works.
3. Collect green nutrients (+10) and blue crystals (+50). Press **SPACE** to bloom.
4. Bloom into the other organism — the bigger one absorbs the smaller. Death screen + leaderboard entry appear.
5. Check Supabase → **Table Editor → leaderboard** to see scores arriving.
6. Test a purchase with Stripe test card `4242 4242 4242 4242`.

---

## 🎮 How to play

| Action | Desktop | Mobile |
|---|---|---|
| Move | Mouse | Touch/drag |
| **BLOOM** | SPACE | Round button |
| Debug mode | CTRL+D | — |
| Shop | 🛍️ button | 🛍️ button |

**Core loop:** grow territory passively (+1/sec) → collect nutrients for biomass → **BLOOM** (cost: 50 biomass) for 5x growth over 3 seconds, but blooming makes you a 3x-power glass cannon: win fights you start, die to anyone bigger. 15s cooldown.

**Resonance:** stay near organisms of a similar color for +25% growth. **Boosts:** sparkles grant 5s of +speed/+attack/+shield. **Black holes:** -50 biomass, avoid them.

---

## 🗂️ Project structure

```
bloom-io/
├── index.html            entry point, ad containers, start/death screens
├── main.js               bootstrap: Phaser + Supabase auth + monetization
├── config.js             🔑 ALL your keys go here (the only file you edit)
├── scenes/GameScene.js   world, input, collisions, death/respawn
├── objects/              Player (organism), Nutrient, Obstacle (black holes, boosts)
├── network/              supabase.js (DB/auth), realtime.js (multiplayer channels)
├── monetization/         ads.js (AdSense H5), iap.js (Stripe), analytics.js
├── ui/                   HUD, Leaderboard (4 boards), Shop
├── assets/               procedural sound effects (zero downloads)
├── sql-setup.sql         full database schema + RLS — paste into Supabase
└── vercel.json           deploy config
```

## 🏗️ Architecture notes

- **Positions travel over Supabase Realtime *broadcast channels*** at 10Hz — ephemeral WebSocket messages that never touch Postgres. The DB only stores profiles (synced every 5s) and leaderboard rows (on death). This keeps a busy game comfortably inside the free tier.
- **Remote players are interpolated** (25% easing per frame) so movement is smooth despite 100ms snapshots.
- **Offline fallback:** if Supabase keys are missing or the network fails, the game still runs single-player instead of crashing.
- **Anti-cheat honesty:** like most .io games, this build is client-authoritative. RLS prevents players from writing each other's rows, usernames are sanitized, and purchases are verified server-side via the Stripe webhook. For tournament-grade anti-cheat you'd add server-side simulation later (Supabase Edge Functions or a small authoritative server).

## 💰 Monetization summary

| Source | When | Setup |
|---|---|---|
| Banner ads | Always visible | AdSense display unit |
| Interstitial | After death (3s delay, max 1/min) | H5 Games Ads `adBreak` |
| Rewarded video | Optional: respawn with full biomass | H5 Games Ads `adBreak type:reward` |
| Cosmetics | $0.99–$2.99, visual only | Stripe Payment Links |
| Battle Pass / Premium | $4.99/mo · $9.99 (removes ads) | Stripe Payment Links |

Realistic expectations: ad CPMs for web games run ~$1–3; cosmetic conversion ~0.5–2% of players. Revenue scales with traffic — distribution (TikTok clips, io game portals like iogames.space, CrazyGames submissions) matters more than anything in the code.

## 🧪 Local development (optional)

```bash
npm install
npm run dev      # vite dev server at localhost:5173
```

Or simply open the folder with any static server (`npx serve .`) — there is no required build step.

## ⚖️ Free-tier limits to know

- **Supabase free:** 500MB DB, 200 concurrent Realtime connections, 2M Realtime messages/mo. At 10Hz per player that supports roughly 50–100 simultaneous players continuously — plenty to validate. Upgrade ($25/mo) lifts this 10x.
- **Vercel free:** 100GB bandwidth/mo — tens of thousands of game sessions.

MIT License. Have fun. 🌊
