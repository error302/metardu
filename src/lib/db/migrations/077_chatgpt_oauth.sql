-- Separate, revocable grants for the read-only ChatGPT integration.
-- Only hashes of bearer credentials are persisted. No website session is exported.
CREATE TABLE IF NOT EXISTS chatgpt_clients (
  client_id_hash TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris JSONB NOT NULL CHECK (jsonb_typeof(redirect_uris) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 year',
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chatgpt_clients_expiry_idx ON chatgpt_clients(expires_at);
CREATE TABLE IF NOT EXISTS chatgpt_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES chatgpt_clients(client_id_hash),
  scope TEXT NOT NULL CHECK (scope = 'projects:read'),
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chatgpt_grants_user_idx ON chatgpt_grants(user_id);
CREATE TABLE IF NOT EXISTS chatgpt_credentials (
  token_hash TEXT PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES chatgpt_grants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('code', 'access', 'refresh')),
  redirect_uri TEXT,
  code_challenge TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chatgpt_credentials_grant_idx ON chatgpt_credentials(grant_id);
-- Service-only tables. Routes enforce session ownership or a validated bearer grant.
REVOKE ALL ON chatgpt_clients, chatgpt_grants, chatgpt_credentials FROM PUBLIC;
