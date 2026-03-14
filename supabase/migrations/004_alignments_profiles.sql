-- Alignments for road/profile surveys
create table if not exists alignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now()
);

-- Chainage points along alignment
create table if not exists chainage_points (
  id uuid primary key default gen_random_uuid(),
  alignment_id uuid references alignments(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  point_name text,
  chainage numeric(12,3) not null,
  easting numeric(14,4),
  northing numeric(14,4),
  elevation numeric(10,4),
  created_at timestamptz default now()
);

-- Cross section observations
create table if not exists cross_sections (
  id uuid primary key default gen_random_uuid(),
  alignment_id uuid references alignments(id) on delete cascade,
  chainage numeric(12,3) not null,
  offset_distance numeric(10,4) not null,
  offset_direction text check (offset_direction in ('left','center','right')),
  elevation numeric(10,4),
  created_at timestamptz default now()
);

-- Add survey type and client info to projects
alter table projects
  add column if not exists survey_type text
    check (survey_type in (
      'boundary','topographic','road',
      'construction','control','leveling','other'
    )),
  add column if not exists client_name text,
  add column if not exists surveyor_name text,
  add column if not exists is_active boolean default true;

-- RLS for all new tables
alter table alignments enable row level security;
alter table chainage_points enable row level security;
alter table cross_sections enable row level security;

-- Alignment policies
create policy "Users own alignments"
on alignments for all using (
  project_id in (select id from projects where user_id = auth.uid())
);

-- Chainage points policies
create policy "Users own chainage points"
on chainage_points for all using (
  project_id in (select id from projects where user_id = auth.uid())
);

-- Cross sections policies
create policy "Users own cross sections"
on cross_sections for all using (
  alignment_id in (
    select id from alignments where project_id in (
      select id from projects where user_id = auth.uid()
    )
  )
);

-- Create indexes
create index if not exists idx_chainage_points_alignment on chainage_points(alignment_id);
create index if not exists idx_cross_sections_alignment on cross_sections(alignment_id);
create index if not exists idx_alignments_project on alignments(project_id);
