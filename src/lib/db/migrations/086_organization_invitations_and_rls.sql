-- Firm workspaces: fix recursive membership policies and add verifiable invites.

CREATE OR REPLACE FUNCTION public.is_active_organization_admin(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS member
    WHERE member.organization_id = target_organization_id
      AND member.user_id::text = NULLIF(current_setting('request.user_id', true), '')
      AND member.role = 'org_admin'
      AND member.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_organization_role(
  target_organization_id UUID,
  allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_members AS member
     WHERE member.organization_id = target_organization_id
       AND member.user_id::text = NULLIF(current_setting('request.user_id', true), '')
       AND member.is_active = TRUE
       AND (allowed_roles IS NULL OR member.role = ANY(allowed_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_project_data(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN project.organization_id IS NULL THEN TRUE
    WHEN project.user_id::text = NULLIF(current_setting('request.user_id', true), '') THEN TRUE
    ELSE public.has_active_organization_role(project.organization_id)
  END
    FROM public.projects AS project
   WHERE project.id = target_project_id;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project_data(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN project.organization_id IS NULL THEN TRUE
    WHEN project.user_id::text = NULLIF(current_setting('request.user_id', true), '') THEN TRUE
    ELSE public.has_active_organization_role(project.organization_id, ARRAY['org_admin', 'project_manager', 'surveyor'])
  END
    FROM public.projects AS project
   WHERE project.id = target_project_id;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_organization_projects(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_active_organization_role(target_organization_id, ARRAY['org_admin', 'project_manager']);
$$;

-- Resolve the current owner subscription inside PostgreSQL so team-seat checks
-- remain current for invited administrators as well as the original owner.
CREATE OR REPLACE FUNCTION public.organization_subscription_limit(target_organization_id UUID)
RETURNS TABLE(effective_plan TEXT, max_seats INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  organization_owner UUID;
  stored_plan TEXT;
  stored_limit INTEGER;
  subscription_plan TEXT;
  subscription_status TEXT;
  trial_ends_at TIMESTAMPTZ;
  current_period_end TIMESTAMPTZ;
  purchased_seats INTEGER;
  resolved_plan TEXT;
  base_seats INTEGER;
BEGIN
  SELECT organization.owner_id, COALESCE(organization.plan, 'free'),
         COALESCE(organization.max_seats, 1)
    INTO organization_owner, stored_plan, stored_limit
    FROM public.organizations AS organization
   WHERE organization.id = target_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT subscription.plan_id, subscription.status, subscription.trial_ends_at,
         subscription.current_period_end, COALESCE(subscription.seat_count, 0)
    INTO subscription_plan, subscription_status, trial_ends_at,
         current_period_end, purchased_seats
    FROM public.user_subscriptions AS subscription
   WHERE subscription.user_id = organization_owner
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT stored_plan, stored_limit;
    RETURN;
  END IF;

  resolved_plan := COALESCE(subscription_plan, 'free');
  IF subscription_status = 'trial' THEN
    IF trial_ends_at IS NOT NULL AND trial_ends_at < NOW() THEN
      resolved_plan := 'free';
    END IF;
  ELSIF subscription_status IS DISTINCT FROM 'active' THEN
    resolved_plan := 'free';
  ELSIF current_period_end IS NOT NULL AND current_period_end < NOW() THEN
    resolved_plan := 'free';
  END IF;

  IF resolved_plan NOT IN ('free', 'pro', 'team', 'firm', 'enterprise') THEN
    resolved_plan := 'free';
  END IF;

  base_seats := CASE resolved_plan
    WHEN 'enterprise' THEN -1
    WHEN 'firm' THEN 5
    WHEN 'team' THEN 3
    ELSE 1
  END;
  IF base_seats >= 0 THEN
    base_seats := base_seats + GREATEST(COALESCE(purchased_seats, 0), 0);
  END IF;
  RETURN QUERY SELECT resolved_plan, base_seats;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_organization_role(
  target_organization_id UUID,
  allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.organization_members AS member
      JOIN public.organizations AS organization
        ON organization.id = member.organization_id
     WHERE member.organization_id = target_organization_id
       AND member.user_id::text = NULLIF(current_setting('request.user_id', true), '')
       AND member.is_active = TRUE
       AND organization.is_active = TRUE
       AND (allowed_roles IS NULL OR member.role::TEXT = ANY(allowed_roles))
       AND EXISTS (
         SELECT 1 FROM public.organization_subscription_limit(target_organization_id) AS entitlement
          WHERE entitlement.effective_plan IN ('team', 'firm', 'enterprise')
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.list_organization_members(target_organization_id UUID)
RETURNS TABLE(
  member_id UUID,
  user_id UUID,
  role TEXT,
  accepted_at TIMESTAMPTZ,
  email TEXT,
  full_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_active_organization_admin(target_organization_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT member.id, member.user_id, member.role::TEXT, member.accepted_at,
           account.email::TEXT, COALESCE(account.full_name, '')::TEXT
      FROM public.organization_members AS member
      JOIN public.users AS account ON account.id = member.user_id
     WHERE member.organization_id = target_organization_id
       AND member.is_active = TRUE
     ORDER BY CASE WHEN member.role = 'org_admin' THEN 0 ELSE 1 END,
              lower(COALESCE(account.full_name, account.email));
END;
$$;

CREATE OR REPLACE FUNCTION public.organization_has_active_member_email(
  target_organization_id UUID,
  target_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_active_organization_admin(target_organization_id) THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.organization_members AS member
      JOIN public.users AS account ON account.id = member.user_id
     WHERE member.organization_id = target_organization_id
       AND member.is_active = TRUE
       AND lower(account.email) = lower(target_email)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_project_child_data(
  parent_table TEXT,
  parent_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  CASE parent_table
    WHEN 'parcel_traverses' THEN
      SELECT public.can_read_project_data(parent.project_id) INTO allowed
        FROM public.parcel_traverses AS parent WHERE parent.id = parent_id;
    WHEN 'level_networks' THEN
      SELECT public.can_read_project_data(parent.project_id) INTO allowed
        FROM public.level_networks AS parent WHERE parent.id = parent_id;
    WHEN 'road_alignments' THEN
      SELECT public.can_read_project_data(parent.project_id) INTO allowed
        FROM public.road_alignments AS parent WHERE parent.id = parent_id;
    ELSE
      RETURN FALSE;
  END CASE;
  RETURN COALESCE(allowed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_project_child_data(
  parent_table TEXT,
  parent_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  CASE parent_table
    WHEN 'parcel_traverses' THEN
      SELECT public.can_write_project_data(parent.project_id) INTO allowed
        FROM public.parcel_traverses AS parent WHERE parent.id = parent_id;
    WHEN 'level_networks' THEN
      SELECT public.can_write_project_data(parent.project_id) INTO allowed
        FROM public.level_networks AS parent WHERE parent.id = parent_id;
    WHEN 'road_alignments' THEN
      SELECT public.can_write_project_data(parent.project_id) INTO allowed
        FROM public.road_alignments AS parent WHERE parent.id = parent_id;
    ELSE
      RETURN FALSE;
  END CASE;
  RETURN COALESCE(allowed, FALSE);
END;
$$;

-- The former org_admin_all_members policy queried organization_members from
-- its own policy expression, which can recurse. Move that lookup into a
-- SECURITY DEFINER predicate and keep ordinary row policies non-recursive.
DROP POLICY IF EXISTS "org_admin_all_members" ON public.organization_members;
DROP POLICY IF EXISTS "self_read_org_memberships" ON public.organization_members;

CREATE POLICY "self_read_org_memberships" ON public.organization_members
  FOR SELECT
  USING (user_id::text = NULLIF(current_setting('request.user_id', true), ''));

CREATE POLICY "org_admin_manage_members" ON public.organization_members
  FOR ALL
  USING (
    organization_id = public.current_org_id()
    AND public.is_active_organization_admin(organization_id)
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_active_organization_admin(organization_id)
  );

-- Let a firm owner bootstrap their first admin membership after creating the
-- organization. The owner check uses the organizations table's owner policy.
DROP POLICY IF EXISTS "org_owner_bootstrap_admin_membership" ON public.organization_members;
CREATE POLICY "org_owner_bootstrap_admin_membership" ON public.organization_members
  FOR INSERT
  WITH CHECK (
    user_id::text = NULLIF(current_setting('request.user_id', true), '')
    AND role = 'org_admin'
    AND is_active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.organizations AS organization
      WHERE organization.id = organization_id
        AND organization.owner_id::text = NULLIF(current_setting('request.user_id', true), '')
    )
  );

-- Firm roles have distinct rights: firm admins/project managers manage
-- project records, surveyors can write project data, and viewers can only
-- read. Keep personal projects on their existing owner-only behavior.
DROP POLICY IF EXISTS "owner_all_projects" ON public.projects;
CREATE POLICY "owner_all_projects" ON public.projects
  FOR ALL
  USING (
    organization_id IS NULL
    AND user_id::text = NULLIF(current_setting('request.user_id', true), '')
  )
  WITH CHECK (
    organization_id IS NULL
    AND user_id::text = NULLIF(current_setting('request.user_id', true), '')
  );

DROP POLICY IF EXISTS "org_member_all_projects" ON public.projects;
DROP POLICY IF EXISTS "org_member_read_projects" ON public.projects;
DROP POLICY IF EXISTS "org_member_insert_projects" ON public.projects;
DROP POLICY IF EXISTS "org_member_update_projects" ON public.projects;
DROP POLICY IF EXISTS "org_member_delete_projects" ON public.projects;

CREATE POLICY "org_member_read_projects" ON public.projects
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND (
      user_id::text = NULLIF(current_setting('request.user_id', true), '')
      OR (organization_id = public.current_org_id()
          AND public.has_active_organization_role(organization_id))
    )
  );

CREATE POLICY "org_member_insert_projects" ON public.projects
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_org_id()
    AND public.can_manage_organization_projects(organization_id)
  );

CREATE POLICY "org_member_update_projects" ON public.projects
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND (
      user_id::text = NULLIF(current_setting('request.user_id', true), '')
      OR (organization_id = public.current_org_id()
          AND public.can_manage_organization_projects(organization_id))
    )
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND (
      user_id::text = NULLIF(current_setting('request.user_id', true), '')
      OR (organization_id = public.current_org_id()
          AND public.can_manage_organization_projects(organization_id))
    )
  );

CREATE POLICY "org_member_delete_projects" ON public.projects
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND (
      user_id::text = NULLIF(current_setting('request.user_id', true), '')
      OR (organization_id = public.current_org_id()
          AND public.can_manage_organization_projects(organization_id))
    )
  );

-- The legacy project_id RLS policies are permissive. These restrictive
-- guards compose with them so a role can never gain more rights than its
-- firm role allows. Surveyors may write project records; viewers are read-only.
DO $$
DECLARE
  project_table RECORD;
BEGIN
  FOR project_table IN
    SELECT DISTINCT namespace.nspname AS schema_name, relation.relname AS table_name
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute AS attribute ON attribute.attrelid = relation.oid
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('r', 'p')
       AND relation.relrowsecurity = TRUE
       AND attribute.attname = 'project_id'
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS metardu_project_role_select_guard ON %I.%I', project_table.schema_name, project_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_project_role_insert_guard ON %I.%I', project_table.schema_name, project_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_project_role_update_guard ON %I.%I', project_table.schema_name, project_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_project_role_delete_guard ON %I.%I', project_table.schema_name, project_table.table_name);
    EXECUTE format(
      'CREATE POLICY metardu_project_role_select_guard ON %I.%I AS RESTRICTIVE FOR SELECT USING (project_id IS NULL OR public.can_read_project_data(project_id))',
      project_table.schema_name, project_table.table_name
    );
    EXECUTE format(
      'CREATE POLICY metardu_project_role_insert_guard ON %I.%I AS RESTRICTIVE FOR INSERT WITH CHECK (project_id IS NULL OR public.can_write_project_data(project_id))',
      project_table.schema_name, project_table.table_name
    );
    EXECUTE format(
      'CREATE POLICY metardu_project_role_update_guard ON %I.%I AS RESTRICTIVE FOR UPDATE USING (project_id IS NULL OR public.can_read_project_data(project_id)) WITH CHECK (project_id IS NULL OR public.can_write_project_data(project_id))',
      project_table.schema_name, project_table.table_name
    );
    EXECUTE format(
      'CREATE POLICY metardu_project_role_delete_guard ON %I.%I AS RESTRICTIVE FOR DELETE USING (project_id IS NULL OR public.can_write_project_data(project_id))',
      project_table.schema_name, project_table.table_name
    );
  END LOOP;
END;
$$;

-- Several legacy engineering tables reach a project through a parent row
-- (for example traverse_observations -> parcel_traverses -> projects).
-- Add the same role boundary to every RLS-enabled child table with one of
-- these known foreign keys; unrelated tables and personal rows keep their
-- existing policies.
DO $$
DECLARE
  child_table RECORD;
  policy_prefix TEXT;
BEGIN
  FOR child_table IN
    SELECT DISTINCT child_namespace.nspname AS schema_name,
                    child_relation.relname AS table_name,
                    child_attribute.attname AS foreign_key_column,
                    parent_relation.relname AS parent_table
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS child_relation ON child_relation.oid = constraint_row.conrelid
      JOIN pg_namespace AS child_namespace ON child_namespace.oid = child_relation.relnamespace
      JOIN pg_attribute AS child_attribute
        ON child_attribute.attrelid = child_relation.oid
       AND child_attribute.attnum = constraint_row.conkey[1]
      JOIN pg_class AS parent_relation ON parent_relation.oid = constraint_row.confrelid
      JOIN pg_attribute AS parent_attribute
        ON parent_attribute.attrelid = parent_relation.oid
       AND parent_attribute.attnum = constraint_row.confkey[1]
     WHERE constraint_row.contype = 'f'
       AND array_length(constraint_row.conkey, 1) = 1
       AND array_length(constraint_row.confkey, 1) = 1
       AND child_namespace.nspname = 'public'
       AND child_relation.relkind IN ('r', 'p')
       AND child_relation.relrowsecurity = TRUE
       AND parent_relation.relname IN ('parcel_traverses', 'level_networks', 'road_alignments')
       AND parent_attribute.attname = 'id'
  LOOP
    policy_prefix := CASE child_table.parent_table
      WHEN 'parcel_traverses' THEN 'traverse'
      WHEN 'level_networks' THEN 'level'
      ELSE 'alignment'
    END;
    EXECUTE format('DROP POLICY IF EXISTS metardu_%s_role_select_guard ON %I.%I', policy_prefix, child_table.schema_name, child_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_%s_role_insert_guard ON %I.%I', policy_prefix, child_table.schema_name, child_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_%s_role_update_guard ON %I.%I', policy_prefix, child_table.schema_name, child_table.table_name);
    EXECUTE format('DROP POLICY IF EXISTS metardu_%s_role_delete_guard ON %I.%I', policy_prefix, child_table.schema_name, child_table.table_name);
    EXECUTE format(
      'CREATE POLICY metardu_%s_role_select_guard ON %I.%I AS RESTRICTIVE FOR SELECT USING (%I IS NULL OR public.can_read_project_child_data(%L, %I))',
      policy_prefix, child_table.schema_name, child_table.table_name,
      child_table.foreign_key_column, child_table.parent_table, child_table.foreign_key_column
    );
    EXECUTE format(
      'CREATE POLICY metardu_%s_role_insert_guard ON %I.%I AS RESTRICTIVE FOR INSERT WITH CHECK (%I IS NULL OR public.can_write_project_child_data(%L, %I))',
      policy_prefix, child_table.schema_name, child_table.table_name,
      child_table.foreign_key_column, child_table.parent_table, child_table.foreign_key_column
    );
    EXECUTE format(
      'CREATE POLICY metardu_%s_role_update_guard ON %I.%I AS RESTRICTIVE FOR UPDATE USING (%I IS NULL OR public.can_read_project_child_data(%L, %I)) WITH CHECK (%I IS NULL OR public.can_write_project_child_data(%L, %I))',
      policy_prefix, child_table.schema_name, child_table.table_name,
      child_table.foreign_key_column, child_table.parent_table, child_table.foreign_key_column,
      child_table.foreign_key_column, child_table.parent_table, child_table.foreign_key_column
    );
    EXECUTE format(
      'CREATE POLICY metardu_%s_role_delete_guard ON %I.%I AS RESTRICTIVE FOR DELETE USING (%I IS NULL OR public.can_write_project_child_data(%L, %I))',
      policy_prefix, child_table.schema_name, child_table.table_name,
      child_table.foreign_key_column, child_table.parent_table, child_table.foreign_key_column
    );
  END LOOP;
END;
$$;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'pro', 'team', 'firm', 'enterprise'));

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL CHECK (email = lower(email)),
  role VARCHAR(30) NOT NULL CHECK (role IN ('project_manager', 'surveyor', 'viewer')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_status
  ON public.organization_invitations (organization_id, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_invitations_token_hash
  ON public.organization_invitations (token_hash);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_admin_manage_invitations" ON public.organization_invitations;
CREATE POLICY "org_admin_manage_invitations" ON public.organization_invitations
  FOR ALL
  USING (
    organization_id = public.current_org_id()
    AND public.is_active_organization_admin(organization_id)
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND public.is_active_organization_admin(organization_id)
  );

-- The raw bearer token is never persisted. This narrowly-scoped function is
-- the only path by which an invitee can resolve a token and join a firm.
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token_hash TEXT)
RETURNS TABLE(outcome TEXT, organization_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_user UUID;
  account_email TEXT;
  account_email_verified BOOLEAN;
  target_org UUID;
  target_role TEXT;
  org_is_active BOOLEAN;
  org_plan TEXT;
  org_max_seats INTEGER;
  active_member_count BIGINT;
  invitation_row public.organization_invitations%ROWTYPE;
BEGIN
  request_user := NULLIF(current_setting('request.user_id', true), '')::UUID;
  IF request_user IS NULL THEN
    RETURN QUERY SELECT 'unauthorized'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT account.email, account.email_verified
    INTO account_email, account_email_verified
    FROM public.users AS account
   WHERE account.id = request_user;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'account_not_found'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  IF account_email_verified IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'email_unverified'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  -- Lock the organization before the invitation, matching invite creation's
  -- lock order so simultaneous accept/revoke operations cannot deadlock.
  SELECT invitation.organization_id
    INTO target_org
    FROM public.organization_invitations AS invitation
   WHERE invitation.token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_invitation'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_org::TEXT, 0));

  SELECT organization.is_active
    INTO org_is_active
    FROM public.organizations AS organization
   WHERE organization.id = target_org
   FOR UPDATE;
  IF NOT FOUND OR org_is_active IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'organization_unavailable'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  SELECT entitlement.effective_plan, entitlement.max_seats
    INTO org_plan, org_max_seats
    FROM public.organization_subscription_limit(target_org) AS entitlement;
  IF org_plan NOT IN ('team', 'firm', 'enterprise') THEN
    RETURN QUERY SELECT 'plan_inactive'::TEXT, target_org, NULL::TEXT;
    RETURN;
  END IF;

  SELECT invitation.*
    INTO invitation_row
    FROM public.organization_invitations AS invitation
   WHERE invitation.token_hash = p_token_hash
     AND invitation.organization_id = target_org
   FOR UPDATE;
  IF NOT FOUND OR invitation_row.revoked_at IS NOT NULL OR invitation_row.accepted_at IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_invitation'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  IF invitation_row.expires_at <= NOW() THEN
    RETURN QUERY SELECT 'invitation_expired'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  IF lower(account_email) <> invitation_row.email THEN
    RETURN QUERY SELECT 'email_mismatch'::TEXT, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members AS member
     WHERE member.organization_id = target_org
       AND member.user_id = request_user
       AND member.is_active = TRUE
  ) THEN
    RETURN QUERY SELECT 'already_member'::TEXT, target_org, invitation_row.role;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO active_member_count
    FROM public.organization_members AS member
   WHERE member.organization_id = target_org
     AND member.is_active = TRUE;
  IF org_max_seats IS NOT NULL AND org_max_seats >= 0 AND active_member_count >= org_max_seats THEN
    RETURN QUERY SELECT 'seat_limit_reached'::TEXT, target_org, invitation_row.role;
    RETURN;
  END IF;

  INSERT INTO public.organization_members (
    organization_id, user_id, role, invited_by, invited_at, accepted_at, is_active
  ) VALUES (
    target_org, request_user, invitation_row.role, invitation_row.invited_by, NOW(), NOW(), TRUE
  )
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        invited_by = EXCLUDED.invited_by,
        invited_at = EXCLUDED.invited_at,
        accepted_at = NOW(),
        is_active = TRUE;

  UPDATE public.organization_invitations AS invitation
     SET accepted_by = request_user, accepted_at = NOW()
   WHERE invitation.id = invitation_row.id;

  RETURN QUERY SELECT 'accepted'::TEXT, target_org, invitation_row.role;
END;
$$;

COMMENT ON TABLE public.organization_invitations IS
  'Hashed, expiring invitations to join a survey firm; acceptance requires a verified matching account email.';
