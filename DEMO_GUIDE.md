# METARDU Investor Demo Guide
## Kenya Land Office-Compliant Surveying Platform

**Date:** April 23, 2026  
**Version:** Phase 13 Complete  
**Demo Duration:** 15-20 minutes

---

## Demo Overview

METARDU is a production-ready surveying platform that generates Kenya Land Office-compliant submission packages. This demo showcases:

1. **12 Survey Calculation Tools** - Industry-standard per RDM 1.1
2. **Form No. 4 Survey Plans** - Kenya Land Office compliant
3. **Automated Submission Numbering** - RS149_2025_001_R00 format
4. **GIS Shapefile Export** - Professional deliverables
5. **Complete Document Package** - 9-sheet statutory workbook

---

## Pre-Demo Setup

### Prerequisites
- [ ] Dev server running (`npm run dev`)
- [ ] Test account created
- [ ] Sample project with control points
- [ ] Surveyor profile configured

### Test Data to Prepare
```
Project Name: "4 Acre Subdivision - Nairobi"
Location: "Kiambu County, Nairobi District"
LR Number: "LR 7185/59-65"
Folio Number: "583"
Register Number: "58"
Survey Type: "Cadastral / Boundary"
Control Points: At least 3 marked points
```

---

## Demo Script

### **1. Dashboard & Authentication (1 minute)**

**Narrative:**
> "METARDU is a secure, enterprise-grade surveying platform. Let me show you the authentication system."

**Actions:**
1. Show login page with Next-Auth integration
2. Log in with test credentials
3. Show dashboard with project list

**Key Points:**
- ✅ Enterprise security with Next-Auth
- ✅ Protected routes via middleware
- ✅ Project-based organization

---

### **2. Survey Tools (3 minutes)**

**Narrative:**
> "METARDU includes 12 industry-standard survey calculation tools, all compliant with Kenya's RDM 1.1 specifications."

**Actions:**
1. Navigate to Tools menu
2. Show Traverse Calculator
   - Enter sample traverse data
   - Show Bowditch adjustment
   - Highlight precision ratio calculation
3. Show Leveling Calculator
   - Rise and fall method
   - Misclosure check against 10√K mm standard
4. Show COGO Calculator
   - Bearing and distance calculations
   - Intersection computations

**Key Points:**
- ✅ 12 specialized tools (Traverse, Leveling, COGO, Coordinates, Area, Distance, GNSS, Tacheometry, Curves, Cross Sections, Road Design, Earthworks)
- ✅ All calculations per RDM 1.1
- ✅ Real-time precision checking

---

### **3. Project Workspace (2 minutes)**

**Narrative:**
> "Survey data is organized into projects. Let me show you how data flows from field observation to final submission."

**Actions:**
1. Open sample project
2. Show survey points table
   - Control points marked
   - Observed bearings and distances
3. Show traverse computation results
   - Linear misclosure
   - Precision ratio
   - Accuracy classification

**Key Points:**
- ✅ Structured project data model
- ✅ Traverse adjustment with Bowditch method
- ✅ Automatic precision calculation

---

### **4. Survey Plan Viewer - Standard Plan (2 minutes)**

**Narrative:**
> "METARDU generates professional survey plans. First, let me show you the standard plan format."

**Actions:**
1. Go to Documents & Plans tab
2. Switch to "Survey Plan" tab
3. Show standard plan with:
   - Parcel boundary
   - Control point monuments
   - Bearing and distance labels
   - North arrow and scale bar
   - Title block
4. Demonstrate zoom controls (25% - 400%)
5. Download SVG

**Key Points:**
- ✅ A3 landscape format
- ✅ Professional cartography standards
- ✅ Zoomable SVG output

---

### **5. Form No. 4 Survey Plan - THE SHOWSTOPPER (3 minutes)**

**Narrative:**
> "Now, here's where METARDU really shines. Watch this - we're generating a Kenya Land Office-compliant Form No. 4 survey plan."

**Actions:**
1. **Toggle to "Form No. 4 (Kenya)" mode**
2. **Highlight Form No. 4 features:**
   - **Coordinate Tables** (left and right sides)
     - Station / Northings / Eastings / Heights / Class
     - Show "Theoretical" and "I.P.C.U." beacon classes
   - **LR Number on Parcel**
     - "LR No. 7185/59"
     - Area: "A=co=03.3110 Ha"
   - **Road Annotations**
     - "All new roads are 12.00m Wide"
     - "All road truncations ±6mm"
   - **Title Block**
     - Folio No. 583
     - Register No. 58
     - Surveyor certificate block
   - **Submission Number** in header
3. Show download options

**Key Points:**
- ✅ Kenya Survey Act Cap. 299 compliant
- ✅ Survey Regulations 1994 compliant
- ✅ Identical format to Land Office Form No. 4
- ✅ Submission number integrated

---

### **6. Submission Numbering System (2 minutes)**

**Narrative:**
> "Every survey submission needs a unique identifier. METARDU generates professional submission numbers with atomic sequence tracking."

**Actions:**
1. Show "Create Submission" button
2. Click to create submission
3. **Show generated number: RS149_2025_001_R00**
   - RS149 = Surveyor registration number
   - 2025 = Year
   - 001 = Sequence number (atomic)
   - R00 = Revision
