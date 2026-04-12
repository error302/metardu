-- Analytics events table
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  event text not null,
  properties jsonb,
  url text,
  created_at timestamptz default now()
);

alter table analytics_events enable row level security;

create policy "Anyone can insert analytics"
on analytics_events for insert with check (true);

create policy "Users can view own analytics"
on analytics_events for select using (user_id = auth.uid());

create policy "Public can view aggregated analytics"
on analytics_events for select using (true);

-- Index for faster queries
create index analytics_event_type on analytics_events(event);
create index analytics_created_at on analytics_events(created_at);
