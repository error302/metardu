-- Point history tracking
create table if not exists point_history (
  id uuid primary key default gen_random_uuid(),
  point_id uuid references survey_points(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  changed_by uuid references auth.users(id),
  change_type text check (change_type in ('insert','update','delete')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz default now()
);

create index if not exists idx_point_history_point on point_history(point_id);
create index if not exists idx_point_history_project on point_history(project_id);

alter table point_history enable row level security;

create policy "Users view own project history"
on point_history for select using (
  project_id in (
    select id from projects where user_id = auth.uid()
  )
);

-- Activity log
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  user_email text,
  action text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_activity_log_project on activity_log(project_id);

alter table activity_log enable row level security;

create policy "Project members view activity"
on activity_log for select using (
  project_id in (
    select id from projects where user_id = auth.uid()
  )
);

-- Function to log point changes
create or replace function log_point_changes()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into point_history 
      (point_id, project_id, changed_by, change_type, new_values)
    values (
      new.id, new.project_id, auth.uid(),
      'insert', to_jsonb(new)
    );
  elsif TG_OP = 'UPDATE' then
    insert into point_history
      (point_id, project_id, changed_by, change_type, old_values, new_values)
    values (
      new.id, new.project_id, auth.uid(),
      'update', to_jsonb(old), to_jsonb(new)
    );
  elsif TG_OP = 'DELETE' then
    insert into point_history
      (point_id, project_id, changed_by, change_type, old_values)
    values (
      old.id, old.project_id, auth.uid(),
      'delete', to_jsonb(old)
    );
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Trigger for point changes
drop trigger if exists survey_points_history on survey_points;
create trigger survey_points_history
after insert or update or delete on survey_points
for each row execute function log_point_changes();

-- Function to log project activities
create or replace function log_project_activity(
  p_project_id uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void as $$
begin
  insert into activity_log (project_id, user_id, user_email, action, details)
  select 
    p_project_id,
    auth.uid(),
    auth.jwt()->>'email',
    p_action,
    p_details
  where auth.uid() is not null;
end;
$$ language plpgsql security definer;
