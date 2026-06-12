-- ============================================================
-- BLOOM.IO — DATABASE SETUP
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ─────────────────────────────────────────────
-- TABLE: players (live profiles, synced every 5s)
-- ─────────────────────────────────────────────
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  username varchar(50) not null,
  color_r int default 100 check (color_r between 0 and 255),
  color_g int default 220 check (color_g between 0 and 255),
  color_b int default 150 check (color_b between 0 and 255),
  biomass float default 100,
  territory float default 1,
  x float default 0,
  y float default 0,
  kills int default 0,
  deaths int default 0,
  blooms_count int default 0,
  max_biomass_ever float default 100,
  max_territory_ever float default 1,
  cosmetic_id varchar(50),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_seen timestamptz default now(),
  unique (user_id)
);

-- ─────────────────────────────────────────────
-- TABLE: leaderboard (one row per finished run)
-- ─────────────────────────────────────────────
create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  username varchar(50) not null,
  biomass float default 0,
  territory float default 0,
  kills int default 0,
  blooms_count int default 0,
  survival_time_seconds int default 0,
  session_date date default current_date,
  score_timestamp timestamptz default now()
);

create index if not exists idx_leaderboard_biomass on public.leaderboard (biomass desc);
create index if not exists idx_leaderboard_territory on public.leaderboard (territory desc);
create index if not exists idx_leaderboard_blooms on public.leaderboard (session_date, blooms_count desc);
create index if not exists idx_leaderboard_survival on public.leaderboard (survival_time_seconds desc);

-- ─────────────────────────────────────────────
-- TABLE: cosmetics (product catalog)
-- ─────────────────────────────────────────────
create table if not exists public.cosmetics (
  id varchar(50) primary key,
  name varchar(50) not null,
  description text,
  price_usd decimal(6,2),
  price_premium_currency int,
  image_url varchar(255),
  category varchar(20) check (category in ('skin','effect','trail','pass')),
  rarity varchar(20) check (rarity in ('common','rare','epic','legendary'))
);

insert into public.cosmetics (id, name, description, price_usd, category, rarity) values
  ('glow_effect',  'Glow Effect',  'Permanent soft glow around your organism', 0.99, 'effect', 'common'),
  ('neon_skin',    'Neon Skin',    'Ultra-bright neon core',                   1.99, 'skin',   'rare'),
  ('crystal_form', 'Crystal Form', 'Rotating crystalline lattice',             2.99, 'skin',   'epic'),
  ('battle_pass',  'Battle Pass',  'Exclusive cosmetics + weekly drops',       4.99, 'pass',   'epic'),
  ('premium_pack', 'Premium Pack', 'All cosmetics + no ads forever',           9.99, 'pass',   'legendary')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────
-- TABLE: user_cosmetics (ownership — written by Stripe webhook Edge Function)
-- ─────────────────────────────────────────────
create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id varchar(50) not null references public.cosmetics(id),
  purchased_at timestamptz default now(),
  is_active boolean default false,
  unique (user_id, cosmetic_id)
);

-- ─────────────────────────────────────────────
-- TABLE: transactions (revenue audit trail)
-- ─────────────────────────────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  transaction_type varchar(20) check (transaction_type in ('ad_view','purchase','reward')),
  amount_usd decimal(8,2) default 0,
  revenue_source varchar(20) check (revenue_source in ('ads','iap','sponsorship')),
  stripe_session_id varchar(255),
  "timestamp" timestamptz default now()
);

-- ─────────────────────────────────────────────
-- TABLE: analytics_events (DAU / retention / funnel queries)
-- ─────────────────────────────────────────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  event varchar(50) not null,
  payload jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_analytics_event_date on public.analytics_events (event, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- Principle: anyone can READ public game data; you can only
-- WRITE rows that belong to you (verified via auth.uid()).
-- Cosmetics ownership is written ONLY by the service role
-- (Stripe webhook Edge Function) — clients can read, not forge.
-- ============================================================
alter table public.players enable row level security;
alter table public.leaderboard enable row level security;
alter table public.cosmetics enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.transactions enable row level security;
alter table public.analytics_events enable row level security;

-- players: public read, owner write
create policy "players_public_read" on public.players for select using (true);
create policy "players_owner_insert" on public.players for insert with check (auth.uid() = user_id);
create policy "players_owner_update" on public.players for update using (auth.uid() = user_id);
create policy "players_owner_delete" on public.players for delete using (auth.uid() = user_id);

-- leaderboard: public read, authenticated insert (own rows only)
create policy "leaderboard_public_read" on public.leaderboard for select using (true);
create policy "leaderboard_owner_insert" on public.leaderboard for insert
  with check (auth.uid() = user_id or user_id is null);

-- cosmetics catalog: public read only
create policy "cosmetics_public_read" on public.cosmetics for select using (true);

-- user_cosmetics: owner read; writes happen via service role (webhook), but
-- allow optimistic owner insert for instant UX (webhook remains source of truth)
create policy "user_cosmetics_owner_read" on public.user_cosmetics for select using (auth.uid() = user_id);
create policy "user_cosmetics_owner_insert" on public.user_cosmetics for insert with check (auth.uid() = user_id);
create policy "user_cosmetics_owner_update" on public.user_cosmetics for update using (auth.uid() = user_id);

-- transactions: owner read only (inserts via service role)
create policy "transactions_owner_read" on public.transactions for select using (auth.uid() = user_id);

-- analytics: insert-only for everyone (no reads from clients)
create policy "analytics_insert" on public.analytics_events for insert with check (true);

-- ============================================================
-- REALTIME: enable on tables the client subscribes to
-- (position broadcasts use channels, not the DB — this is for
-- leaderboard live updates and player profile changes)
-- ============================================================
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.leaderboard;
alter publication supabase_realtime add table public.cosmetics;

-- ============================================================
-- HOUSEKEEPING: purge stale players (no heartbeat in 2 minutes).
-- Schedule with pg_cron (Database → Extensions → enable pg_cron), then:
--   select cron.schedule('purge-stale-players', '* * * * *',
--     $$delete from public.players where last_seen < now() - interval '2 minutes'$$);
-- ============================================================

-- ============================================================
-- HANDY ANALYTICS QUERIES (run anytime in SQL Editor)
-- ============================================================
-- Daily active users:
--   select created_at::date as day, count(distinct user_id) as dau
--   from analytics_events where event = 'session_start'
--   group by 1 order by 1 desc;
--
-- Weekly leaderboard reset (optional, keeps competition fresh):
--   select cron.schedule('weekly-lb-reset', '0 0 * * 1',
--     $$delete from public.leaderboard where score_timestamp < now() - interval '7 days'$$);
