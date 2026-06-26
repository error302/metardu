#!/usr/bin/env python3
import os
"""
Comprehensive analysis of Kenya Cassini-to-UTM coordinate conversion files.
Analyzes all uploaded XLS files and the TS09E PDF.
"""

import xlrd
import os
import sys

OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "cassini", "analysis-output.txt")

# Collect output lines
lines = []

def log(msg=""):
    lines.append(msg)
    print(msg)

def separator(char="=", length=80):
    log(char * length)

def print_sheet_info(workbook_path, label=""):
    """Print detailed info about every sheet in a workbook."""
    if label:
        log(f"\n{'#' * 80}")
        log(f"# FILE: {label}")
        log(f"# Path: {workbook_path}")
        log(f"# Size: {os.path.getsize(workbook_path):,} bytes")
        log(f"{'#' * 80}")
    
    try:
        wb = xlrd.open_workbook(workbook_path)
    except Exception as e:
        log(f"ERROR opening workbook: {e}")
        return wb
    
    log(f"\nNumber of sheets: {wb.nsheets}")
    log(f"Sheet names: {wb.sheet_names()}")
    
    for sheet_idx in range(wb.nsheets):
        sheet = wb.sheet_by_index(sheet_idx)
        sheet_name = sheet.name
        nrows = sheet.nrows
        ncols = sheet.ncols
        
        log(f"\n{'-' * 70}")
        log(f"SHEET [{sheet_idx}]: '{sheet_name}' — {nrows} rows x {ncols} cols")
        log(f"{'-' * 70}")
        
        # Print first 30 rows
        max_rows_to_show = min(nrows, 30)
        for row_idx in range(max_rows_to_show):
            row_vals = []
            for col_idx in range(ncols):
                cell = sheet.cell(row_idx, col_idx)
                val = cell.value
                if val == "":
                    val = "''"
                else:
                    val = str(val)
                # Truncate very long values
                if len(val) > 60:
                    val = val[:60] + "..."
                row_vals.append(val)
            log(f"  Row {row_idx:3d}: {' | '.join(row_vals)}")
        
        if nrows > 30:
            log(f"  ... ({nrows - 30} more rows) ...")
            # Also print LAST 5 rows for context
            log(f"  [Last 5 rows:]")
            for row_idx in range(max(nrows - 5, 30), nrows):
                row_vals = []
                for col_idx in range(ncols):
                    cell = sheet.cell(row_idx, col_idx)
                    val = str(cell.value) if cell.value != "" else "''"
                    if len(val) > 60:
                        val = val[:60] + "..."
                    row_vals.append(val)
                log(f"  Row {row_idx:3d}: {' | '.join(row_vals)}")
    
    return wb


def analyze_pdf(pdf_path, label=""):
    """Extract text from PDF."""
    if label:
        log(f"\n{'#' * 80}")
        log(f"# PDF: {label}")
        log(f"# Path: {pdf_path}")
        log(f"# Size: {os.path.getsize(pdf_path):,} bytes")
        log(f"{'#' * 80}")
    
    try:
        import pdfplumber
        log("\n--- Using pdfplumber ---")
        with pdfplumber.open(pdf_path) as pdf:
            log(f"Number of pages: {len(pdf.pages)}")
            for page_idx, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    log(f"\n--- Page {page_idx + 1} ---")
                    log(text[:5000])  # Limit output per page
                    if len(text) > 5000:
                        log(f"\n... [truncated, {len(text)} total chars] ...")
                else:
                    log(f"\n--- Page {page_idx + 1} --- (no extractable text)")
                    # Try to get tables
                    tables = page.extract_tables()
                    if tables:
                        log(f"  Found {len(tables)} table(s):")
                        for ti, table in enumerate(tables):
                            log(f"  Table {ti}: {len(table)} rows")
                            for ri, row in enumerate(table[:10]):
                                log(f"    Row {ri}: {row}")
    except Exception as e:
        log(f"pdfplumber error: {e}")
    
    try:
        import PyPDF2
        log("\n--- Using PyPDF2 ---")
        with open(pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            log(f"Number of pages: {len(reader.pages)}")
            for page_idx, page in enumerate(reader.pages):
                text = page.extract_text()
                if text:
                    log(f"\n--- Page {page_idx + 1} ---")
                    log(text[:5000])
                else:
                    log(f"\n--- Page {page_idx + 1} --- (no extractable text)")
    except Exception as e:
        log(f"PyPDF2 error: {e}")


# ============================================================
# MAIN ANALYSIS
# ============================================================
log("=" * 80)
log("KENYA CASSINI-TO-UTM COORDINATE CONVERSION FILE ANALYSIS")
log("=" * 80)
log(f"Date: 2025")
log(f"Working directory: data/cassini-source/")

# ---- 1. National XLS ----
national_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "cassini-source", "national.xls")
wb_national = print_sheet_info(national_path, "National UTM/Cassini lookup")

