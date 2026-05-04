# METARDU — Industry Standards Audit & Phase 13 Fix Plan
**Date:** 2026-05-04 | **Auditor:** Based on RDM 1.1 (2025), SRVY2025-1, Survey Regulations 1994, Cap 299, BIVA real survey report, Cadastral Survey Standards Manual

---

## 1. EXECUTIVE SUMMARY

The core computations (Bowditch traverse, Rise & Fall levelling, HOC, 10√K tolerance) are **mathematically correct** and match RDM 1.1. However, compared to real-world industry deliverables, Metardu has significant gaps in:
- **Print output format** — real survey sheets require project headers, instrument details, surveyor registration, and declaration blocks
- **Traverse completeness** — missing angular/azimuth misclosure check required by RDM 1.1 Table 5.1
- **Terminology** — British/East African convention uses HPC not HI; Linear Misclosure not Linear Error
- **Submission compliance** — SRVY2025-1 requires structured submission numbers, signed declarations, specific file naming
- **UI consistency** — max-width, page header pattern, print templates inconsistent across tools

---

## 2. WHAT THE INDUSTRY STANDARDS REQUIRE (Source Documents)

### 2.1 RDM 1.1 Table 5.1 — Survey Control Accuracy

| Parameter | Requirement | App Status |
|---|---|---|
| Levelling closure | 10√K mm (K = km) | ✅ Correct |
| Traverse position misclosure | 1/10,000 or 1.67√(1.609K) | ⚠️ Shows ratio but not formula |
| **Azimuth misclosure** | **3.0" per station** | ❌ Not computed |
| **Max courses between checks** | **15** | ❌ Not tracked |
| Distance accuracy | 1/10,000 | ✅ Shown as ratio |

### 2.2 RDM 1.1 Table 5.2 — Detailed Survey Tolerances

| Feature | XY Tolerance | Z Tolerance |
|---|---|---|
| Structures, buildings, paved roads | ±0.025 m | ±0.015 m |
| Gravel pavements | ±0.050 m | ±0.025 m |
| All other areas | ±0.100 m | ±0.050 m |

**Status:** ❌ Not referenced anywhere in the app

### 2.3 RDM 1.1 Table 5.3 — Mobilisation Report
Required sections: Introduction, H&S considerations, Personnel, Equipment, Calibration, Field forms, Miscellaneous.
**Status:** ❌ App only has Table 5.4 (Topographic Field Survey Report). Missing Table 5.3.

### 2.4 SRVY2025-1 — Submission Number Format
```
[SurveyorRegistrationNo]_[YYYY]_[###]_[R##]
Example: RS149_2025_002_R01
```
**Status:** ❌ Not implemented. No submission number field in any output.

### 2.5 SRVY2025-1 — Required Output Structure
1. Survey Report (PDF) — must include Declaration Statement signed by Registered Surveyor
2. Final Spatial Data (zip: .shp, .shx, .dbf, .prj, .cpg)
3. Raw Data (zip with subfolders: GNSS Raw/, Digital Field Book/, Level Data/)

**Status:** ❌ Only PDF export; no shapefile/raw data export workflow

### 2.6 Real Survey Report Structure (from BIVA + SRVY2025-1)
A real topographic survey report has:
1. Cover page: project title, client, surveyor name + reg no, date, revision
2. List of Abbreviations
3. Executive Summary
4. Introduction (background, purpose)
5. Survey Methodology: datum, equipment (make/model/serial/calibration), control framework, field procedures, data processing, QA
6. Survey Results: benchmark tables (ID, easting, northing, elevation, description), coordinate tables, accuracy statistics, maps
7. Conclusion
8. References
9. Appendices (field sketches, calibration certs, raw data summary)

**App has:** 14 sections per RDM 1.1 Table 5.4 — structurally correct but missing calibration cert field, serial numbers, and Declaration Statement.

---

## 3. TERMINOLOGY GAPS (British/East African Convention)

| Wrong | Correct | Standard |
|---|---|---|
| HI (Height of Instrument) | **HPC** (Height of Plane of Collimation) | British/East African |
| Linear Error | **Linear Misclosure** | Standard survey term |
| HOC method label | **Height of Collimation** method | Full name |
| Grade | **Gradient** (in road context) | RDM 1.1 |

