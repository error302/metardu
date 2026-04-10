# METARDU

Professional surveying calculation platform for land surveyors - the complete replacement for expensive software like Trimble, Leica, and AutoCAD.

## Why METARDU?

Surveying is mentally exhausting. Long days collecting observations, hours of manual computation, misclosure checks, and report writing. METARDU handles everything so you can focus on what matters - taking accurate observations.

## Survey Types

METARDU supports **9 survey types** with dedicated project workflows:

1. **Cadastral Survey** — Boundary surveys with LR number, deed plan generation, Bowditch traverse adjustment
2. **Engineering Survey** — Road design, levelling (10√K mm closure per RDM 1.1), cross-sections, earthworks
3. **Topographic Survey** — Tacheometry, radial surveys, DTM generation, contour extraction
4. **Geodetic / Control Survey** — GNSS baselines, network adjustment, accuracy classification
5. **Mining Survey** — Underground traverse, stockpile volumes, setting-out data
6. **Hydrographic Survey** — Bathymetric soundings, tidal corrections, depth reduction
7. **Drone / UAV Photogrammetry** — GCP management, point cloud processing, orthophoto generation
8. **Deformation / Monitoring Survey** — Epoch comparisons, displacement vectors, statistical analysis
9. **Mixed Discipline Survey** — Combined observations from multiple survey types

### 5-Step Project Workflow

Every project follows the same workflow:
1. **Setup** — Enter project details, LR number, client info, UTM zone
2. **Field Book** — Record observations (columns auto-switch per survey type)
3. **Compute** — Run calculations (Bowditch, Rise & Fall, volumes, etc.)
4. **Review** — Check results, diagrams, closure reports
5. **Submission** — Generate and download all required documents

## Features

### Data Import
- **Universal Importer** — Auto-detects format: LAS, LAZ, PLY, CSV, XML, DXF, GSI, JobXML, RINEX, Trimble RW5
- **Drone Support** — Pix4D, DJI flight logs, point cloud processing

### Calculations (via math-engine)
- Traverse adjustment (Bowditch/Transit)
- Levelling (Rise & Fall, Height of Collimation)
- COGO (radiation, intersection, resection)
- Volume computation (prismoidal, end-area)
- Coordinate transforms (WGS84 ↔ UTM, all 60 zones)
- Curve geometry (horizontal/vertical)
- Earthworks (cut/fill, mass haul)

### Document Generation
- Survey reports per RDM 1.1
- Deed plans (Form No. 4)
- Working diagrams
- Longitudinal/cross-sections
- Setting-out sheets
- Coordinate schedules
- Shapefile/DXF export

### Online Services
- GNSS baseline processing
- Live coordinate transformation API
- Benchmark database lookup
- Kenya CORS RTK corrections

### Integration
- Kenya NLIMS, Uganda NLIS, Tanzania Land Registry
- Professional body integration (ISK, EBK)
- M-Pesa, Stripe payment

## Tech Stack

- Next.js 14 (App Router)
- TypeScript 5.x (95%+ coverage)
- Tailwind CSS
- Supabase (Auth + PostgreSQL + RLS)
- OpenLayers + Leaflet (maps)
- Capacitor (Android mobile)
- PWA support (offline-first)
- Sentry (error monitoring)
- Jest + React Testing Library

## Supported

- **14 Languages**: EN, SW, FR, AR, PT, ES, ZH, JA, RU, HI, ID, AM, HA, DE
- **60 UTM Zones**: All zones, both hemispheres
- **13 Currencies**: KES, UGX, TZS, NGN, GHS, ZAR, INR, IDR, BRL, AUD, GBP, EUR, USD

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Build mobile app (requires Java)
npm run mobile:build
```

## Pages

- `/` — Landing page
- `/project/new` — Create new project
- `/project/[id]` — Project workspace (5-step workflow)
- `/fieldbook` — Digital field book
- `/tools/*` — Standalone survey tools
- `/community` — Surveyor community
- `/marketplace` — Templates & services
- `/jobs` — Job board
- `/online` — Coordinate services
- `/parcel` — Parcel search
- `/kencors` — RTK corrections
- `/checkout` — Payment
- `/pricing` — Subscription plans

## Build

- **Web**: 181 routes, builds successfully
- **Mobile**: Capacitor Android (requires Java for APK build)

## License

MIT

---

Built for African surveyors, by understanding their challenges.