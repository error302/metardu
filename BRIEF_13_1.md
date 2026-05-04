# METARDU Brief 13.1 — UI Consistency + Industry-Standard Print Outputs
**Status:** READY TO IMPLEMENT  
**Priority:** CRITICAL — affects every tool page and every printed deliverable  
**Agent:** Cursor / OpenCode  
**References:** RDM 1.1 (2025) Table 5.1–5.4 | SRVY2025-1 | Survey Regulations 1994

---

## CONTEXT

Every professional survey deliverable in Kenya must have:
- A **standard page header** (project, client, date, surveyor, registration number, sheet number)
- A **footer certificate block** (surveyor's declaration per Survey Regulations 1994)
- Correct **East African survey terminology**: HPC not HI, Linear Misclosure not Linear Error
- Consistent **page width** (max-w-7xl) across all tool pages

This brief fixes all of the above in one pass.

---

## HARD RULES

- `HI` must become `HPC` everywhere in UI labels (Height of Plane of Collimation — British/East African standard)
- `Linear Error` must become `Linear Misclosure` in all display labels
- `Height of Instrument` must become `Height of Plane of Collimation` in all UI labels
- All tool pages must use `max-w-7xl mx-auto px-4`
- All print outputs must use the `buildPrintDocument()` shared helper
- **Never change any computation logic** — only labels and layout
- **Never rename database columns** — only UI labels

---

## TASK 1 — Create Shared `PageHeader` Component

**File:** `src/components/shared/PageHeader.tsx`

```tsx
interface PageHeaderProps {
  title: string
  subtitle?: string
  reference?: string // e.g. "RDM 1.1 Table 5.1 | Survey Regulations 1994"
  badge?: string     // e.g. "RDM 1.1"
}

export function PageHeader({ title, subtitle, reference, badge }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
          )}
          {reference && (
            <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">{reference}</p>
          )}
        </div>
        {badge && (
          <span className="shrink-0 text-xs font-mono px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] bg-[var(--bg-tertiary)]">
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}
```

---

## TASK 2 — Create Shared Print Template Helper

**File:** `src/lib/print/buildPrintDocument.ts`

```typescript
export interface PrintMeta {
  title: string              // e.g. "Level Book — Rise & Fall"
  projectName?: string
  clientName?: string
  surveyorName?: string
  regNo?: string             // Surveyor's registration number
  iskNo?: string             // ISK membership number
  date?: string              // Survey date
  instrument?: string        // e.g. "Leica Sprinter 250M"
  weather?: string
  observer?: string
  reference?: string         // e.g. "RDM 1.1 Table 5.1 | Survey Regulations 1994"
  sheetNo?: string
  totalSheets?: string
  submissionNo?: string      // SRVY2025-1 format: RS149_2025_001_R00
}

export function buildPrintDocument(bodyHtml: string, meta: PrintMeta): string {
  const now = new Date().toLocaleDateString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
  
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${meta.title} — METARDU</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'Courier New', monospace; 
    font-size: 10pt; 
    color: #000; 
    background: #fff;
    padding: 15mm 20mm;
  }
  .doc-header {
    border: 2px solid #000;
    margin-bottom: 12px;
  }
  .doc-header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-bottom: 1px solid #000;
    background: #1a1a1a;
    color: #fff;
  }
  .doc-header-top .brand { font-size: 14pt; font-weight: bold; letter-spacing: 2px; }
  .doc-header-top .doc-title { font-size: 11pt; font-weight: bold; text-align: center; }
  .doc-header-top .sheet-no { font-size: 9pt; text-align: right; }
  .doc-header-fields {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
  }
  .doc-header-field {
    padding: 4px 8px;
    border-right: 1px solid #ccc;
    font-size: 9pt;
  }
  .doc-header-field:last-child { border-right: none; }
  .doc-header-field .label { 
    font-size: 7.5pt; 
    text-transform: uppercase; 
    color: #555; 
    display: block; 
    margin-bottom: 1px;
  }
  .doc-header-field .value { font-weight: bold; font-size: 9pt; }
  .doc-header-reference {
    border-top: 1px solid #ccc;
    padding: 3px 8px;
    font-size: 7.5pt;
    color: #555;
    text-align: center;
  }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9pt; }
  th { background: #1a1a1a; color: #fff; padding: 4px 6px; text-align: left; font-size: 8.5pt; border: 1px solid #000; }
  td { padding: 3px 6px; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f8f8; }
  .right { text-align: right; }
  .center { text-align: center; }
  .mono { font-family: 'Courier New', monospace; }
  h2 { font-size: 10pt; font-weight: bold; margin: 12px 0 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
  h3 { font-size: 9.5pt; font-weight: bold; margin: 8px 0 4px; }
  .summary-box {
    border: 1px solid #000;
    padding: 8px 12px;
    margin: 8px 0;
    background: #f5f5f5;
  }
  .summary-row { 
    display: flex; 
    justify-content: space-between; 
    padding: 2px 0; 
    font-size: 9pt;
    border-bottom: 1px solid #e0e0e0;
  }
  .summary-row:last-child { border-bottom: none; }
  .pass { color: #166534; font-weight: bold; }
  .fail { color: #991b1b; font-weight: bold; }
  .certificate-block {
    margin-top: 16px;
    border: 2px solid #000;
    padding: 10px 14px;
    background: #fafafa;
    page-break-inside: avoid;
  }
  .certificate-title {
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 3px;
  }
  .certificate-text {
    font-size: 8.5pt;
    line-height: 1.5;
    margin-bottom: 12px;
  }
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
    margin-top: 8px;
  }
  .sig-field { border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 12px; height: 28px; }
  .sig-label { font-size: 7.5pt; text-transform: uppercase; color: #555; }
  @page { margin: 0; size: A4 portrait; }
  @media print { body { padding: 10mm 15mm; } .no-print { display: none !important; } }
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-header-top">
    <span class="brand">METARDU</span>
    <span class="doc-title">${meta.title.toUpperCase()}</span>
    <span class="sheet-no">Sheet ${meta.sheetNo || '1'} of ${meta.totalSheets || '1'}</span>
  </div>
  <div class="doc-header-fields">
    <div class="doc-header-field">
      <span class="label">Project</span>
      <span class="value">${meta.projectName || '—'}</span>
    </div>
    <div class="doc-header-field">
      <span class="label">Client</span>
      <span class="value">${meta.clientName || '—'}</span>
    </div>
    <div class="doc-header-field">
      <span class="label">Survey Date</span>
      <span class="value">${meta.date || now}</span>
    </div>
    <div class="doc-header-field">
      <span class="label">Surveyor</span>
      <span class="value">${meta.surveyorName || '—'}</span>
    </div>
    <div class="doc-header-field">
      <span class="label">Reg No / ISK No</span>
      <span class="value">${meta.regNo || '—'} / ${meta.iskNo || '—'}</span>
    </div>
    <div class="doc-header-field">
      <span class="label">Instrument</span>
      <span class="value">${meta.instrument || '—'}</span>
    </div>
  </div>
  ${meta.submissionNo ? `<div class="doc-header-reference">Submission Ref: ${meta.submissionNo}</div>` : ''}
  <div class="doc-header-reference">${meta.reference || 'Survey Regulations 1994 | RDM 1.1 (2025)'}</div>
</div>
${bodyHtml}
<div class="certificate-block">
  <div class="certificate-title">Surveyor's Certificate — Survey Regulations 1994, Regulation 3(2)</div>
  <div class="certificate-text">
    I certify that this survey computation was carried out under my direct supervision in accordance with 
    the Survey Act (Cap. 299), the Survey Regulations 1994, and the Road Design Manual RDM 1.1 (2025). 
    The field observations and computations are accurate to the best of my knowledge and belief.
  </div>
  <div class="sig-grid">
    <div><div class="sig-field"></div><div class="sig-label">Signature</div></div>
    <div><div class="sig-field"></div><div class="sig-label">Name &amp; Registration No.</div></div>
    <div><div class="sig-field"></div><div class="sig-label">Date</div></div>
  </div>
  <div class="sig-grid">
    <div><div class="sig-field"></div><div class="sig-label">ISK Membership No.</div></div>
    <div><div class="sig-field"></div><div class="sig-label">Checked By</div></div>
    <div><div class="sig-field"></div><div class="sig-label">Date Checked</div></div>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`
}

