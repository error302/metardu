-- Expand the private ChatGPT connector with separately consented observation
-- reading and non-persistent survey calculations. Existing project-only grants
-- remain project-only and cannot invoke the new tools.
ALTER TABLE chatgpt_grants
  DROP CONSTRAINT IF EXISTS chatgpt_grants_scope_check;

ALTER TABLE chatgpt_grants
  ADD CONSTRAINT chatgpt_grants_scope_check CHECK (scope IN (
    'projects:read',
    'survey-data:read',
    'survey:compute',
    'projects:read survey-data:read',
    'projects:read survey:compute',
    'survey-data:read survey:compute',
    'projects:read survey-data:read survey:compute'
  ));

-- DOWN: Revoke broader grants before restoring the project-only policy.
UPDATE chatgpt_grants SET revoked_at = NOW()
WHERE scope <> 'projects:read' AND revoked_at IS NULL;
ALTER TABLE chatgpt_grants DROP CONSTRAINT IF EXISTS chatgpt_grants_scope_check;
ALTER TABLE chatgpt_grants ADD CONSTRAINT chatgpt_grants_scope_check
  CHECK (scope = 'projects:read');