# ---- 2. Individual topo sheet XLS files ----
individual_files = [
    ("CASSINI TO UTM 148_1 TOPO SHEET.xls", "148_1"),
    ("CASSINI TO UTM 148_2 TOPO SHEET.xls", "148_2"),
    ("CASSINI TO UTM 148_2_1 TOPO SHEET.xls", "148_2_1"),
    ("CASSINI TO UTM 148_3 TOPO SHEET.xls", "148_3"),
    ("CASSINI TO UTM 148_4 TOPO SHEET.xls", "148_4"),
    ("CASSINI TO UTM 148_4_1 TOPO SHEET.xls", "148_4_1"),
]

for fname, label in individual_files:
    fpath = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "cassini-source", "148_series", fname)
    if os.path.exists(fpath):
        print_sheet_info(fpath, f"{label}: {fname}")
    else:
        log(f"\nWARNING: File not found: {fpath}")

# ---- 3. PDF ----
pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "public", "sample-files", "TS09E_thomas_gicira.pdf")
if os.path.exists(pdf_path):
    analyze_pdf(pdf_path, "TS09E Thomas Gicira 9237")
else:
    log(f"\nWARNING: PDF not found: {pdf_path}")

# ============================================================
# DETAILED NATIONAL FILE ANALYSIS
# ============================================================
log("\n\n")
separator("#")
log("# DETAILED NATIONAL FILE ANALYSIS")
log("#" * 80)

log("\n--- Identifying Topo Sheets in National File ---")
wb = wb_national
all_topo_sheets = []
for sheet_idx in range(wb.nsheets):
    sheet = wb.sheet_by_index(sheet_idx)
    sheet_name = sheet.name
    all_topo_sheets.append(sheet_name)
    
    log(f"\nSheet '{sheet_name}': {sheet.nrows} rows x {sheet.ncols} cols")
    
    # Scan for any cell containing topo sheet identifiers like "75_3", "88_2", "148_1", etc.
    import re
    topo_pattern = re.compile(r'(\d{2,3}_\d{1,2}(?:_\d{1,2})?)')
    found_identifiers = set()
    for row_idx in range(sheet.nrows):
        for col_idx in range(sheet.ncols):
            val = str(sheet.cell(row_idx, col_idx).value)
            matches = topo_pattern.findall(val)
            for m in matches:
                found_identifiers.add(m)
    
    if found_identifiers:
        log(f"  Topo sheet identifiers found: {sorted(found_identifiers)}")
    
    # Print column headers (usually row 0 or row 1)
    log(f"  Column header rows:")
    for header_row in range(min(3, sheet.nrows)):
        headers = []
        for col_idx in range(sheet.ncols):
            headers.append(str(sheet.cell(header_row, col_idx).value))
        log(f"    Row {header_row}: {headers}")

log("\n\n--- Topo Sheet Summary from National File ---")
log(f"All sheet names: {all_topo_sheets}")
log(f"Total sheets: {len(all_topo_sheets)}")