export function openPrint(html: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
}
```

---

## TASK 3 — Apply `buildPrintDocument` to Level Book

**File:** `src/components/LevelBook.tsx`

1. Import: `import { buildPrintDocument, openPrint } from '@/lib/print/buildPrintDocument'`
2. Add `PrintMetaPanel` state (see Task 7)
3. Replace the existing `openPrint` function entirely
4. New `handlePrint` builds body HTML with:
   - Table 1: field observations (Station, BS, IS, FS, **HPC**, Rise, Fall, RL, Dist, Remarks)
   - Summary box: ΣBS, ΣFS, ΣBS−ΣFS, ΣRise, ΣFall, Arithmetic Check statement, Misclosure, 10√K allowable
5. Pass meta to `buildPrintDocument(bodyHtml, { title: 'Level Book — Rise & Fall', reference: 'RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299', ...printMeta })`

**Label fixes in LevelBook.tsx (UI only, not data properties):**
- Column header `"HI (m)"` → `"HPC (m)"`  
- Any label `"Height of Instrument"` → `"Height of Plane of Collimation"`
- Arithmetic check statement → `"ΣBS − ΣFS = Last RL − First RL"`

---

## TASK 4 — Apply `buildPrintDocument` to Traverse

**File:** `src/app/tools/traverse/page.tsx`

1. Replace `copyResults` button with a `Print` button
2. Add `PrintMetaPanel` above the Print button
3. Print body includes: Table 1 (traverse computation), Table 2 (corrections), Table 3 (adjusted coords), Summary box
4. Change any `"Linear Error"` display label to `"Linear Misclosure"`

---

## TASK 5 — Terminology Fixes

### `src/components/LevelBook.tsx` and `src/app/tools/leveling/page.tsx`
- All display instances of `"HI"` → `"HPC"` (do NOT change data property names like `row.hi`)
- Method display label `"HOC"` → `"Height of Collimation"`
- `"Height of Instrument"` → `"Height of Plane of Collimation"`

### `src/app/tools/traverse/page.tsx`
- `"Linear Error"` → `"Linear Misclosure"` in result display labels

---

## TASK 6 — Standardize Page Width to `max-w-7xl`

Run: `grep -r "max-w-6xl" src/app/tools/ --include="*.tsx" -l`  
For every matched file, change outer wrapper to `max-w-7xl mx-auto px-4 py-8`.

Standard reference line to add below each page title:

| Tool | Reference string |
|---|---|
| Level Book / Leveling | `"Survey Regulations 1994 | RDM 1.1 (2025) Table 5.1 | Survey Act Cap 299"` |
| Traverse | `"RDM 1.1 (2025) Table 5.1 | Survey Regulations 1994 | Bowditch/Transit method"` |
| COGO / Coordinates | `"Survey Regulations 1994 | Kenya UTM Zones 36S/37S"` |
| Tacheometry | `"Survey Regulations 1994 | RDM 1.1 (2025) Section 5.6"` |
| Curves | `"RDM 1.1 (2025) Geometric Design | Kenya Highway Design Manual"` |
| Cross-sections | `"RDM 1.1 (2025) Section 5.6.2 | Spot levels at ≤20m intervals"` |
| Earthworks / Volumes | `"RDM 1.1 (2025) | Prismoidal formula"` |

---

## TASK 7 — `PrintMetaPanel` Component

**File:** `src/components/shared/PrintMetaPanel.tsx`

Collapsible panel shown above every Print button:

```tsx
'use client'
import { useState } from 'react'

