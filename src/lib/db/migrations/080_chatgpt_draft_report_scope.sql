-- Add a separately consented, draft-only report creation permission.
-- Existing connections retain exactly the scopes they already granted.
ALTER TABLE chatgpt_grants
  DROP CONSTRAINT IF EXISTS chatgpt_grants_scope_check;

ALTER TABLE chatgpt_grants
  ADD CONSTRAINT chatgpt_grants_scope_check CHECK (scope IN (
    'projects:read',
    'survey-data:read',
    'survey:compute',
    'survey-documents:write',
    'projects:read survey-data:read',
    'projects:read survey:compute',
    'projects:read survey-documents:write',
    'survey-data:read survey:compute',
    'survey-data:read survey-documents:write',
    'survey:compute survey-documents:write',
    'projects:read survey-data:read survey:compute',
    'projects:read survey-data:read survey-documents:write',
    'projects:read survey:compute survey-documents:write',
    'survey-data:read survey:compute survey-documents:write',
    'projects:read survey-data:read survey:compute survey-documents:write'
  ));

-- DOWN: Only grants that used the removed write scope are revoked. Existing
-- project, observation, and calculation grants remain valid under migration 079.
UPDATE chatgpt_grants SET revoked_at = NOW()
WHERE scope LIKE '%survey-documents:write%' AND revoked_at IS NULL;

ALTER TABLE chatgpt_grants DROP CONSTRAINT IF EXISTS chatgpt_grants_scope_check;
ALTER TABLE chatgpt_grants ADD CONSTRAINT chatgpt_grants_scope_check CHECK (scope IN (
  'projects:read',
  'survey-data:read',
  'survey:compute',
  'projects:read survey-data:read',
  'projects:read survey:compute',
  'survey-data:read survey:compute',
  'projects:read survey-data:read survey:compute'
));
