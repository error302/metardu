#!/usr/bin/env python3
"""
Fix False Northing in national_sheet_corners.json

Problem: 56 of 226 national sheets have UTM northing values missing the
10,000,000m southern hemisphere false northing offset. The Survey of Kenya
source XLS has inconsistent handling — some sheets list UTM N without the
10M offset while others include it.

This script:
1. Reads national_sheet_corners.json
2. For ALL three sections (sheets, subsheet_corners, utm_to_cassini),
   detects utmN < 5,000,000 and adds 10,000,000
3. Writes the corrected JSON back
4. Reports what was fixed
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

FALSE_NORTHING = 10_000_000
THRESHOLD = 5_000_000  # If utmN < this, it's missing the false northing

JSON_PATH = Path(
    "/home/z/my-project/metardu-repo/src/lib/geo/national_sheet_corners.json"
)


def fix_section(data: dict, section_name: str) -> tuple[int, int, list[str]]:
    """
    Fix false northing in one section of the JSON.
    Returns (total_values_checked, values_fixed, details_list).
    """
    section = data.get(section_name, {})
    total = 0
    fixed = 0
    details = []

    for sheet_id, sheet_data in sorted(section.items()):
        corners = sheet_data.get("corners", [])
        for corner in corners:
            if "utmN" in corner and corner["utmN"] is not None:
                total += 1
                val = corner["utmN"]
                if val < THRESHOLD:
                    old_val = val
                    corner["utmN"] = round(val + FALSE_NORTHING, 4)
                    fixed += 1
                    details.append(
                        f"  {section_name}/{sheet_id}/{corner['id']}: "
                        f"{old_val:.4f} → {corner['utmN']:.4f}"
                    )

    return total, fixed, details


def main() -> None:
    print(f"Reading: {JSON_PATH}")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"\n{'='*70}")
    print("FALSE NOTHERING FIX — Southern Hemisphere UTM Correction")
    print(f"{'='*70}")
    print(f"False northing value:  {FALSE_NORTHING:,} m")
    print(f"Detection threshold:   utmN < {THRESHOLD:,} m")
    print()

    grand_total = 0
    grand_fixed = 0
    all_details = []

    for section_name in ["sheets", "subsheet_corners", "utm_to_cassini"]:
        total, fixed, details = fix_section(data, section_name)
        grand_total += total
        grand_fixed += fixed
        all_details.extend(details)

        section_label = section_name.replace("_", " ").title()
        print(f"Section: {section_label}")
        print(f"  Values checked: {total}")
        print(f"  Values fixed:  {fixed}")
        if fixed > 0:
            print(f"  Sheets affected in this section:")
            affected_sheets = set()
            for d in details:
                # Extract sheet ID from details line
                parts = d.split("/")
                if len(parts) >= 2:
                    affected_sheets.add(parts[1].split(":")[0].strip())
            for s in sorted(affected_sheets):
                print(f"    - {s}")
        print()

    print(f"{'='*70}")
    print(f"TOTAL: {grand_total} values checked, {grand_fixed} values fixed")
    print(f"{'='*70}")

    if grand_fixed == 0:
        print("\nNo corrections needed — all values already have false northing.")
        return

    # Show all corrections (grouped by section)
    print(f"\n{'─'*70}")
    print("DETAILED CORRECTIONS:")
    print(f"{'─'*70}")
    for d in all_details:
        print(d)

    # Save corrected file
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Corrected file saved to: {JSON_PATH}")
    print(f"   File size: {JSON_PATH.stat().st_size:,} bytes")

    # Update metadata
    print(f"\n⚠️  IMPORTANT NEXT STEPS:")
    print(f"   1. The national_sheets.ts Helmert params will auto-correct on next")
    print(f"      import since they are computed from this JSON at module load time.")
    print(f"   2. Re-run validate_national_sheets.ts to verify improved accuracy.")
    print(f"   3. Re-generate any sub-sheets derived from the affected sheets.")


if __name__ == "__main__":
    main()
