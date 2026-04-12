-- Newsletter subscribers
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  source text default 'website',
  created_at timestamptz default now()
);

alter table newsletter_subscribers enable row level security;

create policy "Public can subscribe"
on newsletter_subscribers for insert with check (true);

create policy "Public can view own"
on newsletter_subscriptions for select using (true);

-- Feedback
create table feedback (
  id uuid primary key default gen_random_uuid(),
  type text check (type in ('bug','feature','general')),
  message text not null,
  email text,
  page_url text,
  user_id uuid references auth.users(id),
  status text default 'open' check (status in ('open','reviewed','resolved')),
  created_at timestamptz default now()
);

alter table feedback enable row level security;

create policy "Anyone can submit feedback"
on feedback for insert with check (true);

create policy "Users can view own feedback"
on feedback for select using (user_id = auth.uid());

create policy "Users can view all feedback"
on feedback for select using (true);