# Try to extract sub-sheet corner data from the national file
log("\n\n--- Sub-Sheet Corner Data Extraction (National File) ---")
for sheet_idx in range(wb.nsheets):
    sheet = wb.sheet_by_index(sheet_idx)
    sheet_name = sheet.name
    
    # Look for rows that seem like corner data (with numeric coordinates)
    # Check first few rows for column structure
    if sheet.nrows < 2 or sheet.ncols < 2:
        continue
    
    # Find header row (look for common column names)
    header_keywords = ['cassini', 'utm', 'easting', 'northing', 'east', 'north', 'e', 'n', 'sub', 'corner', 'grid']
    header_row_idx = None
    for ri in range(min(5, sheet.nrows)):
        row_text = " ".join(str(sheet.cell(ri, ci).value).lower() for ci in range(sheet.ncols))
        for kw in header_keywords:
            if kw in row_text:
                header_row_idx = ri
                break
        if header_row_idx is not None:
            break
    
    if header_row_idx is not None:
        log(f"\nSheet '{sheet_name}': Header found at row {header_row_idx}")
        headers = [str(sheet.cell(header_row_idx, ci).value) for ci in range(sheet.ncols)]
        log(f"  Headers: {headers}")
        
        # Print data rows after header
        for ri in range(header_row_idx + 1, min(header_row_idx + 15, sheet.nrows)):
            row_data = [sheet.cell(ri, ci).value for ci in range(sheet.ncols)]
            log(f"  Row {ri}: {row_data}")
    else:
        # No obvious header - just show first few rows
        log(f"\nSheet '{sheet_name}': No obvious header row found, showing first rows:")
        for ri in range(min(5, sheet.nrows)):
            row_data = [sheet.cell(ri, ci).value for ci in range(sheet.ncols)]
            log(f"  Row {ri}: {row_data}")

# ============================================================
# DETAILED INDIVIDUAL FILE ANALYSIS - Extract Parameters
# ============================================================
log("\n\n")
separator("#")
log("# DETAILED INDIVIDUAL SHEET ANALYSIS - Parameter Extraction")
log("#" * 80)

for fname, label in individual_files:
    fpath = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "cassini-source", "148_series", fname)
    if not os.path.exists(fpath):
        continue
    
    log(f"\n{'=' * 70}")
    log(f"ANALYZING: {label} ({fname})")
    log(f"{'=' * 70}")
    
    wb = xlrd.open_workbook(fpath)
    for sheet_idx in range(wb.nsheets):
        sheet = wb.sheet_by_index(sheet_idx)
        sheet_name = sheet.name
        log(f"\n  Sheet: '{sheet_name}' ({sheet.nrows} rows x {sheet.ncols} cols)")
        
        # Search for Helmert parameters: P, Q, Cx, Cy or scale, rotation, translation
        param_names_lower = ['p', 'q', 'cx', 'cy', 'scale', 'rotation', 'translation', 
                            'tx', 'ty', 'e0', 'n0', 'lat0', 'lon0', 'origine', 'originn',
                            'origin', 'hemert', 'helmert', 'parameter', 'constant']
        
        found_params = {}
        for ri in range(sheet.nrows):
            for ci in range(sheet.ncols):
                cell_val = str(sheet.cell(ri, ci).value).strip().lower()
                for param in param_names_lower:
                    if param in cell_val and len(cell_val) < 50:
                        # Check adjacent cells for values
                        if ci + 1 < sheet.ncols:
                            adj_val = sheet.cell(ri, ci + 1).value
                            key = f"Row {ri}: '{sheet.cell(ri, ci).value}'"
                            found_params[key] = adj_val
        
        if found_params:
            log(f"  Parameters found:")
            for k, v in found_params.items():
                log(f"    {k} = {v}")
        else:
            log(f"  No standard parameter labels found in any row")
        
        # Print full content for small sheets
        if sheet.nrows <= 50 and sheet.ncols <= 15:
            log(f"  Full sheet content (small sheet):")
            for ri in range(sheet.nrows):
                row_vals = []
                for ci in range(sheet.ncols):
                    row_vals.append(str(sheet.cell(ri, ci).value))
                log(f"    Row {ri:2d}: {row_vals}")

# ============================================================
# SAVE OUTPUT
# ============================================================
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    f.write("\n".join(lines))

log(f"\n\nOutput saved to: {OUTPUT_FILE}")
log(f"Total output lines: {len(lines)}")
