-- ─── Section 8: Government Audit Log Table ───

CREATE TABLE IF NOT EXISTS government_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE government_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_audit_logs FORCE ROW LEVEL SECURITY;

-- Immutable: no UPDATE or DELETE
REVOKE UPDATE, DELETE ON government_audit_logs FROM PUBLIC;

DO $$ BEGIN
  CREATE POLICY "insert_authenticated" ON government_audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "select_auditors" ON government_audit_logs
    FOR SELECT USING (is_auditor() OR is_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON government_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON government_audit_logs(action, created_at DESC);