---

## 4. PRINT OUTPUT FORMAT GAPS

### Current State
- Level book print: basic monospace HTML, no project header
- Traverse print: no dedicated print view at all (copy to clipboard only)
- Survey report: no surveyor's certificate block, no signature line

### Industry Standard (from real reports)
Every printed survey sheet must have:
```
┌─────────────────────────────────────────────────────────────────┐
│ METARDU                                    PROJECT: ___________  │
│ Professional Survey Platform               CLIENT:  ___________  │
│                                            DATE:    ___________  │
│ LEVEL BOOK / TRAVERSE COMPUTATION          SURVEYOR: __________  │
│ Survey Regulations 1994 | RDM 1.1 (2025)  REG NO:  ___________  │
│                                            SHEET: ___ OF ___    │
└─────────────────────────────────────────────────────────────────┘
```
And a footer certificate block:
```
I certify this survey was carried out under my supervision in accordance
with the Survey Regulations 1994 and RDM 1.1 (2025).
Signed: _____________ Reg No: _____________ ISK No: _____________
```

---

## 5. UI CONSISTENCY GAPS

| Issue | Files Affected | Fix |
|---|---|---|
| Page max-width: some max-w-6xl, some max-w-7xl | All tool pages | Standardize to max-w-7xl |
| Page subtitle sometimes missing | Several tool pages | All pages need subtitle with standard reference |
| Print HTML uses inline styles | LevelBook.tsx, traverse copy | Create shared print template |
| Angular misclosure missing from traverse | traverse/page.tsx | Add azimuth check panel |
| "HI" in level book | LevelBook.tsx, leveling/page.tsx | Rename to HPC throughout |
| Tools page missing tool descriptions | tools/page.tsx | Add subtitle to each tool card |
| No consistent page header component | All pages | Create PageHeader component |

---

## 6. MISSING FEATURES vs INDUSTRY STANDARD

1. **Angular misclosure in traverse** (azimuth check: ≤3.0"/station, max 15 courses) — RDM 1.1 Table 5.1
2. **Mobilisation Report** (Table 5.3) — separate from survey report
3. **Survey submission number generator** — SRVY2025-1
4. **Surveyor's Declaration block** in all print outputs
5. **Equipment calibration cert reference** in survey report
6. **Cross-section spot level capture** at 20m intervals (RDM 1.1 Section 5.6.2)
7. **Survey Control Marks Register** format (RDM 1.1 Section 5.6.3)
8. **RDM 1.1 Table 5.2 tolerances** displayed in field data capture screens

---

## 7. WHAT IS CORRECT ✅

- Bowditch & Transit traverse adjustment — mathematically correct
- Rise & Fall levelling computation — correct
- Height of Collimation method — correct
- 10√K mm closure tolerance — confirmed vs RDM 1.1 Table 5.1
- RDM 1.1 accuracy grading in traverse (First/Second order classification)
- WCB (Whole Circle Bearing) input format — correct Kenya standard
- UTM auto-detection for all 47 counties
- Tacheometry, GNSS baseline, EDM corrections
- Survey Act Cap 299 references
- Dark theme CSS variable system — well-structured
- Card/button/table component system — consistent within itself

---

## 8. PHASE 13 BRIEF PLAN

| Brief | Title | Priority | Scope |
|---|---|---|---|
| 13.1 | UI Consistency + Print Standards | 🔴 CRITICAL | PageHeader, print template, max-width, HPC terminology |
| 13.2 | Traverse Angular Misclosure | 🔴 CRITICAL | Azimuth check 3.0"/station, 15-course limit |
| 13.3 | Survey Report: Submission Number + Declaration | 🟡 HIGH | SRVY2025-1 compliance, certificate block |
| 13.4 | Mobilisation Report (Table 5.3) | 🟡 HIGH | New report type |
| 13.5 | RDM 1.1 Table 5.2 Tolerances Display | 🟢 MEDIUM | Detail survey tolerances |
| 13.6 | Survey Control Marks Register | 🟢 MEDIUM | Register format per RDM 1.1 s5.6.3 |