export interface PrintMeta {
  projectName: string
  clientName: string
  surveyorName: string
  regNo: string
  iskNo: string
  date: string
  instrument: string
  weather?: string
  observer?: string
  submissionNo?: string
}

interface PrintMetaPanelProps {
  meta: PrintMeta
  onChange: (meta: PrintMeta) => void
}

export function PrintMetaPanel({ meta, onChange }: PrintMetaPanelProps) {
  const [open, setOpen] = useState(false)
  const set = (k: keyof PrintMeta, v: string) => onChange({ ...meta, [k]: v })

  return (
    <div className="mb-4 border border-[var(--border-color)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-tertiary)] text-sm font-medium hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <span>📋 Print Header Details <span className="text-[var(--text-muted)] font-normal">(project, surveyor, instrument)</span></span>
        <span className="text-[var(--text-muted)]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ['projectName', 'Project Name'],
            ['clientName', 'Client Name'],
            ['surveyorName', 'Surveyor Name'],
            ['regNo', 'Registration No.'],
            ['iskNo', 'ISK Membership No.'],
            ['date', 'Survey Date'],
            ['instrument', 'Instrument (make/model)'],
            ['observer', 'Observer'],
            ['submissionNo', 'Submission No. (SRVY2025-1)'],
          ] as [keyof PrintMeta, string][]).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-[var(--text-muted)] mb-1">{label}</label>
              <input
                className="input w-full"
                type={key === 'date' ? 'date' : 'text'}
                value={meta[key] || ''}
                placeholder={key === 'submissionNo' ? 'RS149_2025_001_R00' : label}
                onChange={e => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## TASK 8 — Tools Page: Add Descriptions to Tool Cards

**File:** `src/app/tools/page.tsx`

Update `ToolLink` to accept `description`:
```tsx
function ToolLink({ href, title, description }: { href: string; title: string; description?: string }) {
  return (
    <Link href={href} className="card p-4 hover:border-[var(--accent)] transition-colors block">
      <p className="font-semibold text-sm">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>}
    </Link>
  )
}
```

Add descriptions to all tool cards:
- **Setting Out**: `"Stakeout from known coords | RDM 1.1"`
- **Level Book**: `"HPC/Rise & Fall field book | 10√K closure"`
- **Leveling**: `"Quick differential leveling | 10√K closure"`
- **Two Peg Test**: `"Instrument collimation error check"`
- **Traverse**: `"Bowditch/Transit closed traverse | RDM 1.1 grading"`
- **Traverse Field Book**: `"Field observations with angular closure"`
- **Tacheometry**: `"Stadia/EDM distance & elevation"`
- **Curves**: `"Horizontal/vertical curve elements | RDM 1.1"`
- **Cross-sections**: `"Cut/fill areas | ≤20m intervals per RDM 1.1"`
- **GNSS**: `"GNSS observation & baseline processing"`
- **Missing Line**: `"Distance/bearing between two points"`
- **Height of Object**: `"Trigonometric height measurement"`

---

## TEST CASES

1. Level Book print → header shows 6 fields (Project, Client, Date, Surveyor, Reg/ISK, Instrument) + certificate block with 6 signature lines
2. Level Book column header reads `"HPC (m)"` not `"HI (m)"`
3. Traverse page → Print button → same header template appears
4. Traverse result panel shows `"Linear Misclosure"` not `"Linear Error"`
5. All tool pages have `max-w-7xl` wrapper
6. All tool pages have a reference line below the subtitle
7. Tools page cards show descriptions under each title
8. `PrintMetaPanel` collapses by default, expands on click, fields persist while open
9. Leveling page method selector label reads `"Height of Collimation"` not `"HOC"`
10. `buildPrintDocument` exported from `@/lib/print/buildPrintDocument` — TypeScript compiles with zero errors

---

## SQL MIGRATIONS
None required.

## FILES TOUCHED
- `src/lib/print/buildPrintDocument.ts` (NEW)
- `src/components/shared/PrintMetaPanel.tsx` (NEW)
- `src/components/shared/PageHeader.tsx` (NEW)
- `src/components/LevelBook.tsx` (EDIT)
- `src/app/tools/leveling/page.tsx` (EDIT)
- `src/app/tools/traverse/page.tsx` (EDIT)
- `src/app/tools/level-book/page.tsx` (EDIT)
- `src/app/tools/page.tsx` (EDIT)
- All `src/app/tools/*/page.tsx` with `max-w-6xl` (EDIT — width only)
