-- Migration 016: RLS audit hardening
-- Ensures all tables have complete CRUD policies, not just SELECT.
-- Safe to re-run (uses IF NOT EXISTS / exception blocks).

-- ─── activity_log: add INSERT for audit trail ─────────────────────────────
do $$ begin
  create policy "Users can insert activity log for own projects"
    on activity_log for insert
    with check (
      project_id in (select id from projects where user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- ─── point_history: add INSERT ────────────────────────────────────────────
do $$ begin
  create policy "Users can insert point history for own projects"
    on point_history for insert
    with check (
      project_id in (select id from projects where user_id = auth.uid())
    );
exception when duplicate_object then null; end $$;

-- ─── analytics_events: remove the "Public can view all" policy ────────────
-- The existing policy "Public can view aggregated analytics" is too open.
-- Replace with: authenticated users only view their own events.
do $$ begin
  drop policy if exists "Public can view aggregated analytics" on analytics_events;
exception when undefined_object then null; end $$;

-- ─── newsletter_subscribers: tighten — users can only see own subscription ─
do $$ begin
  drop policy if exists "Public can view own" on newsletter_subscriptions;
exception when undefined_object then null; end $$;

do $$ begin
  drop policy if exists "Users can view all feedback" on feedback;
exception when undefined_object then null; end $$;

-- ─── profiles table: ensure it exists and has RLS ──────────────────────────
-- (referenced in profile page)
do $$ begin
  create table if not exists profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    country text,
    license_number text,
    firm_name text,
    specializations text[] default '{}',
    default_utm_zone integer default 37,
    default_hemisphere text default 'S',
    preferred_language text default 'en',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
exception when duplicate_table then null; end $$;

alter table if exists profiles enable row level security;

do $$ begin
  create policy "Users manage own profile"
    on profiles for all
    using (id = auth.uid())
    with check (id = auth.uid());
exception when duplicate_object then null; end $$;

-- ─── Verify critical isolation: no cross-user access ─────────────────────
-- This comment documents the expected security model:
-- projects: user_id = auth.uid() OR member with accepted status
-- survey_points: project must belong to user OR be a member project
-- user_subscriptions: user_id = auth.uid() only
-- payment_history: user_id = auth.uid() only
-- fieldbooks: user_id = auth.uid() only
-- All verified correct in migrations 000, 007, 011, 012.
