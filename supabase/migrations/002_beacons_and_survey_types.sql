-- Metardu Community Beacons Table
-- Run this in Supabase SQL Editor

-- Create public_beacons table
create table if not exists public_beacons (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id),
  name text not null,
  easting numeric(14,4) not null,
  northing numeric(14,4) not null,
  elevation numeric(10,4),
  utm_zone integer not null default 37,
  hemisphere text default 'S',
  authority text,
  beacon_type text check (beacon_type in (
    'trig', 'control', 'boundary', 'benchmark', 'gnss', 'other'
  )),
  description text,
  verified boolean default false,
  status text default 'pending' 
    check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz default now()
);

-- Enable RLS
alter table public_beacons enable row level security;

-- Policy: Anyone can view verified beacons
create policy "Anyone can view verified beacons"
on public_beacons for select
using (status = 'verified');

-- Policy: Authenticated users can submit beacons
create policy "Authenticated users can submit beacons"
on public_beacons for insert
to authenticated
with check (submitted_by = auth.uid() or submitted_by is null);

-- Policy: Users can update their own beacons
create policy "Users can update own beacons"
on public_beacons for update
using (submitted_by = auth.uid());

-- Add survey_type and is_active to projects
alter table projects 
add column if not exists survey_type text
check (survey_type in (
  'boundary', 'topographic', 'road', 
  'construction', 'control', 'leveling', 'other'
));

alter table projects 
add column if not exists is_active boolean default true;

-- Add beacon_count column for quick reference
alter table projects
add column if not exists beacon_count integer default 0;
