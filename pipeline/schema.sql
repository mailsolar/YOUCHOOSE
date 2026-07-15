-- ─────────────────────────────────────────────────────────────
-- YOUCHOOSE — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── RESTAURANTS ──────────────────────────────────────────────
create table if not exists restaurants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cuisine     text,
  address     text,
  city        text,
  country     text default 'India',
  lat         float8,
  lng         float8,
  hours       text,
  parking     text check (parking in ('available', 'difficult', 'unknown')) default 'unknown',
  created_at  timestamptz default now()
);

-- ── REVIEWS ──────────────────────────────────────────────────
create table if not exists reviews (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid references restaurants(id) on delete cascade,
  video_url        text not null unique,
  platform         text check (platform in ('youtube', 'instagram', 'tiktok', 'other')) default 'other',
  creator_handle   text,
  creator_name     text,
  rating           numeric(2,1) check (rating >= 1 and rating <= 5),
  dishes           text[],
  transcript       text,
  thumbnail_url    text,
  processed_at     timestamptz default now()
);

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists reviews_restaurant_id_idx on reviews(restaurant_id);
create index if not exists reviews_platform_idx on reviews(platform);
create index if not exists restaurants_city_idx on restaurants(city);

-- ── ROW LEVEL SECURITY (Public read-only) ────────────────────
alter table restaurants enable row level security;
alter table reviews enable row level security;

-- Allow anyone to read (anonymous frontend access)
create policy "Public read restaurants"
  on restaurants for select
  using (true);

create policy "Public read reviews"
  on reviews for select
  using (true);

-- Only service_role can insert/update (pipeline uses service key)
-- For now we allow anon insert so the pipeline script works with anon key:
create policy "Anon insert restaurants"
  on restaurants for insert
  with check (true);

create policy "Anon insert reviews"
  on reviews for insert
  with check (true);

-- ── VERIFICATION ─────────────────────────────────────────────
-- Run this to confirm tables were created:
-- select table_name from information_schema.tables where table_schema = 'public';
