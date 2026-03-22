# Survey Plan Renderer — Design Specification
**Date:** 2026-03-22
**Status:** Approved
**Author:** error302 / METARDU agent

---

## 1. Overview

Build a professional-grade survey plan renderer for METARDU that produces output indistinguishable from a real licensed surveyor's stamped plan (e.g. KRCMAR Surveyors Ltd., State Surveys). The plan must be print-ready at A3 landscape, fileable at a Land Titles Office without modification.

**Scope:** Boundary Identification Plan only (parcel boundaries, beacons, bearings, distances, area, north arrow, scale bar, information panel). Topographic and multi-sheet support are out of scope for this phase.

---

## 2. Design Drawing Standard

Every element below is **non-negotiable** — output that violates any rule is rejected.

### 2.1 Paper & Background
- Drawing surface: **pure white** `#FFFFFF`, no gradients, no dark backgrounds
- Lot polygon fill: **flat beige/cream** `#F5EDD6` — universal marker of a real survey plan
- No decorative fills anywhere on the canvas

### 2.2 Typography
- **Only monospace fonts** on the drawing canvas: `Share Tech Mono` (already loaded), fallback `Courier New`
- No sans-serif, no Inter, no Roboto anywhere on the drawing surface
- Font sizes:
  - Street name: **14px bold, letter-spacing 3px**
  - Bearings on lines: **8.5px bold**
  - Distances on lines: **8px regular**
  - Lot number (watermark): **28px bold, 12% opacity**, centred on parcel
  - Area label: **11px regular**
  - PIN / parcel reference: **8px regular**
  - Adjacent lot IDs: **11px bold, 45% opacity**, rotated to face inward
  - Axis tick labels: **8px regular**
  - Annotations / callouts: **7.5px bold**

### 2.3 Boundary Lines
- Subject land boundary: `2.5px solid #000000`
- Other/adjacent boundaries: `1px solid #000000`
- Fence on boundary: `0.8px dashed #888888`, dash pattern `[4,4]`
- Chain link fence: `0.8px solid` with perpendicular tick marks every 8px
- Road edge lines: two parallel horizontal lines — outer `2px`, inner `0.8px` — with street name centred between them in bold caps

### 2.4 Survey Monuments
At every boundary corner:
- **Found monument**: solid green filled square `10×10px`, colour `#1A6B32`
- **Set monument**: open green circle `r=5px`, stroke `2px`, colour `#1A6B32`
- **Masonry Nail / Metal Pin (found)**: solid red filled circle `r=4px` (`#C0392B`) with a white crosshair inside. Always accompanied by a red dashed leader line and a red callout label reading `"Masonry Nail / 1-00 on production / of boundary"` — placed at minimum 2 corners
- Corner intersection dots: small filled black circle `r=1.5px` surrounded by an open black circle `r=4px, 1.5px stroke` at every vertex

### 2.5 Bearings & Distances on Boundary Lines
Every boundary segment carries **two labels** rendered directly on the line:
- **Line 1 (above the line)**: Astronomical bearing in `DEG°MM'SS"` format, bold, offset `−4px` perpendicular above the line midpoint
- **Line 2 (below the line)**: Distance in metres to `2 decimal places` followed by `" m"`, offset `+4px` perpendicular below the line midpoint
- Text must never be upside-down — flip by `+180°` if segment angle exceeds `±90°`
- Text readable from outside the parcel when possible

### 2.6 North Arrow
Hand-crafted SVG north arrow:
- Vertical shaft `56px` tall
- North half: **filled black arrowhead** (solid triangle pointing up)
- South half: **open/outlined arrowhead** (stroke only, pointing down)
- `"N"` label in `bold 11px monospace`, positioned `8px` above the arrowhead tip
- Place at top-left inside the drawing margin

