// ============================================================
// SUPABASE — auth, persistence and leaderboard queries.
// Loaded from CDN as an ES module so no build step is required.
//
// DESIGN NOTE (free-tier friendly):
//   Real-time positions go over Supabase Realtime BROADCAST channels
//   (see realtime.js) — ephemeral, fast, doesn't touch Postgres.
//   The database only stores: player profiles (synced every 5s) and
//   leaderboard entries (written on death). This keeps you comfortably
//   inside the free tier even with hundreds of concurrent players.
// ============================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from '../config.js';

let supabase = null;

/** Lazily create the client; throws a clear error if keys are missing. */
export function getClient() {
  if (supabase) return supabase;
  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.startsWith('YOUR_')) {
    throw new Error('Supabase not configured — edit config.js');
  }
  supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    realtime: { params: { eventsPerSecond: 15 } },
  });
  return supabase;
}

/** Anonymous sign-in with one retry. Returns the session (or null offline). */
export async function initAuth() {
  const sb = getClient();
  // Reuse existing session if the player refreshed the page
  const { data: existing } = await sb.auth.getSession();
  if (existing?.session) return existing.session;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await sb.auth.signInAnonymously();
    if (!error) return data.session;
    await new Promise((r) => setTimeout(r, 800));   // brief backoff, then retry
  }
  throw new Error('Anonymous auth failed');
}

/** Insert (or refresh) this player's profile row. */
export async function createPlayer(username, color, userId) {
  const sb = getClient();
  const row = {
    user_id: userId,
    username,
    color_r: color.r, color_g: color.g, color_b: color.b,
    biomass: CONFIG.START_BIOMASS,
    territory: 1,
    x: 0, y: 0,
    last_seen: new Date().toISOString(),
  };
  const { data, error } = await sb.from('players')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Persist current stats (called every DB_SYNC_RATE ms, not every frame). */
export async function updatePlayerRow(id, player) {
  const sb = getClient();
  const { error } = await sb.from('players').update({
    x: Math.round(player.x), y: Math.round(player.y),
    biomass: Math.round(player.biomass),
    territory: Math.round(player.territory * 10) / 10,
    kills: player.kills,
    blooms_count: player.bloomsCount,
    max_biomass_ever: Math.round(player.maxBiomassEver),
    max_territory_ever: Math.round(player.maxTerritoryEver),
    last_seen: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

/** Remove the player row on clean disconnect. */
export async function deletePlayer(id) {
  const sb = getClient();
  await sb.from('players').delete().eq('id', id);
}

/** Save a finished run to the global leaderboard (called on death). */
export async function saveLeaderboardEntry(username, stats, userId) {
  const sb = getClient();
  const { error } = await sb.from('leaderboard').insert({
    user_id: userId,
    username,
    biomass: stats.biomass,
    territory: stats.territory,
    kills: stats.kills,
    blooms_count: stats.blooms,
    survival_time_seconds: stats.survivalSeconds,
    session_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
}

/**
 * Fetch a leaderboard.
 * @param {'biomass'|'territory'|'blooms_count'|'survival_time_seconds'} orderBy
 * @param {number} limit
 * @param {boolean} todayOnly restrict to today's sessions (for "Most blooms in 24h")
 */
export async function fetchLeaderboard(orderBy = 'biomass', limit = 100, todayOnly = false) {
  const sb = getClient();
  let q = sb.from('leaderboard')
    .select('username, biomass, territory, kills, blooms_count, survival_time_seconds')
    .order(orderBy, { ascending: false })
    .limit(limit);
  if (todayOnly) q = q.eq('session_date', new Date().toISOString().slice(0, 10));
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Fetch a single player profile by id. */
export async function getPlayerByID(id) {
  const sb = getClient();
  const { data, error } = await sb.from('players').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Record a purchased cosmetic (fulfillment confirmed by Stripe webhook → Edge Function). */
export async function saveCosmetic(userId, cosmeticId) {
  const sb = getClient();
  const { error } = await sb.from('user_cosmetics').upsert(
    { user_id: userId, cosmetic_id: cosmeticId, is_active: true },
    { onConflict: 'user_id,cosmetic_id' },
  );
  if (error) throw error;
}

/** Fetch cosmetics the user owns. */
export async function fetchOwnedCosmetics(userId) {
  if (!userId) return [];
  const sb = getClient();
  const { data, error } = await sb.from('user_cosmetics')
    .select('cosmetic_id, is_active').eq('user_id', userId);
  if (error) return [];
  return data || [];
}

/** Log an analytics event row (fire-and-forget). */
export async function logAnalyticsEvent(userId, event, payload) {
  try {
    const sb = getClient();
    await sb.from('analytics_events').insert({ user_id: userId, event, payload });
  } catch { /* analytics must never break gameplay */ }
}
