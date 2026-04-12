CREATE TABLE document_signatures (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id         uuid NOT NULL,
  document_type       text NOT NULL,
  signed_by           uuid REFERENCES auth.users(id),
  surveyor_name       text NOT NULL,
  isk_number          text NOT NULL,
  firm_name           text NOT NULL,
  signed_at           timestamptz NOT NULL DEFAULT now(),
  document_hash       text NOT NULL,
  signature_data      text,
  method              text NOT NULL,
  ip_address          text,
  valid               boolean NOT NULL DEFAULT true,
  revoked_at          timestamptz,
  revoked_reason      text,
  verification_token  text UNIQUE NOT NULL
);

ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signers manage own" ON document_signatures
  FOR ALL USING (auth.uid() = signed_by);

CREATE POLICY "public verify" ON document_signatures
  FOR SELECT USING (true);

CREATE INDEX idx_signatures_document ON document_signatures(document_id);
CREATE INDEX idx_signatures_token ON document_signatures(verification_token);
CREATE INDEX idx_signatures_signed_by ON document_signatures(signed_by);
