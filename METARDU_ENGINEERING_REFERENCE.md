# METARDU ENGINEERING REFERENCE

> Master reference document for the METARDU project.
> Professional land surveying computation platform for Kenya / East Africa.
> Last updated: 2026-05-04

---

## 1. PROJECT OVERVIEW

| Field | Value |
|-------|-------|
| Name | METARDU -- Professional Survey Computation Platform |
| URL | https://metardu.duckdns.org |
| GitHub | git@github.com:error302/metardu.git |
| VM Host | 34.170.248.156 (user: mohameddosho20@metardu) |
| Version | 1.0.1 |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode, target es2017) |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | NextAuth.js v4 |
| Caching | Redis |
| Maps | OpenLayers (Kenya bounding box) |
| State | Zustand v5 |
| UI | Radix UI + Tailwind CSS 3 + shadcn/ui |
| PWA | @ducanh2912/next-pwa |
| Mobile | Capacitor (Android) |
| Monitoring | Sentry |
| Deployment | Docker + GCP Compute Engine VM |

### Codebase Scale

| Category | Count |
|----------|-------|
| Page routes (page.tsx + route.ts) | ~549 |
| Page components (page.tsx only) | ~158 |
| Components (src/components/) | ~271 |
| Library modules (src/lib/) | ~332 |
| Type definition files (src/types/) | 43 |
| API endpoints (route.ts) | ~174 |
| Print modules (src/lib/print/) | 10 |

---

## 2. ARCHITECTURE SUMMARY

### 2.1 App Router Structure

The application uses Next.js 14 App Router with route groups for organization:

- `/app/(auth)/` -- authentication pages (login, register, reset)
- `/app/(dashboard)/` -- authenticated dashboard pages
- `/app/(tools)/` -- all computation tool pages under `/tools/`
- `/app/(enterprise)/` -- enterprise/admin features
- `/app/api/` -- all API route handlers (~174 endpoints)

### 2.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| `output: 'standalone'` | Smaller Docker image, lower RAM on VM |
| OpenLayers externalized on server | `config.externals.push(/^ol/)` -- OL is client-only |
| Tree-shaking for Radix/lucide/recharts | `optimizePackageImports` reduces bundle size |
| SWC minifier enabled | 20x faster than Terser |
| `ol` excluded from tree-shaking | Side-effectful modules (e.g. `ol/proj/proj4`) break with standalone output |
| Redis caching layer | Rate limiting, session caching, login limiter |
| Zustand for client state | Lightweight alternative to Redux/React Query |

### 2.3 Security Headers (next.config.js)

| Header | Value |
|--------|-------|
| Content-Security-Policy | Full CSP with nonce-based script-src via middleware |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self) |
| Strict-Transport-Security | max-age=63072000 (production only) |

### 2.4 Dark Theme System

CSS variable-based dark theme using `next-themes`. All color tokens defined as CSS custom properties on `:root` and `[data-theme='dark']` selectors.

---

## 3. COMPLETED PHASES (Master Bug Log)

### Phase 1-3: Mobile UI Fixes (Task ID: 1)

**Scope:** Fix mobile navigation, FieldBook crash, blank map screen, dashboard responsiveness.

**Work completed:**
- Fixed mobile navigation bar layout and touch targets
- Resolved FieldBook crash on mobile devices
- Fixed OpenLayers map blank screen (Kenya bounding box initialization)
- Dashboard responsive layout corrections
- Approximately 200 `any` type annotations replaced with proper TypeScript types
- 3 commits pushed to main

**Status:** CLOSED

---

### Phase 4: Auth Refactor (Task IDs: auth-fix-1, auth-deploy-2)

**Scope:** Migrate database from SQLite to PostgreSQL, fix authentication system.

**Work completed:**
- Switched primary database from SQLite (better-sqlite3) to PostgreSQL (pg)
- Disabled Row-Level Security (RLS) on 102 tables -- RLS was blocking ALL write operations
- Fixed migration runner (TypeScript compiled to JavaScript for execution)
- Fixed auth login headers (NextAuth session handling)
- Full auth flow verified: login, session persistence, protected routes, logout
- PostgreSQL connection string configured via `.env.local`

**Status:** CLOSED

---

