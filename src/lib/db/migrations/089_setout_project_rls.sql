-- Bring construction set-out records under the same project ownership and
-- active-organization boundary as the survey data they extend. These tables
-- were introduced after the earlier project-child RLS migrations.

-- UP:

CREATE OR REPLACE FUNCTION metardu_rls_can_access_project(target_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.projects p
     WHERE p.id = target_project_id
       AND (
         p.user_id::text = NULLIF(current_setting('request.user_id', true), '')
         OR (
           p.organization_id IS NOT NULL
           AND p.organization_id = public.current_org_id()
           AND EXISTS (
             SELECT 1
               FROM public.organization_members om
              WHERE om.organization_id = p.organization_id
                AND om.user_id::text = NULLIF(current_setting('request.user_id', true), '')
                AND om.is_active = TRUE
           )
         )
       )
  );
$$;

ALTER TABLE setout_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE setout_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access_setout_definitions ON setout_definitions;
CREATE POLICY project_access_setout_definitions ON setout_definitions
  FOR ALL
  USING (metardu_rls_can_access_project(project_id))
  WITH CHECK (metardu_rls_can_access_project(project_id));

ALTER TABLE setout_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE setout_points FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access_setout_points ON setout_points;
CREATE POLICY project_access_setout_points ON setout_points
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM setout_definitions d
       WHERE d.id = setout_points.definition_id
         AND metardu_rls_can_access_project(d.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM setout_definitions d
       WHERE d.id = setout_points.definition_id
         AND metardu_rls_can_access_project(d.project_id)
    )
  );

ALTER TABLE setout_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE setout_observations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access_setout_observations ON setout_observations;
CREATE POLICY project_access_setout_observations ON setout_observations
  FOR ALL
  USING (
    metardu_rls_can_access_project(project_id)
    AND EXISTS (
      SELECT 1
        FROM setout_definitions d
       WHERE d.id = setout_observations.definition_id
         AND d.project_id = setout_observations.project_id
         AND metardu_rls_can_access_project(d.project_id)
    )
  )
  WITH CHECK (
    metardu_rls_can_access_project(project_id)
    AND EXISTS (
      SELECT 1
        FROM setout_definitions d
       WHERE d.id = setout_observations.definition_id
         AND d.project_id = setout_observations.project_id
         AND metardu_rls_can_access_project(d.project_id)
    )
  );

ALTER TABLE verticality_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE verticality_readings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access_verticality_readings ON verticality_readings;
CREATE POLICY project_access_verticality_readings ON verticality_readings
  FOR ALL
  USING (
    metardu_rls_can_access_project(project_id)
    AND (
      definition_id IS NULL
      OR EXISTS (
        SELECT 1
          FROM setout_definitions d
         WHERE d.id = verticality_readings.definition_id
           AND d.project_id = verticality_readings.project_id
           AND metardu_rls_can_access_project(d.project_id)
      )
    )
  )
  WITH CHECK (
    metardu_rls_can_access_project(project_id)
    AND (
      definition_id IS NULL
      OR EXISTS (
        SELECT 1
          FROM setout_definitions d
         WHERE d.id = verticality_readings.definition_id
           AND d.project_id = verticality_readings.project_id
           AND metardu_rls_can_access_project(d.project_id)
      )
    )
  );

ALTER TABLE project_tolerance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tolerance_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_access_tolerance_assignment ON project_tolerance_profiles;
CREATE POLICY project_access_tolerance_assignment ON project_tolerance_profiles
  FOR ALL
  USING (metardu_rls_can_access_project(project_id))
  WITH CHECK (metardu_rls_can_access_project(project_id));

-- Default rules are shared. A user-created profile is visible to its creator
-- and to members of projects that reference it. Profiles cannot be edited or
-- deleted in place; issue a new revision instead.
ALTER TABLE tolerance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tolerance_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_accessible_tolerance_profiles ON tolerance_profiles;
CREATE POLICY read_accessible_tolerance_profiles ON tolerance_profiles
  FOR SELECT
  USING (
    is_default IS TRUE
    OR created_by::text = NULLIF(current_setting('request.user_id', true), '')
    OR EXISTS (
      SELECT 1
        FROM setout_definitions d
       WHERE d.tolerance_profile_id = tolerance_profiles.id
         AND metardu_rls_can_access_project(d.project_id)
    )
    OR EXISTS (
      SELECT 1
        FROM project_tolerance_profiles ptp
       WHERE ptp.tolerance_profile_id = tolerance_profiles.id
         AND metardu_rls_can_access_project(ptp.project_id)
    )
  );
DROP POLICY IF EXISTS create_own_tolerance_profiles ON tolerance_profiles;
CREATE POLICY create_own_tolerance_profiles ON tolerance_profiles
  FOR INSERT
  WITH CHECK (
    is_default IS NOT TRUE
    AND created_by::text = NULLIF(current_setting('request.user_id', true), '')
  );

COMMENT ON FUNCTION metardu_rls_can_access_project(UUID) IS
  'RLS predicate for project records: owner or active member of the request organization.';
COMMENT ON TABLE setout_observations IS
  'Project-scoped append-only as-staked evidence; access is restricted by project RLS.';

-- DOWN:

DROP POLICY IF EXISTS create_own_tolerance_profiles ON tolerance_profiles;
DROP POLICY IF EXISTS read_accessible_tolerance_profiles ON tolerance_profiles;
ALTER TABLE tolerance_profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tolerance_profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_tolerance_assignment ON project_tolerance_profiles;
ALTER TABLE project_tolerance_profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE project_tolerance_profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_verticality_readings ON verticality_readings;
ALTER TABLE verticality_readings NO FORCE ROW LEVEL SECURITY;
ALTER TABLE verticality_readings DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_setout_observations ON setout_observations;
ALTER TABLE setout_observations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE setout_observations DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_setout_points ON setout_points;
ALTER TABLE setout_points NO FORCE ROW LEVEL SECURITY;
ALTER TABLE setout_points DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_access_setout_definitions ON setout_definitions;
ALTER TABLE setout_definitions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE setout_definitions DISABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS metardu_rls_can_access_project(UUID);
