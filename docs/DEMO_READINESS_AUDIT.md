# METARDU Demo Readiness Audit & Public Route Inventory

**Date**: September 2026  
**Auditor**: Lead Engineering Team  
**Status**: Completed & Verified  
**Purpose**: Systematically audit every route, workspace tab, calculation tool, and export format across METARDU to ensure professional reliability prior to presentation to licensed land surveyors, surveying firms, and the Institution of Surveyors of Kenya (ISK).

---

## 1. Executive Summary

This audit catalogs all routes and user touchpoints into five standardized readiness tiers:
- **Class A (Production Ready)**: Verified end-to-end; rigorous mathematical validation; high-density engineering aesthetics; suitable for live presentation.
- **Class B (Polish Needed)**: Core calculation and engine verified; cosmetic or copy improvements completed during this overhaul.
- **Class C (Experimental / Specialized)**: Advanced capabilities gated behind explicit feature flags or advanced tool docks.
- **Class D (Broken / Defective)**: Root cause resolved or entrypoint sanitized.
- **Class E (Redundant / Duplicative)**: Merged or replaced with canonical unified routes.

---

## 2. Route & Component Classification Matrix

### 2.1 Public & Marketing Routes

| Route | Classification | Status & Verification | Remediation Taken |
|---|---|---|---|
| `/` (Landing Page) | **Class A** | Overhauled to focus strictly on *"From field observations to finished professional survey deliverables"*. Eliminates generic marketing fluff. Added direct CTA to unauthenticated `/demo`. | Replaced unverified institutional endorsement badges with technical capability badges (Arc 1960, UTM Zone 36S/37S, COGO, Bowditch). |
| `/demo` (Interactive Showcase) | **Class A** | Fully standalone, zero-friction 5-step interactive workflow. No auth required. Real-time Bowditch traverse computation, mathematical audit trail, and watermarked deliverables. | Newly authored canonical route for prospect and ISK walkthroughs. |
| `/pricing` | **Class A** | Fully operational tier breakdown (Surveyor, Firm, Enterprise). | Updated to reflect transparent engineering tooling; no false regulatory accreditation claims. |
| `/login` & `/register` | **Class A** | NextAuth JWT authentication, verified with seeded credentials (`mohameddosho20@gmail.com`). | Tested live across sessions. |
| `/community` | **Class B** | Forum, jobs board, peer review exchange. | Navigation links polished and responsive. |

### 2.2 Project Lifecycle & Workspace Routes

| Route | Classification | Status & Verification | Remediation Taken |
|---|---|---|---|
| `/project/new` | **Class A** | Clarified project creation wizard with outcome-focused cards (Cadastral, Topographic, Engineering, Geodetic, Levelling, Deformation). | Streamlined inputs; Arc 1960 and UTM defaults enforced. |
| `/project/[id]` (Workspace) | **Class A** | Multi-step field-to-finish pipeline: 1. Overview $\rightarrow$ 2. Field Book $\rightarrow$ 3. Compute $\rightarrow$ 4. Map $\rightarrow$ 5. Deliverables $\rightarrow$ 6. Submit. | Fixed Step 3 ("Failed to fetch fieldbook") by targeting PostgreSQL table `project_fieldbook_entries`, adding point fallback, and eliminating dummy `ST1`. |
| `/project/[id]/cad-editor` | **Class A** | Dedicated CAD Canvas for cadastral survey plans, beacon editing, bearing/distance recalculation, and title block generation. | Fixed blank canvas bug by tightening `localStorage` check (`beacons.length > 0`), auto-resolving LR number from project record, and pulling live survey points. |
| `/project/[id]/map` | **Class A** | Interactive OpenLayers workspace map with beacon symbols, boundary lines, and layer controls. | Synchronized with project `boundary_data.adjustedStations`. |
| `/project/[id]/submission` | **Class A** | Pre-submission verification engine; statutory checks against Kenyan Survey Regulations 1994. | Verified preSubmit checklist calculations. |

### 2.3 Standalone Calculation & Engineering Tools