### Phase 5: PayPal / SMTP / Login (Task ID: paypal-smtp-login-fix-3)

**Scope:** Restore service uptime, add payment gateway, email functionality.

**Work completed:**
- Fixed 502 downtime (VM health check and container restart)
- PayPal Hosted Button integration added (client-side, no server-side API)
- SMTP email working (Gmail app password for nodemailer)
- World contour map added to login page (d3-contour visualization)
- Password reset flow fixed and verified

**Status:** CLOSED

---

### Phase 6: Original 19/19 Audit Bugs (All CLOSED)

**Scope:** Address all 19 bugs identified in original security and quality audit.

| Bug | Fix | Status |
|-----|-----|--------|
| React Query unused dependency | Full removal from codebase | CLOSED |
| next-intl unused dependency | Full removal from codebase | CLOSED |
| .env files in git history | Purged from entire git history | CLOSED |
| Dual auth system (NextAuth + custom) | Unified to NextAuth only | CLOSED |
| Dead code across codebase | Cleaned up | CLOSED |
| Missing XSS sanitization | DOMPurify added (dompurify ^3.3.3) | CLOSED |
| Missing CSP headers | Full CSP policy in next.config.js | CLOSED |
| Security hardening gaps | Headers, rate limiting, HSTS | CLOSED |
| Redis login rate limiter missing | Implemented login attempt limiter | CLOSED |

**Status:** All 19 bugs CLOSED

---

### Phase 7: TypeScript Error Fix Campaign (79 errors to 0)

**Scope:** Achieve zero TypeScript compilation errors across entire codebase.

