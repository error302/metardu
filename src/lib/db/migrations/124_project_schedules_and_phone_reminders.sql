-- Project-linked field scheduling and durable, user-scoped reminder delivery.
-- Additive only: no existing customer table, row or applied checksum is changed.
CREATE TABLE public.job_schedule (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  location VARCHAR(300) NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  time_zone VARCHAR(100) NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 1440),
  reminder_minutes INTEGER[] NOT NULL DEFAULT ARRAY[1440,60],
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','in_progress','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  create_request_hash TEXT NOT NULL CHECK (create_request_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id,user_id),
  CHECK (cardinality(reminder_minutes) <= 5
    AND array_position(reminder_minutes,NULL) IS NULL
    AND (cardinality(reminder_minutes)=0 OR (0 <= ALL(reminder_minutes) AND 20160 >= ALL(reminder_minutes))))
);
CREATE INDEX job_schedule_owner_start ON public.job_schedule(user_id,starts_at,id);
CREATE INDEX job_schedule_project ON public.job_schedule(project_id);

-- Read the CURRENT request identity, not a caller-supplied account. The helper
-- does not grant parent-project access or change existing project policies.
CREATE FUNCTION public.survey_schedule_project_access(target UUID, require_write BOOLEAN DEFAULT FALSE)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = pg_catalog,public AS $$
  SELECT COALESCE((
    SELECT p.user_id IS NOT NULL AND (
      (p.organization_id IS NULL AND (
        p.user_id::text = NULLIF(current_setting('request.user_id',true),'')
        OR EXISTS (SELECT 1 FROM public.project_members m
          WHERE m.project_id=p.id
            AND m.user_id::text=NULLIF(current_setting('request.user_id',true),'')
            AND m.role=ANY(CASE WHEN require_write
              THEN ARRAY['super_admin','org_admin','project_manager','surveyor']
              ELSE ARRAY['super_admin','org_admin','project_manager','surveyor','viewer'] END))
      ))
      OR (p.organization_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.organization_members m
        JOIN public.organizations o ON o.id=m.organization_id
        WHERE m.organization_id=p.organization_id AND m.is_active=TRUE AND o.is_active=TRUE
          AND m.user_id::text=NULLIF(current_setting('request.user_id',true),'')
          AND (NOT require_write OR m.role IN ('org_admin','project_manager','surveyor'))
      ))
    ) FROM public.projects p WHERE p.id=target
  ),FALSE);
$$;

CREATE FUNCTION public.enforce_scheduled_project_binding()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE expected_organization UUID;
BEGIN
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Scheduled job ownership cannot be reassigned.' USING ERRCODE='42501';
  END IF;
  -- An actual project deletion may detach a retained job through its FK.
  IF NEW.project_id IS NULL THEN
    NEW.organization_id=NULL;
    RETURN NEW;
  END IF;
  IF TG_OP='INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    SELECT p.organization_id INTO expected_organization FROM public.projects p
      WHERE p.id=NEW.project_id AND p.user_id IS NOT NULL
        AND public.survey_schedule_project_access(p.id,FALSE);
    IF NOT FOUND OR NEW.organization_id IS DISTINCT FROM expected_organization THEN
      RAISE EXCEPTION 'The scheduled project scope is not available.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scheduled_project_binding BEFORE INSERT OR UPDATE OF project_id,organization_id,user_id
  ON public.job_schedule FOR EACH ROW EXECUTE FUNCTION public.enforce_scheduled_project_binding();

CREATE TABLE public.survey_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE CHECK (endpoint_hash ~ '^[a-f0-9]{64}$'),
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 10 AND 4096),
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accepted_at TIMESTAMPTZ,
  UNIQUE(id,user_id)
);
CREATE INDEX survey_push_owner ON public.survey_push_subscriptions(user_id) WHERE active=TRUE;