| Route / Tool | Classification | Status & Verification | Remediation Taken |
|---|---|---|---|
| `/map` (Full-Screen Map) | **Class A** | Standalone GIS environment with Layer Switcher, Coordinate Search, Measure Tools, and Projection Switcher. | Implemented independent collapsibility for **both** left rail and right dock with sleek screen-edge toggle pills. |
| `/tools/topo-drawing` | **Class A** | Topographic drawing composer and Konva vector preview. | Fixed contour bleeding via Konva neatline clipping group; repositioned Legend below North Arrow with boxed container to prevent collisions. |
| `/tools/pipe-network` | **Class C — limited engineering screening** | Current source validates and schedules an ordered linear drainage run, checks entered crown cover at surveyed manholes, and screens full/partial gravity flow with Manning's equation. It also calculates a **bounded full-bore pressure energy profile** only when every reach exceeds maximum free-surface capacity, flow is continuous, the user supplies the HGL at the downstream pipe outlet and each internal junction-loss K, and the computed HGL remains at or above every pipe crown. | This is not a mixed-flow/backwater or branched-network solver; it does not derive tailwater, outlet/control losses, storm criteria, or standards compliance. Intermediate terrain remains unsurveyed. Source tests do not prove production or field acceptance. |
| `/tools/drone-flight-plan`| **Class B** | Photogrammetric GSD, overlap, and flight line computation. | Pure numerical computation; functional without third-party cloud lock-in. |
| `/tools/geofence` | **Class B** | Ray-casting point-in-polygon boundary monitoring. | Verified with synthetic GPS feeds. |
| `/tools/fee-quotation` | **Class A** | Kenyan Survey Fees Calculator per Survey Act Cap 299 scales. | Tested for standard parcel sizes and boundary surveys. |

---

## 3. Remediation of Prior Identified Deficiencies

1. **Cadastral Workflow Step 3 Database Schema Mismatch (Class D $\rightarrow$ Class A)**:
   - *Problem*: Route queried non-existent table `field_book_entries` and attempted to update non-existent columns `area_m2`, `precision_ratio`, `linear_misclosure` on table `projects`.
   - *Fix*: Refactored `src/app/api/project/[id]/field-to-finish/route.ts` to query `project_fieldbook_entries`, set user RLS context, update `area_sqm`/`area_ha`, and persist traverse closure metrics inside `boundary_data`.

2. **CAD Canvas Blank Document Cache (Class D $\rightarrow$ Class A)**:
   - *Problem*: `src/app/project/[id]/cad-editor/page.tsx` treated empty array `parsed.beacons = []` as truthy, restoring empty state from `localStorage` instead of rendering project beacons. Title block lacked LR number regex fallback.
   - *Fix*: Enforced `parsed.beacons.length > 0`, added fallback to `/api/project/${projectId}/points`, and resolved LR Number from project metadata or regex.

3. **Topo Drawing Canvas Bleed & Legend Collision (Class B $\rightarrow$ Class A)**:
   - *Problem*: In `/tools/topo-drawing`, contour lines escaped outer drawing border, and Legend overlapped North Arrow in the top right.
   - *Fix*: Clamped contour polylines to inner neatline in `topoEntities.ts`, added a Konva clipping group in `TopoEntityCanvas.tsx`, and moved Legend into a dedicated container box below North Arrow.

4. **Map Rail Collapsibility (Class B $\rightarrow$ Class A)**:
   - *Problem*: Left tools rail on `/map` was persistently pinned on screen, preventing full-bleed canvas inspection.
   - *Fix*: Added collapsible state and screen-edge toggle buttons to `MapRail.tsx`, making both left rail and right dock independently collapsible.

5. **Duplicate Project Removal (Class E $\rightarrow$ Removed)**:
   - *Problem*: Duplicate project `2bab16b2-42ea-4407-a95a-8823c46ec660` cluttered user project list.
   - *Fix*: Removed duplicate from database and updated seed scripts.

---

## 4. Canonical Demo Path for Professional Surveyors & ISK

For demonstrating METARDU to licensed surveyors, follow this 5-step unauthenticated path at `/demo`:

1. **Step 1: Raw Field Observations (`/demo?step=fieldbook`)**:
   - Show field book entry with Face Left/Face Right observations or mean bearings and slope distances on Arc 1960 / UTM Zone 37S.
2. **Step 2: Mathematical Computation & EDM Reduction (`/demo?step=compute`)**:
   - Inspect Bowditch adjustment table.
   - Click "View Calculation" to inspect atmospheric ppm correction, curvature & refraction, grid scale factor, angular closure ($60''\sqrt{n}$), and linear misclosure ($e = \sqrt{\Delta E^2 + \Delta N^2}$).
3. **Step 3: Statutory QA Verification (`/demo?step=qa`)**:
   - Verify Bowditch precision ratio exceeds Kenya Survey Regulations 1994 Regulation 97 threshold ($1:5,000$ for Class B/C cadastral; $1:10,000$ for geodetic).
4. **Step 4: Vector CAD Canvas & Coordinate Plan (`/demo?step=cad`)**:
   - Inspect interactive SVG/Canvas deed plan with beacon coordinates (`MB1` through `MB5`), boundary line bearings, distances, and neatline title block.
5. **Step 5: Finished Professional Deliverables (`/demo?step=deliverables`)**:
   - Download watermarked sample DXF, CSV coordinate schedule, and traverse computation report.
