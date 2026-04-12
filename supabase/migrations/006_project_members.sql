-- Project members for role-based access
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text check (role in ('owner','supervisor','surveyor','viewer')) default 'viewer',
  invited_email text,
  status text default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now(),
  unique(project_id, user_id),
  unique(project_id, invited_email)
);

create index if not exists idx_project_members_project on project_members(project_id);
create index if not exists idx_project_members_user on project_members(user_id);

alter table project_members enable row level security;

-- Project owners can manage members
create policy "Project owners manage members"
on project_members for all using (
  project_id in (
    select id from projects where user_id = auth.uid()
  )
);

-- Users can view their own memberships
create policy "Members view their own membership"
on project_members for select using (
  user_id = auth.uid()
);

-- Function to add owner as member when project is created
create or replace function add_project_owner()
returns trigger as $$
begin
  insert into project_members (project_id, user_id, role, status)
  values (new.id, new.user_id, 'owner', 'accepted')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists add_owner_member on projects;
create trigger add_owner_member
after insert on projects
for each row execute function add_project_owner();