CREATE TABLE public.survey_reminder_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  schedule_id UUID NOT NULL,
  schedule_version INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('confirmation','reminder')),
  lead_minutes INTEGER NOT NULL CHECK (lead_minutes BETWEEN 0 AND 20160),
  due_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','done','cancelled')),
  lease_token UUID,
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  last_error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY(schedule_id,user_id) REFERENCES public.job_schedule(id,user_id) ON DELETE CASCADE,
  UNIQUE(schedule_id,schedule_version,kind,lead_minutes),
  UNIQUE(id,user_id),
  CHECK (expires_at > due_at)
);
CREATE INDEX survey_reminder_due ON public.survey_reminder_outbox(due_at,next_attempt_at,id)
  WHERE status IN ('pending','sending');
CREATE INDEX survey_reminder_owner ON public.survey_reminder_outbox(user_id,created_at DESC);

CREATE TABLE public.survey_push_deliveries (
  outbox_id UUID NOT NULL,
  subscription_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('accepted','retry','expired')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  provider_status INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(outbox_id,subscription_id),
  FOREIGN KEY(outbox_id,user_id) REFERENCES public.survey_reminder_outbox(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(subscription_id,user_id) REFERENCES public.survey_push_subscriptions(id,user_id) ON DELETE CASCADE
);

ALTER TABLE public.job_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_owner_read ON public.job_schedule FOR SELECT
  USING (user_id::text=NULLIF(current_setting('request.user_id',true),''));
CREATE POLICY schedule_owner_insert ON public.job_schedule FOR INSERT
  WITH CHECK (user_id::text=NULLIF(current_setting('request.user_id',true),'') AND project_id IS NOT NULL);
CREATE POLICY schedule_owner_update ON public.job_schedule FOR UPDATE
  USING (user_id::text=NULLIF(current_setting('request.user_id',true),''))
  WITH CHECK (user_id::text=NULLIF(current_setting('request.user_id',true),''));
CREATE POLICY schedule_dispatcher ON public.job_schedule FOR SELECT
  USING (current_setting('request.access_role',true)='survey_reminders');

ALTER TABLE public.survey_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_owner ON public.survey_push_subscriptions FOR ALL
  USING (user_id::text=NULLIF(current_setting('request.user_id',true),''))
  WITH CHECK (user_id::text=NULLIF(current_setting('request.user_id',true),''));
CREATE POLICY push_dispatcher ON public.survey_push_subscriptions FOR ALL
  USING (current_setting('request.access_role',true)='survey_reminders')
  WITH CHECK (current_setting('request.access_role',true)='survey_reminders');

ALTER TABLE public.survey_reminder_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_owner_read ON public.survey_reminder_outbox FOR SELECT
  USING (user_id::text=NULLIF(current_setting('request.user_id',true),''));
CREATE POLICY reminder_owner_insert ON public.survey_reminder_outbox FOR INSERT
  WITH CHECK (user_id::text=NULLIF(current_setting('request.user_id',true),'')
    AND EXISTS (SELECT 1 FROM public.job_schedule j WHERE j.id=schedule_id AND j.user_id=survey_reminder_outbox.user_id));
CREATE POLICY reminder_dispatcher ON public.survey_reminder_outbox FOR ALL
  USING (current_setting('request.access_role',true)='survey_reminders')
  WITH CHECK (current_setting('request.access_role',true)='survey_reminders');

ALTER TABLE public.survey_push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY delivery_owner_read ON public.survey_push_deliveries FOR SELECT
  USING (user_id::text=NULLIF(current_setting('request.user_id',true),''));
CREATE POLICY delivery_dispatcher ON public.survey_push_deliveries FOR ALL
  USING (current_setting('request.access_role',true)='survey_reminders')
  WITH CHECK (current_setting('request.access_role',true)='survey_reminders');

-- DOWN (manual rollback only): retained jobs and delivery receipts must survive
-- application rollback. Use a reviewed forward migration, never DROP customer data.
DO $$ BEGIN RAISE EXCEPTION 'Scheduling migration is forward-only; retain customer jobs and reminder receipts.'; END $$;
