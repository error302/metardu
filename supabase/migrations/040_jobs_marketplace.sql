-- Job Marketplace Tables

CREATE TABLE IF NOT EXISTS survey_jobs (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  posted_by           uuid REFERENCES auth.users(id),
  title               text NOT NULL,
  description         text NOT NULL,
  job_type            text NOT NULL,
  county              text NOT NULL,
  constituency        text,
  location_description text NOT NULL,
  parcel_number       text,
  estimated_area      float8,
  budget_amount       float8 NOT NULL,
  budget_currency     text NOT NULL DEFAULT 'KES',
  budget_type         text NOT NULL DEFAULT 'FIXED',
  commission_amount   float8 GENERATED ALWAYS AS (budget_amount * 0.05) STORED,
  deadline            date NOT NULL,
  required_quals      text[] DEFAULT '{}',
  status              text NOT NULL DEFAULT 'OPEN',
  awarded_to          uuid REFERENCES auth.users(id),
  completed_at        timestamptz,
  commission_paid     boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE job_applications (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id              uuid REFERENCES survey_jobs(id) ON DELETE CASCADE,
  surveyor_id         uuid REFERENCES auth.users(id),
  cover_letter        text NOT NULL,
  proposed_amount     float8 NOT NULL,
  proposed_currency   text NOT NULL DEFAULT 'KES',
  proposed_timeline   integer NOT NULL,
  portfolio_links     text[] DEFAULT '{}',
  status              text NOT NULL DEFAULT 'PENDING',
  applied_at          timestamptz DEFAULT now(),
  UNIQUE(job_id, surveyor_id)
);

CREATE TABLE job_reviews (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id                uuid REFERENCES survey_jobs(id),
  reviewer_id           uuid REFERENCES auth.users(id),
  surveyor_id           uuid REFERENCES auth.users(id),
  rating                integer CHECK (rating BETWEEN 1 AND 5),
  comment               text,
  quality_rating        integer CHECK (quality_rating BETWEEN 1 AND 5),
  timeliness_rating     integer CHECK (timeliness_rating BETWEEN 1 AND 5),
  communication_rating  integer CHECK (communication_rating BETWEEN 1 AND 5),
  created_at            timestamptz DEFAULT now(),
  UNIQUE(job_id, reviewer_id)
);

CREATE TABLE surveyor_profiles (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name        text NOT NULL,
  isk_number          text,
  firm_name           text,
  county              text,
  specializations     text[] DEFAULT '{}',
  years_experience    integer,
  bio                 text,
  average_rating      float8 DEFAULT 0,
  total_reviews       integer DEFAULT 0,
  jobs_completed      integer DEFAULT 0,
  verified_isk        boolean DEFAULT false,
  profile_public      boolean DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE survey_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveyor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read open jobs" ON survey_jobs
  FOR SELECT USING (status = 'OPEN' OR posted_by = auth.uid() OR awarded_to = auth.uid());

CREATE POLICY "post jobs" ON survey_jobs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "edit own jobs" ON survey_jobs
  FOR UPDATE USING (auth.uid() = posted_by);

CREATE POLICY "own applications" ON job_applications
  FOR ALL USING (
    auth.uid() = surveyor_id OR
    job_id IN (SELECT id FROM survey_jobs WHERE posted_by = auth.uid())
  );

CREATE POLICY "read reviews" ON job_reviews FOR SELECT USING (true);

CREATE POLICY "write reviews" ON job_reviews
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "read public profiles" ON surveyor_profiles
  FOR SELECT USING (profile_public = true OR auth.uid() = user_id);

CREATE POLICY "manage own profile" ON surveyor_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Auto-update average rating
CREATE OR REPLACE FUNCTION update_surveyor_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE surveyor_profiles SET
    average_rating = COALESCE((SELECT AVG(rating) FROM job_reviews WHERE surveyor_id = NEW.surveyor_id), 0),
    total_reviews = (SELECT COUNT(*) FROM job_reviews WHERE surveyor_id = NEW.surveyor_id)
  WHERE user_id = NEW.surveyor_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rating_update
  AFTER INSERT ON job_reviews
  FOR EACH ROW EXECUTE FUNCTION update_surveyor_rating();

-- Indexes
CREATE INDEX idx_jobs_status ON survey_jobs(status);
CREATE INDEX idx_jobs_county ON survey_jobs(county);
CREATE INDEX idx_jobs_posted_by ON survey_jobs(posted_by);
CREATE INDEX idx_applications_job ON job_applications(job_id);
CREATE INDEX idx_applications_surveyor ON job_applications(surveyor_id);
CREATE INDEX idx_reviews_surveyor ON job_reviews(surveyor_id);
