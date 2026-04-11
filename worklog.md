---
Task ID: 1
Agent: Main Agent
Task: Fix METARDU - database error, logo, and UI issues

Work Log:
- Cloned and analyzed full codebase from https://github.com/error302/metardu
- Analyzed 5 user screenshots showing the live app
- Identified 5 critical bugs and multiple UI issues
- Created comprehensive SQL migration (fix_all_missing_columns.sql)
- Fixed 'subtype' → 'survey_type' references in 5 files
- Redesigned /project/new page (removed duplicate header, improved form UX)
- Generated new professional logo/favicon images

Stage Summary:
- **BUG 1 (CRITICAL)**: `survey_type` column missing from projects table — created migration SQL
- **BUG 2**: Code references non-existent `subtype` column — fixed in 5 files
- **BUG 3**: Double header on /project/new — removed duplicate header, added breadcrumb
- **BUG 4**: `client_name` and `surveyor_name` columns never added — included in migration
- **BUG 5**: Logo/favicon not updated — generated new professional images
- **UI Improvements**: Redesigned project creation form with better UX, hemisphere toggle buttons, loading spinner, proper error banners, cleaner layout

Files Modified:
1. supabase/migrations/fix_all_missing_columns.sql (NEW)
2. src/app/project/[id]/layout.tsx (subtype → survey_type)
3. src/app/project/[id]/page.tsx (subtype → survey_type)
4. src/app/project/[id]/submission/page.tsx (subtype → survey_type)
5. src/app/api/submission/preview/route.ts (subtype → survey_type)
6. src/components/compute/HydroPanel.tsx (subtype → survey_type, 3 instances)
7. src/lib/submission/assembleSubmission.ts (subtype → survey_type)
8. src/app/project/new/page.tsx (full redesign)
9. public/metardu-logo.jpg (new image)
10. public/apple-touch-icon.png (new image)
