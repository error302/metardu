# Cassini ↔ UTM Tooling

Source-of-truth data and extraction scripts for the Kenyan Cassini-Soldner ↔ UTM
coordinate conversion subsystem.

## Layout

| Path | Purpose |
|---|---|
| `data/cassini-source/national.xls` | Kenya Survey Dept national workbook (264 sheets) |
| `data/cassini-source/148_series/148_*.xls` | 6 individual Series-148 sheet workbooks |
| `scripts/cassini-tooling/extract_all_v2.py` | **Current extractor** — produces `data/cassini/*.json` + `src/lib/geo/kenya_sheets.ts` |
| `scripts/cassini-tooling/extract_all.py` | v1 extractor (superseded, kept for history) |
| `scripts/cassini-tooling/analyze_files.py` | Helper used during initial analysis |
| `scripts/cassini-tooling/check_mobile.py` | Mobile-fit checker for the cassini-utm tool page |
| `data/cassini/*.json` | Generated JSON data (sheet corners, sub-sheets, Helmert params) |
| `src/lib/geo/cassini.ts` | Runtime math (Helmert, exact chain, Molodensky, Bursa-Wolf) |
| `src/lib/geo/kenya_sheets.ts` | Sheet table (226 sheets with Helmert params) |
| `src/app/tools/cassini-utm/page.tsx` | Tool UI at `/tools/cassini-utm` |
| `docs/cassini/engineering-log.md` | Development log (Tasks 1–6: Bursa-Wolf, A/B, exact chain, Molodensky, national XLS, synthetic sub-sheets) |
| `docs/cassini/engineering-reference.md` | Reference doc |
| `docs/cassini/analysis-output.txt` | Original analysis output |

## Rebuild the data files

```bash
# From the metardu repo root
npm run cassini:rebuild      # runs extract_all_v2.py + validate_national_sheets.ts
npm run cassini:validate     # validation only
npm run cassini:benchmark    # accuracy benchmark
```

## History

This subsystem was originally developed in a scratch repo
(`github.com/error302/kenya-cassini-utm`) and consolidated into the main app
on 2026-06-20. The scratch repo has been archived. All engineering history is
preserved in `docs/cassini/engineering-log.md`.