### 2.7 Scale Bar
Physical alternating black/white segmented bar at bottom-left:
- 4 segments, each representing an equal ground distance
- Alternating fill: segment 0,2 = black; segment 1,3 = white with black stroke `0.8px`
- Ground distance labels above each segment break (0, 50, 100, 150, 200...)
- `"SCALE"` and `"METRES"` labels in monospace below the bar
- Total bar width represents a round number of metres (e.g. 200m, 500m) appropriate to plan scale

### 2.8 Buildings & Structures
- Rectangle with `1px solid black` stroke and `rgba(220,210,190,0.3)` fill
- Diagonal hatch lines inside at 45°, `0.5px, 12% opacity` — via SVG `<pattern>` element
- Label in `7.5px bold monospace` centred inside
- Size proportional to lot: approximately `22% of lot width × 15% of lot height`

### 2.9 Adjacent Lot Labels
- Label rotated **90° to face inward** on left/right sides
- Label horizontal on top/bottom sides
- `11px bold monospace`, `45% black opacity`
- Positioned just outside the subject boundary line

### 2.10 UTM Grid
Faint background grid:
- Minor lines every 50m: `0.4px, #E0E4EC, dash [2,4]`
- Major lines every 100m: `0.8px, #B0BDD0, solid`
- Y-axis (Northing) tick labels on left margin: `8px monospace, right-aligned`
- X-axis (Easting) tick labels on bottom margin: `8px monospace, rotated −45°`

### 2.11 Right-Side Information Panel
Drawing canvas occupies **left ~73%**. Right **~27%** is a structured panel separated by a `2px solid black` vertical rule. Contents top-to-bottom:
1. Report type in small caps: `"SURVEYOR'S REAL PROPERTY REPORT"`
2. Plan title in large bold: e.g. `"BOUNDARY IDENTIFICATION PLAN"`
3. Municipality in `16px bold`
4. Scale bar graphic + scale text: `"SCALE 1:500"`
5. Company name + year with top border rule
6. Metric conversion note (7px italic): `"Distances shown are in metres. Divide by 0.3048 for feet."`
7. Plan Information box: Title Ref, Datum, UTM Zone, Area, Council, Drawing No.
8. Legend with drawn SVG path symbols for each line/monument type (not emoji)
9. Warning box (yellow-tinted background `#FFF9E6`): fence setout warning
10. Surveyor's Certificate with numbered paragraphs, signature line `140px wide`, `"THE PROFESSIONAL LICENSED SURVEYOR"` label
11. Company footer: name, address, phone, email, reference, drawn by, checked by, date

### 2.12 Sheet Footer Title Block
`44px` tall strip at the very bottom, `2px top border`, background `#F8F8F8`, divided into **8 columns** by `0.5px` vertical rules:
`Field | Drawing | Checked | Address | Date | Work Order | Job No. | [COMPANY NAME in large 16px bold]`

### 2.13 Sheet Border
- Outer border: `2px solid black`, inset `5px` from sheet edge
- Inner border: `1px solid black`, inset `10px` from sheet edge
- Both borders visible on print

### 2.14 Colour Palette (Drawing Canvas Only)
- `#000000` — lines, text, borders
- `#1A6B32` — monument symbols
- `#C0392B` — masonry nail / pin symbols
- `#F5EDD6` — lot polygon fill
- `#E0E4EC` / `#B0BDD0` — grid lines
- `#888888` — fence dashes
- `#FFF9E6` — warning box background

---

## 3. Architecture

### 3.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Renderer (src/lib/reports/surveyPlan/)       │
│  Pure TypeScript class — zero React/Next dependencies   │
│  Input: survey data → Output: SVG string               │
│  Fully unit-testable in isolation                       │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Viewer (src/components/SurveyPlanViewer.tsx) │
│  React client component                                │
│  Renders SVG string, zoom/pan controls (25%–400%)      │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Export (src/components/SurveyPlanExport.tsx)│
│  svg2pdf.js → jsPDF → PDF blob → download              │
│  Triggered by "Download PDF" button                    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 New Dependency
- `svg2pdf.js` — converts SVG DOM → jsPDF document. ~50KB.

