# METARDU — Open Issues (Deferred)

**Last Updated:** 2026-04-15

## Severity Key
- **[CRITICAL]** — App-breaking, security hole, compliance violation
- **[HIGH]** — Data loss risk, incorrect computation, broken route
- **[MEDIUM]** — Degraded UX, missing validation
- **[LOW]** — Code quality, cleanup

---

## No Open Critical or High Issues

All critical and high severity items from the audit have been resolved. The application is production-ready.

---

## Deferred Items (LOW Severity)

### 1. Branding Cleanup
**Severity:** [LOW]
**Files:** 3 legacy references in documentation
- `TESTING.md:104` — Token URL
- `MOBILE_BUILD.md:71` — Android keystore alias  
- `MIGRATION.md:531` — Email address

**Fix:** Simple find-replace in docs:
```
GeoNova → Metardu
geonova → metardu
```

**Effort:** 5 minutes — can be done in one commit.

---

### 2. localStorage Migration (Roadmap)
**Severity:** [MEDIUM] (not breaking, technical debt)
**Count:** 53 occurrences across 14 files

**Current state:** App functions with localStorage — no outages reported.

**Required fix:** Migrate to:
- Language preference → Supabase user preferences table
- Equipment/instruments → Supabase tables
- Guide progress → Supabase user progress table
- Map state → Supabase project settings
- Auth redirects → cookies (via @supabase/ssr)

**Effort:** 2-4 hours across multiple files

**Not a blocker for go-live** — functions correctly, but should be addressed in post-launch cleanup.

---

## Suggested Next Steps

1. **Immediate:** Run branding cleanup (5 min)
2. **Post-launch:** localStorage → Supabase migration (2-4 hr)

---

## Audit Status: COMPLETE ✅

All critical path functionality verified and working:
- TypeScript: 0 errors
- callPythonCompute: exported and working
- DXF generators: initialiseDXFLayers() called
- Tolerance: 10√K correct
- Middleware: NextAuth JWT working
- PM2: Correct script path

**Verdict:** Ready for production deployment.