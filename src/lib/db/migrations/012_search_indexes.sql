-- ═══════════════════════════════════════════════════════════════════════════════
-- METARDU Migration 012 — Full-Text Search Indexes & Support Infrastructure
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds generated tsvector columns + GIN indexes for full-text search, trigram
-- indexes for ILIKE pattern matching, composite indexes for common query
-- patterns, and a helper function for search query construction.
--
-- Prerequisites: PostgreSQL 15 with PostGIS (already in canonical schema).
-- Idempotent: uses IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure pg_trgm extension is available ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. Add columns required by FTS that may not yet exist ─────────────────────

-- submissions: missing `title`, `survey_type`, `status`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'title'
  ) THEN
    ALTER TABLE submissions ADD COLUMN title VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'survey_type'
  ) THEN
    ALTER TABLE submissions ADD COLUMN survey_type VARCHAR(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'status'
  ) THEN
    ALTER TABLE submissions ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
  END IF;
END $$;

-- surveyor_profiles: add specialization (singular), full_name, and county if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveyor_profiles' AND column_name = 'specialization'
  ) THEN
    ALTER TABLE surveyor_profiles ADD COLUMN specialization VARCHAR(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveyor_profiles' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE surveyor_profiles ADD COLUMN full_name VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveyor_profiles' AND column_name = 'county'
  ) THEN
    ALTER TABLE surveyor_profiles ADD COLUMN county VARCHAR(100);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Generated tsvector columns + GIN indexes for full-text search
-- ═══════════════════════════════════════════════════════════════════════════════
-- PostgreSQL does not allow || (tsvector concat) directly in CREATE INDEX.
-- Instead we add GENERATED columns that compute the weighted tsvector, then
-- index those columns with a standard GIN index.

-- projects: search_vector (name A, survey_type B, location C)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE projects ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(survey_type, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(location, '')), 'C')
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_fts ON projects USING GIN (search_vector);

-- submissions: search_vector (title A, survey_type B, status C)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE submissions ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(survey_type, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(status, '')), 'C')
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_submissions_fts ON submissions USING GIN (search_vector);

-- surveyor_profiles: search_vector (full_name A, isk_number B, firm_name B, specialization C, county C)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'surveyor_profiles' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE surveyor_profiles ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(full_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(isk_number, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(firm_name, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(specialization, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(county, '')), 'C')
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_fts ON surveyor_profiles USING GIN (search_vector);

-- users: search_vector (full_name A, email B)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE users ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(full_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(email, '')), 'B')
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_fts ON users USING GIN (search_vector);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Helper function: fts_search(query text) → tsquery
-- ═══════════════════════════════════════════════════════════════════════════════
-- Converts a user search string into a tsquery with prefix matching.

CREATE OR REPLACE FUNCTION fts_search(query text)
RETURNS tsquery
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  webquery  tsquery;
  plainquery tsquery;
  prefix_parts text[];
  prefix_query tsquery;
  final_query tsquery;
  word text;
BEGIN
  IF query IS NULL OR btrim(query) = '' THEN
    RETURN to_tsquery('');
  END IF;

  webquery := websearch_to_tsquery('english', query);
  plainquery := plainto_tsquery('english', query);

  prefix_parts := regexp_split_to_array(btrim(query), '\s+');
  word := prefix_parts[array_length(prefix_parts, 1)];

  IF word <> '' THEN
    IF word ~ '^[a-zA-Z0-9]+$' THEN
      prefix_query := to_tsquery('english', word || ':*');
    ELSE
      prefix_query := to_tsquery('');
    END IF;
  ELSE
    prefix_query := to_tsquery('');
  END IF;

  final_query := webquery || plainquery || prefix_query;

  RETURN final_query;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Composite indexes for common search patterns
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_survey_type_created
  ON projects(survey_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_status_created
  ON submissions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_county_specialization
  ON surveyor_profiles(county, specialization);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Trigram indexes (pg_trgm) for ILIKE pattern matching
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_projects_name_trgm
  ON projects USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_surveyor_profiles_full_name_trgm
  ON surveyor_profiles USING GIN (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm
  ON users USING GIN (full_name gin_trgm_ops);