### 3.3 File Structure

```
src/
  lib/
    reports/
      surveyPlan/
        renderer.ts        # SurveyPlanRenderer class — pure TS
        geometry.ts        # Coordinate math, transforms, scale calc
        symbols.ts         # Monument, arrow, scale bar SVG builders
        types.ts            # TypeScript interfaces for plan data
  components/
    SurveyPlanViewer.tsx   # Interactive SVG viewer (client component)
    SurveyPlanExport.tsx   # PDF export button

src/app/project/[id]/documents/
  page.tsx                 # Add "Survey Plan" tab
```

### 3.4 Old Code
- `src/lib/reports/surveyPlan.ts` — old jsPDF-only generator. **Delete** after migration.
- All other files in `src/lib/reports/` remain untouched.

---

## 4. Data Model

### 4.1 Input Interface

```typescript
interface SurveyPlanData {
  project: {
    name: string
    location: string
    municipality?: string
    utm_zone: number
    hemisphere: 'N' | 'S'
    datum?: string
    client_name?: string
    surveyor_name?: string
    surveyor_licence?: string
    firm_name?: string
    firm_address?: string
    firm_phone?: string
    firm_email?: string
    drawing_no?: string
    reference?: string
    plan_title?: string
    area_sqm?: number
    area_ha?: number
    parcel_id?: string
  }
  parcel: {
    boundaryPoints: Array<{
      name: string
      easting: number
      northing: number
    }>
    area_sqm: number
    perimeter_m: number
  }
  controlPoints: Array<{
    name: string
    easting: number
    northing: number
    elevation?: number
    monumentType: 'found' | 'set' | 'masonry_nail' | 'iron_pin'
    beaconDescription?: string
  }>
  adjacentLots?: Array<{
    id: string
    boundaryPoints: Array<{ easting: number; northing: number }>
  }>
  buildings?: Array<{
    easting: number   // centroid easting
    northing: number  // centroid northing
    width_m: number
    height_m: number
    rotation_deg: number
    label?: string
  }>
}
```

---

## 5. Renderer Design (Layer 1)

### 5.1 Coordinate System
- Internal units: **metres** (survey coordinates as-is)
- SVG `viewBox`: `(0, 0, PAGE_W_MM * DPI_96 / 25.4, PAGE_H_MM * DPI_96 / 25.4)`
- A3 landscape: `PAGE_W_MM = 420`, `PAGE_H_MM = 297`, `DPI_96 ≈ 3.78 px/mm`
- Drawing area: left 73% of page, panel = right 27%
- `mmToPx = 3.78`, `mToPx = 3.78 * 1000 / 25.4 ≈ 148.8`

### 5.2 Scale Calculation
```
rawScale = drawingWidthPx / (maxE - minE)
selectedScale = smallest standard scale (100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000)
               where selectedScale >= rawScale
```

### 5.3 Key Renderer Methods

```typescript
class SurveyPlanRenderer {
  constructor(data: SurveyPlanData, options?: PlanOptions)

  // Coordinate transforms
  toSvgX(metres: number): number
  toSvgY(metres: number): number

  // Drawing layers (each returns SVG fragment)
  drawBackground(): string
  drawGrid(): string           // UTM minor + major grid + tick labels
  drawAdjacentLots(): string
  drawLotFill(): string        // cream polygon with clipPath
  drawBoundary(): string       // 2.5px subject boundary
  drawMonuments(): string      // all monument symbols
  drawBoundaryLabels(): string // bearing above, distance below each segment
  drawBuildings(): string      // rect + diagonal hatch pattern
  drawLotNumber(): string      // large watermark-style label
  drawAreaLabel(): string
  drawAdjacentLabels(): string
  drawNorthArrow(): string
  drawScaleBar(): string
  drawSheetBorder(): string
  drawRightPanel(): string     // information panel, legend, certificate
  drawSheetFooter(): string    // 8-column title block

  // Compose final SVG
  render(): string

  // Panel sections
  drawReportHeader(): string
  drawPlanInfoBox(): string
  drawLegend(): string         // SVG path symbols
  drawWarningBox(): string
  drawCertificate(): string
  drawCompanyFooter(): string
}
```

