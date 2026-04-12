-- Peer Review Tables

CREATE TABLE peer_review_requests (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by    uuid REFERENCES auth.users(id),
  document_type   text NOT NULL,
  document_id     uuid NOT NULL,
  title           text NOT NULL,
  description     text,
  urgency         text DEFAULT 'STANDARD',
  status          text DEFAULT 'OPEN',
  due_by          date,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE peer_reviewers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id      uuid REFERENCES peer_review_requests(id) ON DELETE CASCADE,
  reviewer_id     uuid REFERENCES auth.users(id),
  assigned_at     timestamptz DEFAULT now(),
  completed_at    timestamptz,
  verdict         text,
  cpd_points      integer DEFAULT 0,
  UNIQUE(request_id, reviewer_id)
);

CREATE TABLE review_comments (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reviewer_id_fk  uuid REFERENCES peer_reviewers(id) ON DELETE CASCADE,
  section         text NOT NULL,
  severity        text NOT NULL DEFAULT 'INFO',
  comment         text NOT NULL,
  regulation_cite text,
  resolved        boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE peer_review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE peer_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own requests" ON peer_review_requests
  FOR ALL USING (auth.uid() = submitted_by);

CREATE POLICY "open requests" ON peer_review_requests
  FOR SELECT USING (status = 'OPEN');

CREATE POLICY "reviewer access" ON peer_reviewers
  FOR ALL USING (auth.uid() = reviewer_id);

CREATE POLICY "read comments" ON review_comments
  FOR SELECT USING (true);

CREATE POLICY "write comments" ON review_comments
  FOR INSERT WITH CHECK (auth.uid() IN (
    SELECT reviewer_id FROM peer_reviewers WHERE id = reviewer_id_fk
  ));

-- Indexes
CREATE INDEX idx_peer_requests_status ON peer_review_requests(status);
CREATE INDEX idx_peer_requests_submitted ON peer_review_requests(submitted_by);
CREATE INDEX idx_peer_reviewers_request ON peer_reviewers(request_id);
