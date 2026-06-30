#!/usr/bin/env python3
"""
Extract Kenya National topographic sheet corner data from
UTM_Cassini_Cassini_UTM national.xls

This XLS file contains coordinate transformation reference data for
Kenyan topographic map sheets, with Cassini-Soldner and UTM coordinate
pairs for each sheet corner.

Data sheets found:
  - 'SHT CASN TO UTM (2)' : 273 topographic sheets (224 with full
    Cassini+UTM corners, 49 empty or UTM-only placeholders)
  - 'sheet corners'       : 76 subsheet corner entries (sub-divisions
    within sheets 75_3 and 88_4)
  - 'SHT UTM TO CASSIN'   : 266 sheets, 4 corners each (UTM -> Cassini)
  - Other sheets           : instructional / sample data (skipped)

Column mapping (SHT CASN TO UTM):
  Col 0 : Sheet ID  (e.g. "75_1", "88_4a", "196_III")
  Col 1 : Cassini (X)  — Cassini Easting  (feet)
  Col 2 : Cassini (Y)  — Cassini Northing (feet)
  Col 3 : UTM (E)      — UTM Easting     (metres)
  Col 4 : UTM (N)      — UTM Northing    (metres)

Corner order per sheet: rows are NW → NE → SE → SW (clockwise from top-left).

Output JSON structure mirrors existing whole_sheet_corners.json and
subsheet_corners.json already in src/lib/geo/.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import xlrd

# ── Paths ──────────────────────────────────────────────────────────
XLS_PATH = Path(
    "/home/z/my-project/upload/UTM_Cassini_Cassini_UTM national.xls"
)
OUTPUT_DIR = Path(
    "/home/z/my-project/metardu-repo/src/lib/geo"
)
OUTPUT_FILE = OUTPUT_DIR / "national_sheet_corners.json"

CORNER_LABELS = ["NW", "NE", "SE", "SW"]
FALSE_NORTHING = 10_000_000  # Southern hemisphere UTM false northing
FN_THRESHOLD = 5_000_000  # If utmN < this, the 10M offset is missing


def fix_utm_northing(utm_n: float) -> float:
    """Apply southern hemisphere false northing if missing from source XLS.
    The Survey of Kenya spreadsheet has inconsistent handling — some sheets
    list UTM N without the 10M offset. This function normalizes them all.
    """
    if utm_n < FN_THRESHOLD:
        return round(utm_n + FALSE_NORTHING, 4)
    return round(utm_n, 4)


def is_num(v: Any) -> bool:
    """Return True if v is a non-empty numeric value."""
    if v is None or str(v).strip() == "":
        return False
    try:
        float(v)
        return True
    except (ValueError, TypeError):
        return False


def extract_sht_casn_to_utm(wb: xlrd.Book) -> tuple[dict[str, dict], list[str], list[str]]:
    """
    Extract from 'SHT CASN TO UTM (2)' sheet.
    Layout: Col0=SheetID, Col1=CassX, Col2=CassY, Col3=UTME, Col4=UTMN
    Each sheet has exactly 4 corners separated by blank rows.

    Handles three cases:
      - Full data: Cassini + UTM in all 4 columns
      - UTM-only:  Only cols 3-4 populated (Cassini unknown for that origin)
      - Empty:     Sheet ID present but no coordinate data (placeholder)

    Returns: (sheets_dict, empty_sheets_list, notes_list)
    """
    sheet = wb.sheet_by_name("SHT CASN TO UTM (2)")
    result: dict[str, dict] = {}
    empty_sheets: list[str] = []
    notes: list[str] = []

    current_id: str | None = None
    corners: list[dict] = []
    seen_ids: set[str] = set()

    for row_idx in range(sheet.nrows):
        col0 = sheet.cell(row_idx, 0).value

        str_col0 = str(col0).strip() if col0 else ""

        # New sheet ID detected
        if str_col0 != "":
            # Save previous sheet
            _flush_sheet(result, empty_sheets, notes, current_id, corners, seen_ids)
            current_id = str_col0.replace("_", "/")
            corners = []

        # Skip if no active sheet
        if current_id is None:
            continue

        # Extract coordinate values from cols 1-4
        cass_x = sheet.cell(row_idx, 1).value
        cass_y = sheet.cell(row_idx, 2).value
        utm_e = sheet.cell(row_idx, 3).value
        utm_n = sheet.cell(row_idx, 4).value

        has_cass = is_num(cass_x) and is_num(cass_y)
        has_utm = is_num(utm_e) and is_num(utm_n)

        if has_utm:
            corner: dict[str, Any] = {
                "id": CORNER_LABELS[len(corners)] if len(corners) < 4 else f"C{len(corners)+1}",
                "utmE": round(float(utm_e), 4),
                "utmN": fix_utm_northing(float(utm_n)),
            }
            if has_cass:
                corner["cassE"] = round(float(cass_x), 4)
                corner["cassN"] = round(float(cass_y), 4)
            else:
                corner["cassE"] = None
                corner["cassN"] = None
            corners.append(corner)

    # Flush last sheet
    _flush_sheet(result, empty_sheets, notes, current_id, corners, seen_ids)

    return result, empty_sheets, notes


def _flush_sheet(
    result: dict[str, dict],
    empty_sheets: list[str],
    notes: list[str],
    sheet_id: str | None,
    corners: list[dict],
    seen_ids: set[str],
) -> None:
    """Save a completed sheet group into the result dict."""
    if sheet_id is None:
        return

    if len(corners) == 0:
        empty_sheets.append(sheet_id)
        return

    if len(corners) == 4:
        if sheet_id in seen_ids:
            notes.append(f"Duplicate sheet '{sheet_id}' skipped (data identical)")
        else:
            result[sheet_id] = {"corners": corners}
            seen_ids.add(sheet_id)
    elif len(corners) == 8:
        # Duplicate entry — take first 4
        result[sheet_id] = {"corners": corners[:4]}
        seen_ids.add(sheet_id)
        notes.append(f"Sheet '{sheet_id}' had 8 corners (duplicate entry); first 4 used")
    else:
        notes.append(
            f"Sheet '{sheet_id}' has {len(corners)} corners (expected 4); included as-is"
        )
        result[sheet_id] = {"corners": corners}
        seen_ids.add(sheet_id)


def extract_sheet_corners(wb: xlrd.Book) -> dict[str, dict]:
    """
    Extract from 'sheet corners' sheet.
    Layout: Col0=SheetID, Col1=SubNum, Col2=CassX, Col3=CassY, Col4=UTME, Col5=UTMN
    Each subsheet entry has 4 corners, separated by blank rows.
    SubNum is a sequential index (1, 2, 3, ...) within a parent sheet.
    """
    sheet = wb.sheet_by_name("sheet corners")
    result: dict[str, dict] = {}
    current_key: str | None = None
    corners: list[dict] = []

    for row_idx in range(2, sheet.nrows):  # skip header rows
        col0 = sheet.cell(row_idx, 0).value
        col1 = sheet.cell(row_idx, 1).value

        str_col0 = str(col0).strip() if col0 else ""
        str_col1 = str(col1).strip() if col1 else ""

        # New entry detected (has sheet ID in col0 and sub-number in col1)
        if str_col0 != "" and str_col1 != "":
            # Save previous
            if current_key and len(corners) == 4:
                result[current_key] = {"corners": corners}
            parent = str_col0.replace("_", "/")
            sub = int(float(str_col1))
            current_key = f"{parent}/sub{sub}"
            corners = []

        if current_key is None:
            continue

        cass_x = sheet.cell(row_idx, 2).value
        cass_y = sheet.cell(row_idx, 3).value
        utm_e = sheet.cell(row_idx, 4).value
        utm_n = sheet.cell(row_idx, 5).value

        if is_num(cass_x) and is_num(cass_y) and is_num(utm_e) and is_num(utm_n):
            if len(corners) < 4:
                corners.append({
                    "id": CORNER_LABELS[len(corners)],
                    "cassE": round(float(cass_x), 4),
                    "cassN": round(float(cass_y), 4),
                    "utmE": round(float(utm_e), 4),
                    "utmN": fix_utm_northing(float(utm_n)),
                })

    if current_key and len(corners) == 4:
        result[current_key] = {"corners": corners}

    return result


def extract_utm_to_cassin(wb: xlrd.Book) -> tuple[dict[str, dict], list[str]]:
    """
    Extract from 'SHT UTM TO CASSIN' sheet.
    Layout: Col0=SheetID, Col1=UTME, Col2=UTMN, Col3=CassX, Col4=CassY
    Returns: (sheets_dict, empty_sheets_list)
    """
    sheet = wb.sheet_by_name("SHT UTM TO CASSIN")
    result: dict[str, dict] = {}
    empty_sheets: list[str] = []
    seen_ids: set[str] = set()

    current_id: str | None = None
    corners: list[dict] = []

    for row_idx in range(sheet.nrows):
        col0 = sheet.cell(row_idx, 0).value
        str_col0 = str(col0).strip() if col0 else ""

        if str_col0 != "":
            _flush_sheet(result, empty_sheets, [], current_id, corners, seen_ids)
            current_id = str_col0.replace("_", "/")
            corners = []

        if current_id is None:
            continue

        utm_e = sheet.cell(row_idx, 1).value
        utm_n = sheet.cell(row_idx, 2).value
        cass_x = sheet.cell(row_idx, 3).value
        cass_y = sheet.cell(row_idx, 4).value

        has_utm = is_num(utm_e) and is_num(utm_n)
        has_cass = is_num(cass_x) and is_num(cass_y)

        if has_utm:
            corner: dict[str, Any] = {
                "id": CORNER_LABELS[len(corners)] if len(corners) < 4 else f"C{len(corners)+1}",
                "utmE": round(float(utm_e), 4),
                "utmN": fix_utm_northing(float(utm_n)),
            }
            if has_cass:
                corner["cassE"] = round(float(cass_x), 4)
                corner["cassN"] = round(float(cass_y), 4)
            else:
                corner["cassE"] = None
                corner["cassN"] = None
            corners.append(corner)

    _flush_sheet(result, empty_sheets, [], current_id, corners, seen_ids)
    return result, empty_sheets


def main() -> None:
    print(f"Opening: {XLS_PATH}")
    wb = xlrd.open_workbook(str(XLS_PATH))

    print(f"\nWorkbook has {wb.nsheets} sheets:")
    for name in wb.sheet_names():
        sh = wb.sheet_by_name(name)
        print(f"  '{name}': {sh.nrows} rows x {sh.ncols} cols")

    # ── Extract primary data: Cassini → UTM for full sheets ────────
    print("\n── Extracting 'SHT CASN TO UTM (2)' (Cassini→UTM, full sheets) ──")
    cassini_to_utm, empty_sheets, notes = extract_sht_casn_to_utm(wb)
    print(f"  Extracted {len(cassini_to_utm)} full sheets with corner data")
    print(f"  Empty/placeholder sheets: {len(empty_sheets)}")
    if empty_sheets:
        print(f"    Placeholders: {', '.join(empty_sheets[:10])}{'...' if len(empty_sheets) > 10 else ''}")
    for note in notes:
        print(f"  ⚠️  {note}")

    # Count UTM-only vs full Cassini+UTM
    utm_only = 0
    full_data = 0
    for sid, data in cassini_to_utm.items():
        if any(c.get("cassE") is None for c in data["corners"]):
            utm_only += 1
        else:
            full_data += 1
    print(f"  Of those: {full_data} with full Cassini+UTM, {utm_only} UTM-only")

    # ── Extract subsheet corners ────────────────────────────────────
    print("\n── Extracting 'sheet corners' (subsheet subdivisions) ──")
    subsheet_corners = extract_sheet_corners(wb)
    print(f"  Extracted {len(subsheet_corners)} subsheet entries")

    # ── Extract UTM → Cassini ────────────────────────────────────────
    print("\n── Extracting 'SHT UTM TO CASSIN' (UTM→Cassini) ──")
    utm_to_cassin, empty_rev = extract_utm_to_cassin(wb)
    print(f"  Extracted {len(utm_to_cassin)} sheets")
    if empty_rev:
        print(f"  Empty reverse entries: {len(empty_rev)}")

    # ── Build output JSON ───────────────────────────────────────────
    total_sheets = len(cassini_to_utm)
    total_subsheets = len(subsheet_corners)
    total_utm2cass = len(utm_to_cassin)

    output = {
        "metadata": {
            "source": "UTM_Cassini_Cassini_UTM national.xls",
            "description": (
                "Kenya National topographic sheet corner coordinates — "
                "Cassini-Soldner and UTM datum transformation reference data "
                "(Rainsford method). Extracted from Survey of Kenya official data."
            ),
            "sheet_count": total_sheets,
            "subsheet_count": total_subsheets,
            "utm_to_cassini_sheet_count": total_utm2cass,
            "empty_placeholder_sheets": empty_sheets,
            "extracted_date": datetime.now().strftime("%Y-%m-%d"),
            "corner_order": "NW, NE, SE, SW (clockwise from top-left)",
            "units": {
                "cassE": "feet (Cassini-Soldner Easting)",
                "cassN": "feet (Cassini-Soldner Northing)",
                "utmE": "metres (UTM Easting, Arc 1960)",
                "utmN": "metres (UTM Northing, Arc 1960)",
            },
            "notes": notes,
        },
        "sheets": {},
        "subsheet_corners": {},
        "utm_to_cassini": {},
    }

    # Populate primary sheets
    for sid, data in sorted(cassini_to_utm.items()):
        output["sheets"][sid] = data

    # Populate subsheet corners
    for sid, data in sorted(subsheet_corners.items()):
        output["subsheet_corners"][sid] = data

    # Populate UTM-to-Cassini reverse data
    for sid, data in sorted(utm_to_cassin.items()):
        output["utm_to_cassini"][sid] = data

    # ── Save ────────────────────────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Saved to: {OUTPUT_FILE}")
    print(f"   File size: {OUTPUT_FILE.stat().st_size:,} bytes")

    # ── Preview ─────────────────────────────────────────────────────
    print("\n── Sample entries (first 5 full sheets with Cassini+UTM) ──")
    shown = 0
    for sid, data in sorted(output["sheets"].items()):
        if any(c.get("cassE") is not None for c in data["corners"]):
            print(f"\n  Sheet {sid}:")
            for c in data["corners"]:
                ce = f"{c['cassE']:>12.4f}" if c.get("cassE") is not None else "        None"
                cn = f"{c['cassN']:>12.4f}" if c.get("cassN") is not None else "        None"
                print(
                    f"    {c['id']:>2}: CassE={ce}  CassN={cn}"
                    f"  UTM_E={c['utmE']:>14.4f}  UTM_N={c['utmN']:>14.4f}"
                )
            shown += 1
            if shown >= 5:
                break

    print("\n── Sample UTM-only entries (first 3) ──")
    shown = 0
    for sid, data in sorted(output["sheets"].items()):
        if any(c.get("cassE") is None for c in data["corners"]):
            print(f"\n  Sheet {sid} (UTM only):")
            for c in data["corners"]:
                print(
                    f"    {c['id']:>2}: UTM_E={c['utmE']:>14.4f}  UTM_N={c['utmN']:>14.4f}"
                    f"  CassE={c.get('cassE')}  CassN={c.get('cassN')}"
                )
            shown += 1
            if shown >= 3:
                break

    print("\n── Sample subsheet entries (first 3) ──")
    for i, (sid, data) in enumerate(sorted(output["subsheet_corners"].items())):
        if i >= 3:
            break
        print(f"\n  Subsheet {sid}:")
        for c in data["corners"]:
            print(
                f"    {c['id']:>2}: CassE={c['cassE']:>12.4f}  CassN={c['cassN']:>12.4f}"
                f"  UTM_E={c['utmE']:>14.4f}  UTM_N={c['utmN']:>14.4f}"
            )

    # ── Summary statistics ─────────────────────────────────────────
    print("\n── Summary ──")
    print(f"  Total full sheets (Cassini→UTM):  {total_sheets}")
    print(f"    └─ Full Cassini+UTM data:         {full_data}")
    print(f"    └─ UTM-only (no Cassini):          {utm_only}")
    print(f"    └─ Empty placeholders:             {len(empty_sheets)}")
    print(f"  Total subsheet corner entries:       {total_subsheets}")
    print(f"  Total sheets (UTM→Cassini):         {total_utm2cass}")
    total_corners = sum(len(d["corners"]) for d in cassini_to_utm.values())
    total_corners += sum(len(d["corners"]) for d in subsheet_corners.values())
    total_corners += sum(len(d["corners"]) for d in utm_to_cassin.values())
    print(f"  Total corner coordinate pairs:       {total_corners}")


if __name__ == "__main__":
    main()
