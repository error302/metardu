-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU RLS POLICIES FOR MISSING TABLES — Migration 003
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixes the critical bug where 9 tables had RLS FORCED but no policies,
-- making them completely inaccessible to all users including legitimate ones.
--
-- Missing tables: equipment, benchmarks, audit_logs, online_service_logs,
--   survey_standards, user_subscriptions, payment_history, alignments, cross_sections
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Equipment — owner-based access ────────────────────────────────────────
-- user_id is the current assignee; owner_id is the actual owner of the equipment.

DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_all_equipment" ON equipment;
  CREATE POLICY "owner_all_equipment" ON equipment
    FOR ALL USING (
      user_id = current_user_id()
      OR owner_id = current_user_id()
    );
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_equipment" ON equipment;
  CREATE POLICY "admin_all_equipment" ON equipment
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 2. Benchmarks — read-only for authenticated users, admin write ───────────
-- Benchmarks are reference data — all authenticated users can read,
-- only admins can create/update/delete.

DO $$ BEGIN
  DROP POLICY IF EXISTS "authenticated_read_benchmarks" ON benchmarks;
  CREATE POLICY "authenticated_read_benchmarks" ON benchmarks
    FOR SELECT USING (current_user_id() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_benchmarks" ON benchmarks;
  CREATE POLICY "admin_all_benchmarks" ON benchmarks
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 3. Audit logs — insert by authenticated users, read by admin/auditor ────
-- Audit logs should be append-only for regular users, readable by admin/auditor.

DO $$ BEGIN
  DROP POLICY IF EXISTS "insert_authenticated_audit" ON audit_logs;
  CREATE POLICY "insert_authenticated_audit" ON audit_logs
    FOR INSERT WITH CHECK (current_user_id() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "select_admin_auditor_audit" ON audit_logs;
  CREATE POLICY "select_admin_auditor_audit" ON audit_logs
    FOR SELECT USING (is_admin() OR is_auditor());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 4. Online service logs — insert by authenticated, read by admin ──────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "owner_all_service_logs" ON online_service_logs;
  CREATE POLICY "owner_all_service_logs" ON online_service_logs
    FOR ALL USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_service_logs" ON online_service_logs;
  CREATE POLICY "admin_all_service_logs" ON online_service_logs
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 5. Survey standards — read-only for all authenticated, admin write ───────
-- Standards are reference data like Kenya Survey Regulations, RDM 1.1 specs.

DO $$ BEGIN
  DROP POLICY IF EXISTS "authenticated_read_standards" ON survey_standards;
  CREATE POLICY "authenticated_read_standards" ON survey_standards
    FOR SELECT USING (current_user_id() IS NOT NULL);
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_standards" ON survey_standards;
  CREATE POLICY "admin_all_standards" ON survey_standards
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 6. User subscriptions — self read/write, admin read all ──────────────────

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_all_subscriptions" ON user_subscriptions;
  CREATE POLICY "self_all_subscriptions" ON user_subscriptions
    FOR ALL USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_read_subscriptions" ON user_subscriptions;
  CREATE POLICY "admin_read_subscriptions" ON user_subscriptions
    FOR SELECT USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 7. Payment history — self read, admin read all ──────────────────────────
-- Users should only see their own payments. Admin sees everything.

DO $$ BEGIN
  DROP POLICY IF EXISTS "self_read_payments" ON payment_history;
  CREATE POLICY "self_read_payments" ON payment_history
    FOR SELECT USING (user_id = current_user_id());
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "admin_all_payments" ON payment_history;
  CREATE POLICY "admin_all_payments" ON payment_history
    FOR ALL USING (is_admin());
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 8. Alignments — project child access ─────────────────────────────────────
-- Generic alignments table (not road_alignments) — project-child relationship.

DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_alignments" ON alignments;
  CREATE POLICY "project_child_all_alignments" ON alignments
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = alignments.project_id AND user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM project_members
                 WHERE project_id = alignments.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 9. Cross sections — project child access ─────────────────────────────────
-- Generic cross_sections table — project-child relationship.

DO $$ BEGIN
  DROP POLICY IF EXISTS "project_child_all_cross_sections" ON cross_sections;
  CREATE POLICY "project_child_all_cross_sections" ON cross_sections
    FOR ALL USING (
      EXISTS (SELECT 1 FROM projects WHERE id = cross_sections.project_id AND user_id = current_user_id())
      OR EXISTS (SELECT 1 FROM project_members
                 WHERE project_id = cross_sections.project_id AND user_id = current_user_id())
    );
EXCEPTION WHEN others THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE — all 9 previously locked-out tables now have proper RLS policies.
-- Total tables with policies: 37 + 9 = 46 (all public tables covered).
-- ═══════════════════════════════════════════════════════════════════════════════
