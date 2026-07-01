-- ──────────────────────────────────────────────────────────────────────────
-- Migration: Drop MINING and HYDROGRAPHIC from SurveyType enum
-- Date: 2026-07-02
-- Roadmap: docs/ROADMAP.md → Technical debt → Prisma schema cleanup
--
-- CONTEXT
--   The scope narrowing in v0.3 removed mining (11 files) and marine/
--   hydrographic (22 files) modules. The SurveyType enum in the DB
--   still includes MINING and HYDROGRAPHIC for backward compat.
--   This migration removes them.
--
-- PRE-FLIGHT (run manually BEFORE applying this migration):
--
--   1. Check for existing projects that reference the unwanted types:
--
--        SELECT id, name, survey_type, created_at
--        FROM projects
--        WHERE survey_type IN ('MINING', 'HYDROGRAPHIC')
--        ORDER BY created_at;
--
--   2. If any rows exist, reassign them:
--      - Mining projects → ENGINEERING (mining was folded into engineering)
--      - Hydrographic projects → TOPOGRAPHIC (hydro was folded into topo)
--
--        UPDATE projects SET survey_type = 'ENGINEERING'
--        WHERE survey_type = 'MINING';
--
--        UPDATE projects SET survey_type = 'TOPOGRAPHIC'
--        WHERE survey_type = 'HYDROGRAPHIC';
--
--   3. Verify no rows remain:
--
--        SELECT COUNT(*) FROM projects
--        WHERE survey_type IN ('MINING', 'HYDROGRAPHIC');
--        -- must return 0
--
--   4. Then apply this migration.
--
-- POSTGRESQL ENUM REMOVAL PATTERN
--   PostgreSQL does not support removing values from an existing enum.
--   The standard pattern is:
--     a. Create a new enum without the unwanted values
--     b. Alter each column to use the new enum
--     c. Drop the old enum
--     d. Rename the new enum to the original name
-- ──────────────────────────────────────────────────────────────────────────

-- Step 1: Create the new enum without MINING and HYDROGRAPHIC
CREATE TYPE "SurveyType_new" AS ENUM (
  'CADASTRAL',
  'TOPOGRAPHIC',
  'ENGINEERING',
  'CONTROL'
);

-- Step 2: Migrate each column that uses SurveyType
-- Find columns referencing the SurveyType enum and convert them.
-- Based on the Prisma schema, these columns are:
--   projects.survey_type
--   survey_jobs.survey_type  (if it exists)
--   (add others as needed — check schema.prisma for all SurveyType usages)

-- 2a. projects.survey_type
ALTER TABLE "projects"
  ALTER COLUMN "survey_type" DROP DEFAULT,
  ALTER COLUMN "survey_type" TYPE "SurveyType_new"
    USING (survey_type::text)::"SurveyType_new",
  ALTER COLUMN "survey_type" SET DEFAULT 'CADASTRAL';

-- 2b. survey_jobs.survey_type (uncomment if this table exists in your schema)
-- ALTER TABLE "survey_jobs"
--   ALTER COLUMN "survey_type" DROP DEFAULT,
--   ALTER COLUMN "survey_type" TYPE "SurveyType_new"
--     USING (survey_type::text)::"SurveyType_new",
--   ALTER COLUMN "survey_type" SET DEFAULT 'CADASTRAL';

-- Step 3: Drop the old enum
DROP TYPE "SurveyType";

-- Step 4: Rename the new enum to the original name
ALTER TYPE "SurveyType_new" RENAME TO "SurveyType";

-- ──────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFY (run manually AFTER applying):
--
--   -- Verify the enum has only 4 values
--   SELECT enumlabel FROM pg_enum
--   WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'surveytype');
--   -- expected: CADASTRAL, TOPOGRAPHIC, ENGINEERING, CONTROL
--
--   -- Verify projects table still works
--   SELECT survey_type, COUNT(*) FROM projects GROUP BY survey_type;
--
--   -- Regenerate Prisma client
--   npx prisma generate
-- ──────────────────────────────────────────────────────────────────────────
