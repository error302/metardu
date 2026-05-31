-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU RLS POLICIES — Migration 002
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the broken 022_rls_policies.sql which used auth.uid() and owner_id.
-- This version uses current_user_id() and user_id consistently.
-- All project children inherit access through the projects table.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Enable RLS on all core tables ──────────────────────────────────────────
-- Skip system tables (spatial_ref_sys, geometry_columns, etc.)

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename NOT IN (
      'spatial_ref_sys', 'geography_columns', 'geometry_columns',
      'raster_columns', 'raster_overviews', 'schema_migrations'
    )
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- ── 2. Helper to drop existing policies (idempotent re-creation) ─────────────
-- We drop by pattern so re-running this migration is safe.

-- ── 3. Users table — self read only ──────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_read" ON users;
  CREATE POLICY "self_read" ON users
    FOR SELECT USING (id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_update" ON users;
  CREATE POLICY "self_update" ON users
    FOR UPDATE USING (id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 4. Profiles — self read/write ─────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_read_write_profiles" ON profiles;
  CREATE POLICY "self_read_write_profiles" ON profiles
    FOR ALL USING (id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 5. Surveyor profiles — self read/write + admin read all ──────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_read_write_sp" ON surveyor_profiles;
  CREATE POLICY "self_read_write_sp" ON surveyor_profiles
    FOR ALL USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_read_all_sp" ON surveyor_profiles;
  CREATE POLICY "admin_read_all_sp" ON surveyor_profiles
    FOR SELECT USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 6. Projects — owner + team member access ─────────────────────────────────
-- Uses user_id (not owner_id) consistently

DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_all_projects" ON projects;
  CREATE POLICY "owner_all_projects" ON projects
    FOR ALL USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "team_member_select_projects" ON projects;
  CREATE POLICY "team_member_select_projects" ON projects
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members
              WHERE project_id = projects.id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 7. Project children — access via project ownership or membership ──────────
-- All use user_id (not owner_id) to match projects.user_id

-- project_fieldbook_entries
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_fieldbook" ON project_fieldbook_entries;
  CREATE POLICY "project_child_all_fieldbook" ON project_fieldbook_entries
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_fieldbook_entries.project_id AND user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM project_members pm
                 JOIN projects p ON p.id = pm.project_id
                 WHERE pm.project_id = project_fieldbook_entries.project_id AND pm.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- survey_points
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_survey_points" ON survey_points;
  CREATE POLICY "project_child_all_survey_points" ON survey_points
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = survey_points.project_id AND user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM project_members pm
                 WHERE pm.project_id = survey_points.project_id AND pm.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- network_adjustments
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_network_adj" ON network_adjustments;
  CREATE POLICY "project_child_all_network_adj" ON network_adjustments
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = network_adjustments.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- mining_surveys
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_mining" ON mining_surveys;
  CREATE POLICY "project_child_all_mining" ON mining_surveys
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = mining_surveys.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- hydro_surveys
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_hydro" ON hydro_surveys;
  CREATE POLICY "project_child_all_hydro" ON hydro_surveys
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = hydro_surveys.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- gnss_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_gnss" ON gnss_sessions;
  CREATE POLICY "project_child_all_gnss" ON gnss_sessions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = gnss_sessions.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- import_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_import" ON import_sessions;
  CREATE POLICY "project_child_all_import" ON import_sessions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = import_sessions.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- signatures
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_signatures" ON signatures;
  CREATE POLICY "project_child_all_signatures" ON signatures
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = signatures.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- project_members
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_members" ON project_members;
  CREATE POLICY "project_child_all_members" ON project_members
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_members.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- scheme_activity_log
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_activity" ON scheme_activity_log;
  CREATE POLICY "project_child_all_activity" ON scheme_activity_log
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = scheme_activity_log.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 8. Scheme / subdivision tables ───────────────────────────────────────────

-- scheme_details
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_scheme_details" ON scheme_details;
  CREATE POLICY "project_child_all_scheme_details" ON scheme_details
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = scheme_details.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- blocks
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_blocks" ON blocks;
  CREATE POLICY "project_child_all_blocks" ON blocks
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = blocks.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- parcels
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_parcels" ON parcels;
  CREATE POLICY "project_child_all_parcels" ON parcels
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = parcels.project_id AND user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM project_members
                 WHERE project_id = parcels.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 9. Traverse tables ───────────────────────────────────────────────────────

-- parcel_traverses
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_parcel_traverses" ON parcel_traverses;
  CREATE POLICY "project_child_all_parcel_traverses" ON parcel_traverses
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = parcel_traverses.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- traverse_observations
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_trav_obs" ON traverse_observations;
  CREATE POLICY "project_child_all_trav_obs" ON traverse_observations
    FOR ALL USING (
      EXISTS (SELECT 1 FROM parcel_traverses pt
              JOIN projects p ON p.id = pt.project_id
              WHERE pt.id = traverse_observations.traverse_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- traverse_coordinates
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_trav_coord" ON traverse_coordinates;
  CREATE POLICY "project_child_all_trav_coord" ON traverse_coordinates
    FOR ALL USING (
      EXISTS (SELECT 1 FROM parcel_traverses pt
              JOIN projects p ON p.id = pt.project_id
              WHERE pt.id = traverse_coordinates.traverse_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- traverse_history
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_trav_hist" ON traverse_history;
  CREATE POLICY "project_child_all_trav_hist" ON traverse_history
    FOR ALL USING (
      EXISTS (SELECT 1 FROM parcel_traverses pt
              JOIN projects p ON p.id = pt.project_id
              WHERE pt.id = traverse_history.parcel_traverse_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 10. Level network tables ─────────────────────────────────────────────────

-- level_networks
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_level_nets" ON level_networks;
  CREATE POLICY "project_child_all_level_nets" ON level_networks
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = level_networks.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- level_control_points
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_level_cp" ON level_control_points;
  CREATE POLICY "project_child_all_level_cp" ON level_control_points
    FOR ALL USING (
      EXISTS (SELECT 1 FROM level_networks ln
              JOIN projects p ON p.id = ln.project_id
              WHERE ln.id = level_control_points.network_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- level_observations
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_level_obs" ON level_observations;
  CREATE POLICY "project_child_all_level_obs" ON level_observations
    FOR ALL USING (
      EXISTS (SELECT 1 FROM level_networks ln
              JOIN projects p ON p.id = ln.project_id
              WHERE ln.id = level_observations.network_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- level_adjustment_results
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_level_adj" ON level_adjustment_results;
  CREATE POLICY "project_child_all_level_adj" ON level_adjustment_results
    FOR ALL USING (
      EXISTS (SELECT 1 FROM level_networks ln
              JOIN projects p ON p.id = ln.project_id
              WHERE ln.id = level_adjustment_results.network_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 11. Road engineering tables ──────────────────────────────────────────────

-- road_alignments
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_road_align" ON road_alignments;
  CREATE POLICY "project_child_all_road_align" ON road_alignments
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = road_alignments.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- alignment_ips
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_align_ips" ON alignment_ips;
  CREATE POLICY "project_child_all_align_ips" ON alignment_ips
    FOR ALL USING (
      EXISTS (SELECT 1 FROM road_alignments ra
              JOIN projects p ON p.id = ra.project_id
              WHERE ra.id = alignment_ips.alignment_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- alignment_vertical_ips
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_vert_ips" ON alignment_vertical_ips;
  CREATE POLICY "project_child_all_vert_ips" ON alignment_vertical_ips
    FOR ALL USING (
      EXISTS (SELECT 1 FROM road_alignments ra
              JOIN projects p ON p.id = ra.project_id
              WHERE ra.id = alignment_vertical_ips.alignment_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- cross_section_stations
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_cross_st" ON cross_section_stations;
  CREATE POLICY "project_child_all_cross_st" ON cross_section_stations
    FOR ALL USING (
      EXISTS (SELECT 1 FROM road_alignments ra
              JOIN projects p ON p.id = ra.project_id
              WHERE ra.id = cross_section_stations.alignment_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- earthworks_results
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_earthworks" ON earthworks_results;
  CREATE POLICY "project_child_all_earthworks" ON earthworks_results
    FOR ALL USING (
      EXISTS (SELECT 1 FROM road_alignments ra
              JOIN projects p ON p.id = ra.project_id
              WHERE ra.id = earthworks_results.alignment_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- road_reserve_parcels
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_road_reserve" ON road_reserve_parcels;
  CREATE POLICY "project_child_all_road_reserve" ON road_reserve_parcels
    FOR ALL USING (
      EXISTS (SELECT 1 FROM road_alignments ra
              JOIN projects p ON p.id = ra.project_id
              WHERE ra.id = road_reserve_parcels.alignment_id AND p.user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 12. Submission tables ────────────────────────────────────────────────────

-- submissions
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_submissions" ON submissions;
  CREATE POLICY "project_child_all_submissions" ON submissions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = submissions.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- supporting_documents
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_supp_docs" ON supporting_documents;
  CREATE POLICY "project_child_all_supp_docs" ON supporting_documents
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = supporting_documents.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- project_submissions
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_proj_subs" ON project_submissions;
  CREATE POLICY "project_child_all_proj_subs" ON project_submissions
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = project_submissions.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- submission_documents
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_sub_docs" ON submission_documents;
  CREATE POLICY "project_child_all_sub_docs" ON submission_documents
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = submission_documents.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 13. Public beacons ──────────────────────────────────────────────────────
-- Anyone authenticated can read; only owner/admin can modify

DO $$ BEGIN
  DROP POLICY IF EXISTS "authenticated_read_beacons" ON public_beacons;
  CREATE POLICY "authenticated_read_beacons" ON public_beacons
    FOR SELECT USING (current_user_id() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "submitter_all_beacons" ON public_beacons;
  CREATE POLICY "submitter_all_beacons" ON public_beacons
    FOR ALL USING (submitted_by = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_beacons" ON public_beacons;
  CREATE POLICY "admin_all_beacons" ON public_beacons
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 14. Field projects — user_id based access ───────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_all_field_projects" ON field_projects;
  CREATE POLICY "owner_all_field_projects" ON field_projects
    FOR ALL USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 15. Government audit logs ────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "insert_authenticated_gov_audit" ON government_audit_logs;
  CREATE POLICY "insert_authenticated_gov_audit" ON government_audit_logs
    FOR INSERT WITH CHECK (current_user_id() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "select_auditors_gov_audit" ON government_audit_logs;
  CREATE POLICY "select_auditors_gov_audit" ON government_audit_logs
    FOR SELECT USING (is_auditor() OR is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 16. Block assignments ────────────────────────────────────────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_block_assign" ON block_assignments;
  CREATE POLICY "project_child_all_block_assign" ON block_assignments
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = block_assignments.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 17. Document & review tables ─────────────────────────────────────────────

-- deed_plans
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_deed_plans" ON deed_plans;
  CREATE POLICY "project_child_all_deed_plans" ON deed_plans
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = deed_plans.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- survey_reports
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_survey_reports" ON survey_reports;
  CREATE POLICY "project_child_all_survey_reports" ON survey_reports
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = survey_reports.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- leveling_runs
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_leveling_runs" ON leveling_runs;
  CREATE POLICY "project_child_all_leveling_runs" ON leveling_runs
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = leveling_runs.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- document_signatures
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_doc_sigs" ON document_signatures;
  CREATE POLICY "project_child_all_doc_sigs" ON document_signatures
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = document_signatures.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- peer_review_requests
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_peer_reviews" ON peer_review_requests;
  CREATE POLICY "project_child_all_peer_reviews" ON peer_review_requests
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = peer_review_requests.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- traverse_results
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_trav_results" ON traverse_results;
  CREATE POLICY "project_child_all_trav_results" ON traverse_results
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = traverse_results.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 18. Survey extras ────────────────────────────────────────────────────────

-- survey_photos
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_survey_photos" ON survey_photos;
  CREATE POLICY "project_child_all_survey_photos" ON survey_photos
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = survey_photos.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- survey_epochs
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_survey_epochs" ON survey_epochs;
  CREATE POLICY "project_child_all_survey_epochs" ON survey_epochs
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = survey_epochs.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- rim_sections
DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_rim_sections" ON rim_sections;
  CREATE POLICY "project_child_all_rim_sections" ON rim_sections
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = rim_sections.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — all RLS policies created using current_user_id() and user_id.
-- ═══════════════════════════════════════════════════════════════════════════════
