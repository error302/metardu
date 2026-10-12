# METARDU Professional Demo Readiness Report

**Date**: September 2026  
**Audience**: Surveying Firms, Institutional Partners, Institution of Surveyors of Kenya (ISK), Licensed Surveyors  
**Platform Version**: METARDU 1.0.1 (Production Release)  
**Primary Positioning**: *"From field observations to finished professional survey deliverables."*

---

## 1. Executive Summary

This report documents the transformation of the METARDU web platform into an auditable, high-density, mathematically rigorous field-to-finish software suite suitable for live demonstration to licensed land surveyors and surveying institutions in Kenya.

All identified deficiencies—including database schema discrepancies on the cadastral pipeline, CAD Canvas beacon population bugs, Map dock collapsibility, and Topographic drawing sheet neatline clipping—have been resolved with verified unit tests and end-to-end browser automation.

---

## 2. Verification Checklist & Claim Evidence

| Claimed Capability | Technical Standard | Verification Method | Status |
|---|---|---|---|
| **Arc 1960 / UTM 36S & 37S** | EPSG:21036, EPSG:21037, Clarke 1880 Modified Spheroid | Geodetic coordinate transformations and grid convergence checks | **VERIFIED PASS** |
| **Cadastral Traverse Closure** | Survey Regulations 1994 (Reg 97) $1:5,000$ limit | Bowditch proportional distribution fixture (`cadastral-fixtures.test.ts`) | **VERIFIED PASS** ($1:25,000+$) |
| **Angular Misclosure** | Survey Regulations 1994 (Reg 94) $60''\sqrt{n}$ | Synthetic 5-station traverse ($24''$ observed vs $134''$ allowable) | **VERIFIED PASS** |
| **Gauss Shoelace Area** | Coordinate method area calculation per Cap 299 | Precision Shoelace algorithm on `MB1`-`MB5` ($31,851.99\,\text{m}^2 = 3.1852\,\text{ha}$) | **VERIFIED PASS** |
| **EDM Reduction** | Barrell & Sears atmospheric correction + Earth curvature | Numerical validation on $P=845\,\text{hPa}, T=22^\circ\text{C}$ | **VERIFIED PASS** |
| **Vector CAD Canvas** | DXF/SVG rendering with neatlines, scale bar, north arrow | Playwright live canvas inspection (`verify-demo-flow.ts`) | **VERIFIED PASS** |
| **Dual Map Rail Collapsibility** | Full-bleed interactive GIS map without floating overlap | Playwright click toggle on left rail and right dock (`/map`) | **VERIFIED PASS** |
| **Zero-Friction Demo Mode** | Public unauthenticated walkthrough at `/demo` | 5-step end-to-end journey without auth (`verify-demo-flow.ts`) | **VERIFIED PASS** |

---

## 3. Platform Capabilities & Strict System Boundaries

To maintain absolute professional trust and integrity during institutional presentations, presenters must communicate clear system capabilities and boundaries:

### What METARDU Does
1. **Automates Field-to-Finish**: Reduces EDM slope measurements, computes Face Left/Face Right mean angles, adjusts traverses by Bowditch or Transit methods, and calculates area by coordinate methods.
2. **Displays Complete Mathematical Audit Trails**: Every formula (atmospheric ppm, curvature & refraction, line scale factor, angular closure, coordinate misclosures) is inspectable on demand.
3. **Drafts Statutory Deliverables**: Generates Survey Act Cap. 299 Form C-22, Form No. 4 deed plans, computation sheets, coordinate schedules, and AutoCAD-compatible DXF files.
4. **Works Completely Offline**: The computation engine, local coordinate database, and CAD canvas run client-side in the browser via PWA technologies without requiring field internet.

### What METARDU Does Not Claim
1. **No Institutional Endorsement**: METARDU is **not** officially endorsed or certified by ISK, Survey of Kenya, or the Engineers Board of Kenya. It is an independent engineering platform designed to meet their published statutory standards and tolerances.
2. **No Direct NLIMS / ArdhiSasa API Bypass**: While METARDU produces the exact PDF deed plans, coordinate CSVs, and DXF files formatted for NLIMS submission, the final statutory lodgement must be signed, sealed, and submitted by a licensed surveyor under Kenyan law.
3. **No Autonomous Legal Conveyancing**: METARDU is a computational and drafting tool; professional legal responsibility remains with the practicing licensed surveyor.

---

## 4. Live Demonstration Guide

Follow this protocol when presenting METARDU to surveying professionals:

### Step 1: Open Public Demo (`/demo`)
- Navigate to `/demo` without logging in.
- Highlight: *"No sign-up barrier. You can test our calculation engine with a realistic 5-beacon cadastral survey in Nairobi Upper Hill."*

### Step 2: Walk Through Field Book Observations
- Review the Face Left and Face Right angles and EDM distances.
- Explain: *"Notice that temperatures and atmospheric pressures are factored in automatically using the Barrell & Sears formula."*

### Step 3: Trigger Bowditch Adjustment & Open Mathematical Audit Trail
- Click **"Run Bowditch Adjustment"**.
- Click **"View Calculation Formulae"**.
- Explain: *"We do not hide calculations in a black box. Here is the exact angular misclosure ($24''$ vs $134''$ allowable under Reg 94), the coordinate closures ($\Delta E = 0.016\,\text{m}, \Delta N = 0.022\,\text{m}$), the linear misclosure ($0.027\,\text{m}$), and the resulting precision ratio ($1:25,237$), which comfortably surpasses the $1:5,000$ legal threshold."*

### Step 4: Show Statutory QA Verification
- Click **"Verify QA Checklist"**.
- Highlight: *"Every parcel is checked against the Survey Regulations 1994 before drafting."*

### Step 5: Vector CAD Plan & Deliverables
- Step through the interactive vector CAD survey plan and download the coordinate schedule and watermarked sample DXF.
- Explain: *"From field observations to DXF and coordinate schedules in less than 15 minutes."*

### Step 6: Full-Screen Map Interaction (`/map`)
- Open `/map`.
- Click the collapse toggle on the left tools rail and the right tools dock.
- Explain: *"Notice the clean, unobstructed workspace. Surveyors working on large maps can collapse all docks to screen edges with one click."*

---

## 5. Recommended Follow-On Engineering Priorities

1. **Direct GNSS NMEA / NTRIP Bluetooth Pairing**: Expand Web Bluetooth support for direct RTK rover connectivity in the PWA mobile view.
2. **Multi-Parcel Adjudication Scheme Mode**: Expand batch deed plan generation for subdivisions with 50+ lots.
3. **Digital Signature USB Token Integration**: Add PKCS#11 hardware token signing directly onto the generated Form No. 4 deed plans.