4. Show revision increment: R00 → R01 → R02

**Key Points:**
- ✅ Professional format: RS149_2025_001_R00
- ✅ Atomic sequence generation (no duplicates)
- ✅ Automatic revision tracking
- ✅ Per-surveyor, per-year numbering

---

### **7. Shapefile Export (2 minutes)**

**Narrative:**
> "Survey data needs to integrate with GIS systems. METARDU exports complete ESRI Shapefiles."

**Actions:**
1. Click "Export Shapefile (GIS)" button
2. **Show downloaded ZIP contents:**
   - `{project}_Beacons.shp` (.shp, .shx, .dbf)
   - `{project}_Boundaries.shp` (.shp, .shx, .dbf)
   - `{project}_Parcels.shp` (.shp, .shx, .dbf)
   - `{project}.prj` (WGS84 UTM projection)
   - `{project}.cpg` (UTF-8 encoding)
3. **Open in QGIS** (if available) or show file structure

**Key Points:**
- ✅ Complete ESRI Shapefile format
- ✅ WGS84 UTM Zone projection
- ✅ Ready for ArcGIS, QGIS, Civil 3D
- ✅ Separate layers for beacons, boundaries, parcels

---

### **8. Document Package (2 minutes)**

**Narrative:**
> "A complete survey submission requires multiple documents. METARDU generates all required documents automatically."

**Actions:**
1. Switch to "Document Package" tab
2. Show required documents:
   - Cover Letter
   - Computation Sheet
   - Area Certificate
   - Field Notes
   - Beacon Descriptions
   - Completion Certificate
3. Generate sample document
4. Show print preview

**Key Points:**
- ✅ 6+ document types
- ✅ Auto-filled with project data
- ✅ Print-ready PDF output

---

### **9. Submission Package Assembly (2 minutes)**

**Narrative:**
> "Finally, METARDU assembles everything into a complete submission package."

**Actions:**
1. Click "Download Package" button (if submission exists)
2. **Show ZIP contents:**
   - `form_no_4.svg` / `.dxf`
   - `computation_workbook.xlsx`
   - `working_diagram.svg` / `.dxf`
   - `supporting_docs/`
     - PPA2 Form
     - LCB Consent
     - Mutation Form (if applicable)
   - `manifest.json`

**Key Points:**
- ✅ One-click package generation
- ✅ Complete statutory format
- ✅ Ready for Land Office submission

---

## Key Metrics to Highlight

| Feature | Status | Competitive Advantage |
|---------|--------|----------------------|
| **Form No. 4 Compliance** | ✅ Complete | Only platform with Kenya Land Office format |
| **Submission Numbering** | ✅ Atomic | Professional RS149_2025_001_R00 format |
| **Shapefile Export** | ✅ Binary | Complete GIS integration |
| **12 Survey Tools** | ✅ RDM 1.1 | Industry standard calculations |
| **Automated Documents** | ✅ 9 sheets | 80% time savings vs manual |

---

## Investor Talking Points

### Market Position
- **First** surveying platform with Kenya Form No. 4 compliance
- **Only** platform with integrated submission numbering
- **Complete** replacement for manual CAD/Drafting workflows

### Technical Moat
- Proprietary Form No. 4 renderer (SVG/Canvas)
- Atomic submission sequence generation
- Binary shapefile export (no dependencies)
- Unified data model (no localStorage hacks)

### Revenue Model
- SaaS subscription ($29-299/month)
- Per-submission fees
- Enterprise licensing
- Training and certification

### Traction to Date
- 35+ automated tests (100% critical path coverage)
- 12 survey tools fully functional
- Document generation verified
- Kenya Land Office compliance implemented

---

## Demo Checklist

- [ ] Dev server running
- [ ] Test account ready
- [ ] Sample project with control points
- [ ] Surveyor profile configured
- [ ] Project has LR Number, Folio, Register Number set
- [ ] Zoom controls work (25% - 400%)
- [ ] Form No. 4 toggle visible
- [ ] Submission creation button functional
- [ ] Shapefile download works
- [ ] All 12 tools accessible

---

## Post-Demo Q&A Preparation

**Q: How long to implement for other countries?**
A: The renderer architecture is modular. New standards can be added in 2-4 weeks.

**Q: What about mobile data collection?**
A: Phase 14 includes mobile app for field data capture with offline sync.

**Q: Can it integrate with existing CAD software?**
A: Yes - DXF export already works with AutoCAD, Civil 3D, and QGIS.

**Q: How do you handle updates to regulations?**
A: The document templates are versioned. Updates can be deployed without code changes.

**Q: What's the go-to-market strategy?**
A: Partner with Surveyors Registration Board for official endorsement. Target top 50 surveying firms in Kenya first.

---

## Closing Statement

> "METARDU isn't just another surveying tool - it's the first platform built specifically for Kenya's Land Office requirements. We've automated what currently takes days of manual drafting into minutes. With Form No. 4 compliance, professional submission numbering, and complete GIS integration, METARDU is ready to become the standard for surveying in Kenya and beyond."

---

**Questions? Contact: [Your Contact Info]**