**Work completed:**
- `tsconfig.json`: `downlevelIteration` not needed (target es2017 supports it natively)
- `NavBar`: Optional chaining fixes for undefined session/user properties
- Batch type fixes across 40+ files
- Proper typing for API handlers, database queries, form data, and component props
- Strict mode maintained (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`)

**Result:** `tsc --noEmit` exits with code 0. Zero errors.

**Status:** CLOSED

---

### Phase 8: Phase 13 Industry Standards Compliance (6/6 Briefs)

**Scope:** Ensure all survey computations and outputs comply with RDM 1.1 (2025), SRVY2025-1, Survey Regulations 1994, and Cap 299.

#### Brief 13.1: UI Consistency

- 48 pages migrated to standardized `PageHeader` component
- 8 max-width fixes (standardized to `max-w-7xl`)
- Consistent subtitle, description, and reference citation pattern
- Print template standardization via `buildPrintDocument.ts`

**Status:** COMPLIANT

#### Brief 13.2: Traverse Angular Misclosure

- Angular misclosure already computed and validated
- Standard: 3.0" per station, maximum 15 courses between checks
- Azimuth check panel in traverse computation page
- RDM 1.1 Table 5.1 compliance verified

**Status:** COMPLIANT (pre-existing)

#### Brief 13.3: Submission Number + Declaration

- Submission number format per SRVY2025-1: `[RegNo]_[YYYY]_[###]_[R##]`
- Surveyor's Declaration block in print outputs
- Surveyor Certificate block in print documents

**Status:** COMPLIANT (pre-existing)

#### Brief 13.4: Mobilisation Report

- Mobilisation Report page per RDM 1.1 Table 5.3
- Required sections: Introduction, H&S, Personnel, Equipment, Calibration, Field forms, Miscellaneous

**Status:** COMPLIANT (pre-existing)

#### Brief 13.5: Detail Tolerances

- RDM 1.1 Table 5.2 tolerances displayed in detail survey tools
- Tolerance values: structures (+-0.025m XY, +-0.015m Z), gravel (+-0.050m, +-0.025m), other (+-0.100m, +-0.050m)

**Status:** COMPLIANT (pre-existing)

#### Brief 13.6: Control Marks Register

- Control Marks Register page per RDM 1.1 Section 5.6.3
- Format includes point ID, easting, northing, elevation, type, description, date established

**Status:** COMPLIANT (pre-existing)

---

## 4. CURRENT STATUS DASHBOARD

| Category | Status | Details |
|----------|--------|---------|
| TypeScript Compilation | ✅ 0 errors | `tsc --noEmit` EXIT 0 |
| Original 19 Bugs | ✅ All closed | Committed and pushed |
| Phase 13 (6 briefs) | ✅ All compliant | RDM 1.1, SRVY2025-1 |
| Auth System | ✅ NextAuth only | Dual auth eliminated |
| Security | ✅ Hardened | DOMPurify, CSP, rate limiting |
| UI Consistency | ✅ Standardized | PageHeader on all 48+ tool pages |
| Print System | ✅ Complete | Certificate block, 10 print modules |
| HPC Terminology | ✅ Correct | No HI usage |
| Max-Width | ✅ Standardized | `max-w-7xl` (2 intentional exceptions) |
| Dead Code | ✅ Cleaned | React Query, next-intl removed |
| .env Security | ✅ Purged | Removed from entire git history |
| VM Deployment | ⬜ Pending | Latest code not yet deployed |

---

## 5. GIT COMMIT HISTORY (Recent)

| Hash | Description |
|------|-------------|
| `f7e6d5d` | feat: Phase 13.1 -- PageHeader migration, max-width standardization |
| `c228095` | fix: security hardening, DOMPurify sanitization, dead code cleanup |
| `c9ce421` | fix: zero TypeScript errors -- tsconfig target, NavBar optional chaining |
| `b6bf8d8` | refactor: cleanup dead code, Redis login limiter |
| `65583c1` | fix: unify auth to NextAuth only |
| `631476a` | fix: remove dead deps, purge .env from git history |

---

## 6. COMPUTATION INTEGRITY RULES

All computation modules must comply with the rules defined in `METARDU-COMPUTATION-INTEGRITY.md`.

### Golden Rule

Every formula must cite its source in a code comment before it is written. If you cannot cite a source, do not write the formula. Stop and ask.

### Approved Sources

| Topic | Primary Source | Secondary |
|-------|---------------|----------|
| Traverse adjustment | Basak Ch. 10-11 | Ghilani & Wolf Ch. 12 |
| Leveling (Rise & Fall, HOC) | Basak Ch. 5-7 | Ghilani & Wolf Ch. 5-6 |
| COGO (Inverse, Polar, Intersection, Resection) | Ghilani & Wolf Ch. 10 | Basak Ch. 3 |
| Area (Shoelace) | Ghilani & Wolf Ch. 12.5 | Basak Ch. 4 |
| Horizontal curves | RDM 1.3 Kenya s5.2 | Ghilani & Wolf Ch. 24 |
| Vertical curves | RDM 1.3 Kenya s5.4 | Ghilani & Wolf Ch. 25 |
| EDM corrections | USACE EM 1110-1-1005 s3-5 | NOAA NOS NGS 5 |
| Accuracy classification | RDM 1.1 Kenya Table 2.4 | Ghilani & Wolf Ch. 12 |
| Leveling misclosure | RDM 1.1 Kenya Table 5.1 | USACE EM 1110-1-1005 |

### Kenya Standard Priority

- Traverse accuracy: RDM 1.1 Table 2.4 -- `C = m*sqrt(K)` with m = 0.5/0.7/1.0/1.3/2.0 mm/sqrt(km)
- Leveling misclosure: RDM 1.1 Table 5.1 -- **10*sqrt(K) mm** (NOT 12*sqrt(K))
- Horizontal curves: RDM 1.3 Table 3-3/3-4
- Sight distance: RDM 1.3 Table 3-5 (SSD), Table 3-6 (PSD)
- Superelevation: RDM 1.3 s5.3 -- maximum 8%, rate of change 1% per 2.4m

### Mandatory Arithmetic Checks

| Computation | Check |
|-------------|-------|
| Level book | Sum(BS) - Sum(FS) = Last RL - First RL |
| Traverse | Sum of Departures and Sum of Latitudes independently computed |
| Area (Shoelace) | Computed twice: Sum(En*Nn+1) and Sum(Nn*En+1) separately |
| Vertical curve | RL at EVC via formula = EVC RL via grades |
| Curve CT chainage | CT via IP+T = CT via TC+L |

### Source Citation Format

```typescript
// Source: [Author], [Book Title], [Chapter/Edition]
// Formula description
const result = formula
```

### Files Under These Rules

- `src/lib/engine/**/*.ts`
- `src/lib/computations/**/*.ts`
- `src/lib/reports/**/*.ts`
- `src/lib/validation/**/*.ts`
- `src/lib/python/**/*.py`
- Any future computation module

**Not applicable to:** UI layout, database queries, file parsing, PDF formatting, authentication, routing.

---

## 7. DEPLOYMENT CHECKLIST

### Prerequisites

- SSH key configured: `~/.ssh/id_ed25519`
- Access to VM: `34.170.248.156` as `mohameddosho20@metardu`
- `.env.local` exists on VM with PostgreSQL connection string

### Step-by-Step Procedure

```bash
# 1. SSH to VM
ssh -i ~/.ssh/id_ed25519 mohameddosho20@34.170.248.156

# 2. Navigate to project and pull latest code
cd ~/metardu
git pull origin main

# 3. Verify environment file exists
cat .env.local | grep DATABASE_URL

# 4. Run database migrations (if any pending)
npm run migrate

# 5. Build Docker images
docker compose build

# 6. Start containers in detached mode
docker compose up -d

# 7. Verify deployment
curl -s -o /dev/null -w "%{http_code}" https://metardu.duckdns.org
# Expected: 200

# 8. Check container health
docker compose ps
docker compose logs --tail=50 app
```

### Rollback Procedure

```bash
cd ~/metardu
git log --oneline -5          # Find previous good commit
git checkout <commit-hash>
docker compose build
docker compose up -d
```

### Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | NextAuth session encryption key |
| `NEXTAUTH_URL` | Public URL for OAuth callbacks |
| `REDIS_URL` | Redis connection for rate limiting |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (for CSP headers) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Gmail SMTP for email |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error monitoring (optional) |

---

## 8. KNOWN LIMITATIONS

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| PayPal server-side API credentials invalid | Cannot verify payments server-side | PayPal Hosted Button works as client-side fallback |
| ESLint not enforced in build | Lint errors may accumulate | `ignoreDuringBuilds: true` in next.config.js |
| TypeScript not checked during build | Type regressions possible if `tsc` not run | `ignoreBuildErrors: true`; TypeScript checked via `tsc --noEmit` separately |
| No CI/CD pipeline | Manual deployment required | Deployment checklist in Section 7 |
| Better-sqlite3 still in dependencies | Unused since PostgreSQL migration | Harmless; kept for potential local dev scenarios |
| Images unoptimized | `images.unoptimized: true` | VM has no image optimization needs |

---

## 9. 11 ENGINEERING PERSONAS CHECKLIST

| # | Persona | Status | Notes |
|---|---------|--------|-------|
| 1 | Survey Computation Auditor | ✅ Pass | All formulas cite RDM 1.1 / Basak / Ghilani & Wolf per METARDU-COMPUTATION-INTEGRITY.md |
| 2 | Kenya Regulations Compliance Officer | ✅ Pass | Survey Act Cap 299, Survey Regulations 1994, SRVY2025-1, RDM 1.1 |
| 3 | TypeScript Type Safety Engineer | ✅ Pass | 0 compilation errors, strict mode (`strict`, `noImplicitAny`, `strictNullChecks`) |
| 4 | Security & Auth Specialist | ✅ Pass | DOMPurify XSS sanitization, CSP headers, Redis rate limiting, NextAuth only |
| 5 | UI/UX Consistency Reviewer | ✅ Pass | PageHeader on all tool pages, `max-w-7xl` standard, dark theme CSS variables |
| 6 | Print & Document Standards Expert | ✅ Pass | Surveyor's Certificate block, 10 print modules, `buildPrintDocument` shared template |
| 7 | Terminology Standards Checker | ✅ Pass | HPC (not HI), Linear Misclosure (not Error), Gradient (not Grade in road context) |
| 8 | Dead Code & Dependency Auditor | ✅ Pass | React Query removed, next-intl removed, .env purged from git history |
| 9 | Git & Deployment Hygiene Specialist | ✅ Pass | Clean commit history, no secrets in repo, force push procedure documented |
| 10 | ESLint Code Quality Reviewer | ⬜ Not done | `ignoreDuringBuilds: true`; lint rules not enforced in build pipeline |
| 11 | Performance & Optimization Analyst | ⬜ Not done | No formal performance audit conducted; bundle analysis available via `ANALYZE=true` |

---

## 10. KEY FILES INDEX

### Configuration

| File | Purpose |
|------|---------|
| `next.config.js` | Next.js config: CSP headers, Webpack externals, PWA, Sentry |
| `tsconfig.json` | TypeScript config: strict mode, es2017 target, path aliases |
| `package.json` | Dependencies and scripts |
| `tailwind.config.ts` | Tailwind CSS theme and plugins |
| `middleware.ts` | Auth middleware, nonce-based CSP |
| `docker-entrypoint.sh` | Docker container startup |

### Core Libraries

| File | Purpose |
|------|---------|
| `src/lib/auth/` | NextAuth configuration, RBAC, session helpers |
| `src/lib/print/` | 10 print modules + `buildPrintDocument.ts` shared builder |
| `src/lib/standards/rdm11.ts` | RDM 1.1 constants and reference data |
| `src/lib/validation/toleranceEngine.ts` | Tolerance computation per RDM 1.1 |
| `src/lib/engineering/` | Engineering computations (volume, curves, drainage, etc.) |
| `src/lib/gnss/` | GNSS coordinate handling, datum transformation, NMEA parsing |
| `src/lib/map/` | OpenLayers map layers, projections, cadastral editing |
| `src/lib/geo/` | Coordinate transforms, CORS handling |
| `src/lib/export/` | DXF, GeoJSON, Shapefile, LandXML, IFC export |
| `src/lib/legal/` | CLA forms, DPA 2019, land law engine |
| `src/lib/submission/` | SRVY2025-1 submission assembly and validation |
| `src/lib/parsers/` | CSV, PDF, DXF, BOQ, total station data parsers |
| `src/lib/payments/` | PayPal, M-Pesa, Stripe payment integrations |
| `src/lib/rateLimit.ts` | Redis-based rate limiter |
| `src/components/shared/PageHeader.tsx` | Standardized page header component |

### Type Definitions

| Directory | Contents |
|-----------|----------|
| `src/types/` | 43 type definition files covering all domain models |

### API Routes

| Directory | Contents |
|-----------|----------|
| `src/app/api/` | ~174 API route handlers |

---

## 11. DEVELOPMENT COMMANDS

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build (Next.js) |
| `npm run typecheck` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | ESLint (not enforced in build) |
| `npm run test` | Run Jest test suite |
| `npm run test:coverage` | Jest with coverage report |
| `npm run test:engineering` | Engineering module tests only |
| `npm run migrate` | Run database migrations |
| `npm run migrate:status` | Check migration status |
| `npm run mobile:sync` | Capacitor Android sync |
| `npm run mobile:build` | Full mobile build (web + Android APK) |
| `ANALYZE=true npm run build` | Bundle size analysis |

---

## 12. REGULATORY REFERENCES

| Document | Full Name | Usage |
|----------|-----------|-------|
| RDM 1.1 (2025) | Road Design Manual, Volume 1.1 -- Survey Standards | Accuracy standards, tolerances, control specifications |
| RDM 1.3 | Road Design Manual, Volume 1.3 -- Geometric Design | Horizontal/vertical curves, sight distance, superelevation |
| SRVY2025-1 | Survey Submission Requirements (2025) | Submission number format, output structure, declarations |
| Survey Regulations 1994 | Survey Regulations under Cap 299 | Legal framework for cadastral surveys in Kenya |
| Cap 299 | Survey Act, Chapter 299, Laws of Kenya | Governing legislation for survey practice |
| Survey Regulations 1994, Reg. 97 | Specific regulation references | Accuracy and method requirements |
| BIVA | Kenya real survey report template | Industry-standard report format reference |
| Cadastral Survey Standards Manual | Government cadastral standards manual | Control marks, beacon types, field procedures |

---

## 13. SUPPORT AND CONTACTS

| Role | Access |
|------|--------|
| Developer | mohameddosho20@metardu via SSH |
| Repository | git@github.com:error302/metardu.git |
| Live Site | https://metardu.duckdns.org |
| VM IP | 34.170.248.156 |

---

*This document is maintained alongside the codebase. Update after every significant change.*
