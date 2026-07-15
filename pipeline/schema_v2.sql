-- ─────────────────────────────────────────────────────────────
-- YOUCHOOSE — Schema Update v2: Automation Tables
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────

-- ── SCRAPED_URLS — deduplication tracker ─────────────────────
create table if not exists scraped_urls (
  url           text primary key,
  status        text check (status in ('success', 'failed', 'skipped')) default 'skipped',
  error_message text,
  processed_at  timestamptz default now()
);

-- ── API_QUOTA — daily Gemini quota tracker ───────────────────
create table if not exists api_quota (
  date      date primary key default current_date,
  used      int default 0,
  "limit"   int default 1500,
  reset_at  timestamptz
);

-- ── SCRAPE_JOBS — admin-triggered batch jobs ─────────────────
create table if not exists scrape_jobs (
  id               uuid primary key default gen_random_uuid(),
  status           text check (status in ('pending', 'running', 'done', 'failed')) default 'pending',
  triggered_by     text,
  started_at       timestamptz,
  finished_at      timestamptz,
  videos_processed int default 0,
  videos_added     int default 0,
  error_log        text,
  created_at       timestamptz default now()
);

-- ── USERS — auth / role management ───────────────────────────
create table if not exists user_profiles (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text check (role in ('admin', 'user')) default 'user',
  created_at timestamptz default now()
);

-- ── UPDATE RESTAURANTS — add ranking columns ─────────────────
alter table restaurants add column if not exists rank_score float8 default 0;
alter table restaurants add column if not exists review_count int default 0;
alter table restaurants add column if not exists category text default 'restaurant';

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists scraped_urls_status_idx on scraped_urls(status);
create index if not exists scrape_jobs_status_idx on scrape_jobs(status);
create index if not exists restaurants_rank_idx on restaurants(rank_score desc);
create index if not exists user_profiles_email_idx on user_profiles(email);

-- ── RLS POLICIES ─────────────────────────────────────────────
alter table scraped_urls enable row level security;
alter table api_quota enable row level security;
alter table scrape_jobs enable row level security;
alter table user_profiles enable row level security;

-- Public read for quota/jobs (so admin panel can read)
create policy "Public read scraped_urls" on scraped_urls for select using (true);
create policy "Public read api_quota" on api_quota for select using (true);
create policy "Public read scrape_jobs" on scrape_jobs for select using (true);
create policy "Public read user_profiles" on user_profiles for select using (true);

-- Anon insert/update for pipeline
create policy "Anon insert scraped_urls" on scraped_urls for insert with check (true);
create policy "Anon update scraped_urls" on scraped_urls for update using (true);
create policy "Anon insert api_quota" on api_quota for insert with check (true);
create policy "Anon update api_quota" on api_quota for update using (true);
create policy "Anon insert scrape_jobs" on scrape_jobs for insert with check (true);
create policy "Anon update scrape_jobs" on scrape_jobs for update using (true);
create policy "Anon insert user_profiles" on user_profiles for insert with check (true);

-- Allow updates on restaurants for rank_score recomputation
create policy "Anon update restaurants" on restaurants for update using (true);

-- ── FUNCTION: Recompute rank_score for a restaurant ──────────
create or replace function recompute_rank(rid uuid)
returns void as $$
declare
  avg_rat numeric;
  cnt int;
  score float8;
begin
  select coalesce(avg(rating), 0), count(*)
    into avg_rat, cnt
    from reviews
    where restaurant_id = rid and rating is not null;

  -- Formula: 50% avg rating + 30% log popularity + 20% recency
  score := (avg_rat / 5.0) * 0.5
         + least(ln(greatest(cnt, 1)) / ln(50), 1.0) * 0.3
         + 0.2;  -- recency placeholder (all recent for now)

  update restaurants
    set rank_score = round(score::numeric, 3),
        review_count = cnt
    where id = rid;
end;
$$ language plpgsql;
