-- Subscription plans
create table subscription_plans (
  id text primary key,
  name text not null,
  price_kes numeric(10,2),
  price_ugx numeric(10,2),
  price_tzs numeric(10,2),
  price_ngn numeric(10,2),
  price_usd numeric(10,2),
  max_projects integer,
  max_points_per_project integer,
  features jsonb,
  is_active boolean default true
);

insert into subscription_plans values
('free', 'Free', 0, 0, 0, 0, 0, 1, 50, 
  '["quick_tools","1_project","50_points","basic_pdf"]'::jsonb, true),
('pro', 'Pro', 500, 15000, 10000, 2000, 4,
  -1, -1,
  '["unlimited_projects","unlimited_points","full_pdf","dxf_export","landxml","csv_import","offline","share_link","gps_stakeout","process_notes"]'::jsonb, true),
('team', 'Team', 2000, 60000, 40000, 8000, 15,
  -1, -1,
  '["everything_pro","5_members","realtime_collab","roles","audit_trail","branded_reports"]'::jsonb, true);

-- User subscriptions
create table user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan_id text references subscription_plans(id),
  status text default 'active' 
    check (status in ('active','cancelled','expired','trial')),
  trial_ends_at timestamptz default now() + interval '14 days',
  current_period_start timestamptz default now(),
  current_period_end timestamptz default now() + interval '30 days',
  payment_method text,
  currency text default 'KES',
  created_at timestamptz default now()
);

alter table user_subscriptions enable row level security;

create policy "Users view own subscription"
on user_subscriptions for all using (user_id = auth.uid());

-- Payment history
create table payment_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric(10,2),
  currency text default 'KES',
  status text default 'pending'
    check (status in ('pending','completed','failed','refunded')),
  payment_method text,
  transaction_id text,
  plan_id text,
  created_at timestamptz default now()
);

alter table payment_history enable row level security;

create policy "Users view own payments"
on payment_history for all using (user_id = auth.uid());