### 5.4 SVG Text on Rotated Lines

For bearing/distance labels on boundary segments:
```svg
<text
  transform="translate({midX},{midY}) rotate({angle})"
  text-anchor="middle"
  font-size="8.5"
  font-family="Share Tech Mono, Courier New"
  dy="-4"
>42°15'30"</text>
```
Flip `angle ± 180°` if `|angle| > 90` to keep text readable.

### 5.5 Hatch Pattern (Buildings)
```svg
<defs>
  <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="0.5" opacity="0.12"/>
  </pattern>
</defs>
<rect ... fill="url(#hatch)" />
```

---

## 6. Viewer Component (Layer 2)

```typescript
// src/components/SurveyPlanViewer.tsx
'use client'
// - Renders SVG via dangerouslySetInnerHTML (SVG string from renderer)
// - Wraps in overflow:scroll container
// - Zoom controls: buttons + CSS transform scale (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0)
// - "Fit to width" button
// - Cursor: grab / grabbing
// - Props: data, className, style
```

---

## 7. Export Component (Layer 3)

```typescript
// src/components/SurveyPlanExport.tsx
'use client'
// - "Download PDF" button
// - On click: load svg2pdf.js, create jsPDF(A3, landscape)
// - svg2pdf.js: svgElement → pdf.addSvg(svgElement) → pdf.save(filename)
// - Filename: {project_name}_Survey_Plan_{YYYY-MM-DD}.pdf
// - Shows loading spinner during conversion
```

---

## 8. Integration

### 8.1 Documents Page Tab
In `src/app/project/[id]/documents/page.tsx`:
- Add tab: `"Survey Plan"`
- When tab is active: render `<SurveyPlanViewer>` with project data
- Below viewer: `<SurveyPlanExport>` button
- Data sourced from existing project state (points, parcel, traverse)

### 8.2 Data Pipeline
The `SurveyPlanData` interface is assembled from existing METARDU data:
- `project.name/location/utm_zone/hemisphere` → from project metadata
- `parcel.boundaryPoints` → from parcel store
- `controlPoints` → from survey points marked `is_control = true`
- `buildings` → from parcel features (future)
- Surveyor/firm details → from user profile or project metadata

---

## 9. Acceptance Criteria

- [ ] SVG renders a complete Boundary Identification Plan at A3 landscape
- [ ] Every boundary segment has bearing (above) and distance (below) labels
- [ ] Labels are never upside-down
- [ ] Monuments rendered correctly: green square (found), green circle (set), red nail with crosshair
- [ ] Lot polygon filled with `#F5EDD6`
- [ ] North arrow: filled north, outlined south
- [ ] Scale bar: 4 alternating black/white segments with labels
- [ ] UTM grid visible in background with tick labels
- [ ] Right panel shows: plan title, municipality, scale, legend, certificate, company footer
- [ ] Sheet footer: 8-column title block
- [ ] Viewer zoom works from 25% to 400%
- [ ] PDF export produces downloadable A3 landscape PDF
- [ ] All fonts are monospace (Share Tech Mono)
- [ ] No sans-serif fonts anywhere on the canvas
- [ ] Build passes (zero TypeScript errors)
- [ ] 322 existing tests still pass

---

## 10. Out of Scope (Phase 2)

- Topographic features (contours, trees, water features)
- Multi-sheet plans (computation sheet, control network)
- Interactive beacon editing on the plan
- DXF export
- Custom scale selection by user
- Plan registration/stamping workflow
