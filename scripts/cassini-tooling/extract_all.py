#!/usr/bin/env python3
"""
Extract all Kenya topo sheet data from the national XLS and individual sheet XLS files.
Generates TypeScript data files for integration into Metardu's cassini.ts

Outputs:
  1. whole_sheet_corners.json   - 250+ sheets with Cassini/UTM corner pairs
  2. whole_sheet_helmert.ts      - Computed Helmert 4-param for all sheets
  3. synthetic_subsheets.json   - 5x5 sub-sheet grids for 148 series (bilinear interpolation)
  4. merged_subsheets.json       - Real (75/3, 88/2, 88/4) + synthetic sub-sheet corners
"""

import xlrd
import json
import math
import os

# ponytail: resolve relative to repo root so the script is portable
import os
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'src', 'lib', 'geo')

# ─── Roman numeral mapping for 148 series ───
ROMAN_MAP = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
    'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12'
}

def roman_to_arabic(name):
    """Convert sheet names like '148_II' to '148/2', '148_II_2' to '148/2.1'"""
    parts = name.split('_')
    # Try to convert the series part
    result = []
    for p in parts:
        if p in ROMAN_MAP:
            result.append(ROMAN_MAP[p])
        else:
            result.append(p)
    # Join first two parts with /
    if len(result) >= 2:
        sheet_num = result[0]
        series = result[1]
        suffix = ''
        if len(result) > 2:
            suffix = '.' + '.'.join(result[2:])
        return f"{sheet_num}/{series}{suffix}"
    return name


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Parse National XLS - Sheet 3 (Whole-Sheet Cassini→UTM corners)
# ═══════════════════════════════════════════════════════════════════════════════

print("STEP 1: Parsing national XLS Sheet 3 (whole-sheet corners)...")

wb = xlrd.open_workbook(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'cassini-source', 'national.xls'))
sheet3 = wb.sheet_by_index(3)  # "SHT CASN TO UTM (2)"

whole_sheet_corners = {}  # { sheet_id: [{cassX, cassY, utmE, utmN}, ...] }

current_sheet_id = None
corners = []

for row_idx in range(1, sheet3.nrows):
    row_vals = [sheet3.cell_value(row_idx, col) for col in range(5)]
    
    col_a = row_vals[0]  # Sheet ID (only on first row of block)
    col_b = row_vals[1]  # Cassini X / UTM E
    col_c = row_vals[2]  # Cassini Y / UTM N
    col_d = row_vals[3]  # UTM E / Cassini X
    col_e = row_vals[4]  # UTM N / Cassini Y
    
    # Check if this is a sheet header row
    if col_a != '' and col_a is not None:
        # Save previous sheet if complete
        if current_sheet_id and len(corners) == 4:
            whole_sheet_corners[current_sheet_id] = corners
        
        # Start new sheet
        raw_id = str(col_a).strip()
        current_sheet_id = roman_to_arabic(raw_id)
        corners = []
        
        # This row also has corner 1 data
        try:
            cass_x = float(col_b)
            cass_y = float(col_c)
            utm_e = float(col_d)
            utm_n = float(col_e)
            corners.append({'cassX': cass_x, 'cassY': cass_y, 'utmE': utm_e, 'utmN': utm_n})
        except (ValueError, TypeError):
            pass
    elif current_sheet_id:
        # Check if this is a data row (has numeric values)
        try:
            cass_x = float(col_b)
            cass_y = float(col_c)
            utm_e = float(col_d)
            utm_n = float(col_e)
            corners.append({'cassX': cass_x, 'cassY': cass_y, 'utmE': utm_e, 'utmN': utm_n})
        except (ValueError, TypeError):
            # Separator row - skip
            pass

# Save last sheet
if current_sheet_id and len(corners) == 4:
    whole_sheet_corners[current_sheet_id] = corners

print(f"  Extracted {len(whole_sheet_corners)} sheets with 4 corners each")

# Validate some known sheets
for check_id in ['148/1', '148/2', '148/3', '148/4']:
    if check_id in whole_sheet_corners:
        c = whole_sheet_corners[check_id]
        print(f"  ✓ {check_id}: corners Cass({c[0]['cassX']:.0f},{c[0]['cassY']:.0f}) → ({c[3]['cassX']:.0f},{c[3]['cassY']:.0f})")
    else:
        print(f"  ✗ {check_id}: NOT FOUND")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Parse National XLS - Sheet 5 (Sub-sheet corners for 75_3, 88_2, 88_4)
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 2: Parsing national XLS Sheet 5 (sub-sheet corners)...")

sheet5 = wb.sheet_by_index(5)  # "sheet corners"

real_subsheets = {}  # { sheet_id: { sub_id: [{cassX, cassY, utmE, utmN}, ...] } }

current_sheet = None
current_sub = None
sub_corners = []

for row_idx in range(2, sheet5.nrows):
    col_a = sheet5.cell_value(row_idx, 0)  # Sheet ID
    col_b = sheet5.cell_value(row_idx, 1)  # Sub-sheet number
    col_c = sheet5.cell_value(row_idx, 2)  # Cassini X
    col_d = sheet5.cell_value(row_idx, 3)  # Cassini Y
    col_e = sheet5.cell_value(row_idx, 4)  # UTM E
    col_f = sheet5.cell_value(row_idx, 5)  # UTM N
    
    if col_a != '' and col_a is not None:
        # Save previous sub-sheet if complete
        if current_sheet and current_sub and len(sub_corners) >= 3:
            if current_sheet not in real_subsheets:
                real_subsheets[current_sheet] = {}
            real_subsheets[current_sheet][current_sub] = sub_corners
        
        # Start new sub-sheet
        current_sheet = str(col_a).strip().replace('_', '/')
        try:
            current_sub = str(int(float(col_b)))
        except:
            current_sub = str(col_b).strip()
        sub_corners = []
        
        # This row has corner 1
        try:
            sub_corners.append({
                'cassX': float(col_c), 'cassY': float(col_d),
                'utmE': float(col_e), 'utmN': float(col_f)
            })
        except:
            pass
    elif current_sheet:
        try:
            sub_corners.append({
                'cassX': float(col_c), 'cassY': float(col_d),
                'utmE': float(col_e), 'utmN': float(col_f)
            })
        except:
            pass

# Save last sub-sheet
if current_sheet and current_sub and len(sub_corners) >= 3:
    if current_sheet not in real_subsheets:
        real_subsheets[current_sheet] = {}
    real_subsheets[current_sheet][current_sub] = sub_corners

for sid in real_subsheets:
    nsubs = len(real_subsheets[sid])
    ncorners = sum(len(c) for c in real_subsheets[sid].values())
    print(f"  {sid}: {nsubs} sub-sheets, {ncorners} corner points")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Parse individual XLS files for 6-param polynomial coefficients
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 3: Parsing individual XLS files for 6-param coefficients...")

poly_params = {}  # { sheet_id: { P, Q, A, B, Cx, Cy } }

individual_files = [
    ('148/1', 'CASSINI TO UTM 148_1 TOPO SHEET.xls'),
    ('148/2', 'CASSINI TO UTM 148_2 TOPO SHEET.xls'),
    ('148/2.1', 'CASSINI TO UTM 148_2_1 TOPO SHEET.xls'),
    ('148/3', 'CASSINI TO UTM 148_3 TOPO SHEET.xls'),
    ('148/4', 'CASSINI TO UTM 148_4 TOPO SHEET.xls'),
    ('148/4.1', 'CASSINI TO UTM 148_4_1 TOPO SHEET.xls'),
]

for sheet_id, filename in individual_files:
    filepath = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'cassini-source', '148_series', filename)
    if not os.path.exists(filepath):
        print(f"  ✗ {sheet_id}: file not found ({filename})")
        continue
    
    try:
        wb_ind = xlrd.open_workbook(filepath)
        sol_sheet = wb_ind.sheet_by_name('solution of four parameters')
        
        # Parameters are in rows 33-38 of the solution sheet
        # Row 33: P, Row 34: Q, Row 35: A, Row 36: B, Row 37: Cx, Row 38: Cy
        # The solution is in column B (index 1) for each parameter row
        
        P = sol_sheet.cell_value(32, 1)  # Row 33 (0-indexed: 32)
        Q = sol_sheet.cell_value(33, 1)  # Row 34
        A = sol_sheet.cell_value(34, 1)  # Row 35
        B = sol_sheet.cell_value(35, 1)  # Row 36
        Cx = sol_sheet.cell_value(36, 1) # Row 37
        Cy = sol_sheet.cell_value(37, 1) # Row 38
        
        poly_params[sheet_id] = {
            'P': float(P), 'Q': float(Q), 'A': float(A), 'B': float(B),
            'Cx': float(Cx), 'Cy': float(Cy)
        }
        print(f"  ✓ {sheet_id}: P={float(P):.10f}, Q={float(Q):.2e}, A={float(A):.2e}, B={float(B):.2e}")
    except Exception as e:
        print(f"  ✗ {sheet_id}: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Compute Helmert 4-param for all whole-sheet corners
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 4: Computing Helmert 4-param for all sheets...")

# Clarke 1858 ellipsoid constants (feet)
A_FT = 20926348.0
B_FT = 20855232.84

def apply_conformal_correction(easting):
    """Apply Rainsford conformal correction to Cassini easting."""
    ab = A_FT * B_FT
    E3 = easting ** 3
    E5 = easting ** 5
    return easting + E3 / (6 * ab) + E5 / (24 * ab * ab)

def compute_helmert4(corners):
    """
    Compute 4-parameter Helmert from corner pairs.
    corners: list of {cassX, cassY, utmE, utmN}
    
    Equations:
      UTM_E = P * E_conf + Q * N_abs + Cx
      UTM_N = -Q * E_conf + P * N_abs + Cy
    """
    n = len(corners)
    rows = []
    obs = []
    
    for c in corners:
        e_conf = apply_conformal_correction(c['cassX'])
        n_abs = abs(c['cassY'])
        
        rows.append([e_conf, n_abs, 1, 0])
        obs.append(c['utmE'])
        
        rows.append([n_abs, -e_conf, 0, 1])
        obs.append(c['utmN'])
    
    # Normal equations: M^T M x = M^T b
    cols = 4
    MTM = [[0.0]*cols for _ in range(cols)]
    MTab = [0.0]*cols
    
    for r in range(len(rows)):
        for c1 in range(cols):
            for c2 in range(cols):
                MTM[c1][c2] += rows[r][c1] * rows[r][c2]
            MTab[c1] += rows[r][c1] * obs[r]
    
    # Gaussian elimination with partial pivoting
    aug = [MTM[i][:] + [MTab[i]] for i in range(cols)]
    
    for col in range(cols):
        max_row = col
        max_val = abs(aug[col][col])
        for row in range(col+1, cols):
            if abs(aug[row][col]) > max_val:
                max_val = abs(aug[row][col])
                max_row = row
        if max_val < 1e-20:
            return None
        if max_row != col:
            aug[col], aug[max_row] = aug[max_row], aug[col]
        for row in range(col+1, cols):
            factor = aug[row][col] / aug[col][col]
            for j in range(col, cols+1):
                aug[row][j] -= factor * aug[col][j]
    
    # Back substitution
    x = [0.0]*cols
    for i in range(cols-1, -1, -1):
        s = aug[i][cols]
        for j in range(i+1, cols):
            s -= aug[i][j] * x[j]
        x[i] = s / aug[i][i]
    
    return {'P': x[0], 'Q': x[1], 'Cx': x[2], 'Cy': x[3]}

helmert_results = {}  # { sheet_id: { P, Q, Cx, Cy, rmse_mm } }

for sheet_id, corners in whole_sheet_corners.items():
    params = compute_helmert4(corners)
    if params:
        # Compute RMSE at corners
        ssr = 0
        for c in corners:
            e_conf = apply_conformal_correction(c['cassX'])
            n_abs = abs(c['cassY'])
            pred_e = params['P'] * e_conf + params['Q'] * n_abs + params['Cx']
            pred_n = -params['Q'] * e_conf + params['P'] * n_abs + params['Cy']
            ssr += (pred_e - c['utmE'])**2 + (pred_n - c['utmN'])**2
        
        # With 4 corners and 4 params, the system is exactly determined
        # RMSE should be ~0 for exact fit
        rmse_m = math.sqrt(ssr / (2 * 4)) if ssr > 0 else 0
        rmse_mm = rmse_m * 1000
        
        params['rmse_mm'] = round(rmse_mm, 1)
        helmert_results[sheet_id] = params

print(f"  Computed Helmert params for {len(helmert_results)} sheets")

# Show some examples
for sid in ['148/1', '148/2', '148/3', '148/4', '75/3', '88/2', '88/4']:
    if sid in helmert_results:
        p = helmert_results[sid]
        print(f"  {sid}: P={p['P']:.10f}, Q={p['Q']:.2e}, Cx={p['Cx']:.2f}, Cy={p['Cy']:.2f}, RMSE={p['rmse_mm']}mm")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Generate synthetic 5×5 sub-sheet grids via bilinear interpolation
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 5: Generating synthetic 5×5 sub-sheet grids...")

def bilinear_interpolate_grid(corners, grid_size=6):
    """
    Create a grid_size × grid_size bilinear interpolation of 4 corner points.
    corners[0] = BL, corners[1] = BR, corners[2] = TR, corners[3] = TL
    Returns grid[row][col] = {cassX, cassY, utmE, utmN}
    """
    # Sort corners to ensure consistent ordering: BL, BR, TR, TL
    # Cassini Y (northing): smaller value = further north in Kenya (more negative or smaller positive)
    # For sub-sheet sheets (75/3, 88/2), Y is positive and larger = further north
    # For 148 series, Y is negative and smaller = further north
    # Let's sort by Y ascending, then X ascending
    sorted_c = sorted(corners, key=lambda c: (c['cassY'], c['cassX']))
    # Bottom row: smaller Y (more south for positive Y, more north for negative Y)
    # Actually let's just use the 4 corners as-is and create the grid
    
    # Assume corners are in order: BL, BR, TR, TL based on the data analysis
    # Corner 0: minX, maxY (bottom-left for standard coords, or top-left for negative Y)
    # Corner 1: maxX, maxY (bottom-right or top-right)
    # Corner 2: maxX, minY (top-right or bottom-right)
    # Corner 3: minX, minY (top-left or bottom-left)
    
    # Let's determine orientation from the data
    xs = [c['cassX'] for c in corners]
    ys = [c['cassY'] for c in corners]
    
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    
    # Create a lookup for corners by position
    corner_map = {}
    for c in corners:
        x_key = 'min' if abs(c['cassX'] - min_x) < abs(c['cassX'] - max_x) else 'max'
        y_key = 'min' if abs(c['cassY'] - min_y) < abs(c['cassY'] - max_y) else 'max'
        corner_map[f"{x_key}_{y_key}"] = c
    
    # We need 4 corners at the extremes
    required = ['min_min', 'max_min', 'max_max', 'min_max']
    if not all(k in corner_map for k in required):
        # Fallback: just use the 4 corners as-is
        grid = []
        for r in range(grid_size):
            row = []
            for c in range(grid_size):
                # Simple bilinear
                s = c / (grid_size - 1)
                t = r / (grid_size - 1)
                
                def interp(p00, p10, p01, p11, s, t):
                    return (1-s)*(1-t)*p00 + s*(1-t)*p10 + (1-s)*t*p01 + s*t*p11
                
                row.append({
                    'cassX': interp(corners[3]['cassX'], corners[2]['cassX'], corners[0]['cassX'], corners[1]['cassX'], s, t),
                    'cassY': interp(corners[3]['cassY'], corners[2]['cassY'], corners[0]['cassY'], corners[1]['cassY'], s, t),
                    'utmE': interp(corners[3]['utmE'], corners[2]['utmE'], corners[0]['utmE'], corners[1]['utmE'], s, t),
                    'utmN': interp(corners[3]['utmN'], corners[2]['utmN'], corners[0]['utmN'], corners[1]['utmN'], s, t),
                })
            grid.append(row)
        return grid
    
    bl = corner_map['min_max']   # Bottom-left: min X, max Y
    br = corner_map['max_max']   # Bottom-right: max X, max Y
    tr = corner_map['max_min']   # Top-right: max X, min Y
    tl = corner_map['min_min']   # Top-left: min X, min Y
    
    grid = []
    for r in range(grid_size):
        row = []
        for c in range(grid_size):
            s = c / (grid_size - 1)  # 0 = left, 1 = right
            t = r / (grid_size - 1)  # 0 = top, 1 = bottom
            
            def interp(p00, p10, p01, p11, s, t):
                return (1-s)*(1-t)*p00 + s*(1-t)*p10 + (1-s)*t*p01 + s*t*p11
            
            row.append({
                'cassX': interp(tl['cassX'], tr['cassX'], bl['cassX'], br['cassX'], s, t),
                'cassY': interp(tl['cassY'], tr['cassY'], bl['cassY'], br['cassY'], s, t),
                'utmE': interp(tl['utmE'], tr['utmE'], bl['utmE'], br['utmE'], s, t),
                'utmN': interp(tl['utmN'], tr['utmN'], bl['utmN'], br['utmN'], s, t),
            })
        grid.append(row)
    
    return grid

def grid_to_subsheets(grid, grid_size=6):
    """
    Convert a grid to 25 sub-sheets (5x5).
    Each sub-sheet gets 4 corners from the grid.
    Sub-sheets are numbered 1-25 (row-major: 1-5 = top row, 6-10 = second row, etc.)
    """
    subsheets = {}
    for r in range(5):
        for c in range(5):
            sub_id = str(r * 5 + c + 1)
            # Corners: TL, TR, BR, BL
            corners = [
                grid[r][c],       # TL
                grid[r][c+1],     # TR
                grid[r+1][c+1],   # BR
                grid[r+1][c],     # BL
            ]
            subsheets[sub_id] = corners
    return subsheets

# Generate for ALL sheets that have 4 corners
all_subsheets = {}
sheets_with_synthetic = []

for sheet_id, corners in whole_sheet_corners.items():
    grid = bilinear_interpolate_grid(corners)
    subs = grid_to_subsheets(grid)
    all_subsheets[sheet_id] = subs
    sheets_with_synthetic.append(sheet_id)

print(f"  Generated synthetic sub-sheets for {len(sheets_with_synthetic)} sheets")

# Verify against real sub-sheet data
for sid in ['75/3', '88/2', '88/4']:
    if sid in real_subsheets and sid in all_subsheets:
        # Compare sub-sheet 13 (center) corners
        real_corners = real_subsheets[sid].get('13', [])
        synth_corners = all_subsheets[sid].get('13', [])
        if real_corners and synth_corners:
            print(f"  {sid}/13 comparison (real vs synthetic):")
            for i in range(min(4, len(real_corners), len(synth_corners))):
                r = real_corners[i]
                s = synth_corners[i]
                de = abs(r['cassX'] - s['cassX'])
                dn = abs(r['cassY'] - s['cassY'])
                print(f"    Corner {i}: dCassX={de:.1f}ft, dCassY={dn:.1f}ft, "
                      f"Real=({r['cassX']:.0f},{r['cassY']:.0f}), "
                      f"Synth=({s['cassX']:.0f},{s['cassY']:.0f})")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Compute per-sub-sheet Helmert params for synthetic sub-sheets
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 6: Computing per-sub-sheet Helmert for all synthetic sub-sheets...")

subsheet_helmert = {}  # { sheet_id: { sub_id: {P, Q, Cx, Cy, bounds} } }

for sheet_id, subs in all_subsheets.items():
    subsheet_helmert[sheet_id] = {}
    for sub_id, corners in subs.items():
        hp = compute_helmert4(corners)
        if hp:
            xs = [c['cassX'] for c in corners]
            ys = [c['cassY'] for c in corners]
            hp['bounds'] = {
                'minX': min(xs), 'maxX': max(xs),
                'minY': min(ys), 'maxY': max(ys)
            }
            subsheet_helmert[sheet_id][sub_id] = hp

# Count total sub-sheets with params
total_subs = sum(len(v) for v in subsheet_helmert.values())
print(f"  Computed Helmert for {total_subs} sub-sheets across {len(subsheet_helmert)} sheets")


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 7: Output files
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 7: Generating output files...")

# 7a. Whole-sheet corners JSON
with open(os.path.join(OUTPUT_DIR, 'whole_sheet_corners.json'), 'w') as f:
    json.dump(whole_sheet_corners, f, indent=2)
print(f"  ✓ whole_sheet_corners.json ({len(whole_sheet_corners)} sheets)")

# 7b. Synthetic sub-sheet corners JSON (for 148 series only initially, then all)
with open(os.path.join(OUTPUT_DIR, 'synthetic_subsheets.json'), 'w') as f:
    json.dump(all_subsheets, f, indent=2)
print(f"  ✓ synthetic_subsheets.json ({len(all_subsheets)} sheets × 25 sub-sheets)")

# 7c. Merged sub-sheet corners (real data takes priority)
merged_subsheets = {}
for sid, subs in all_subsheets.items():
    merged_subsheets[sid] = subs

# Override with real sub-sheet data where available
for sid, subs in real_subsheets.items():
    merged_subsheets[sid] = subs
    print(f"  Using REAL sub-sheet data for {sid}")

with open(os.path.join(OUTPUT_DIR, 'merged_subsheets.json'), 'w') as f:
    json.dump(merged_subsheets, f, indent=2)
print(f"  ✓ merged_subsheets.json ({len(merged_subsheets)} sheets × 25 sub-sheets)")

# 7d. TypeScript file with all Helmert params
ts_lines = [
    '/**',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' * Kenya Topo Sheet Helmert Parameters — Auto-generated from National Survey XLS',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' *',
    ' * DO NOT EDIT MANUALLY — Generated by extract_all.py',
    f' * Sheets: {len(helmert_results)}',
    ' *',
    ' * Each entry has Helmert 4-param (P, Q, Cx, Cy) computed from the 4 sheet corners',
    ' * in the Kenya Survey Department national XLS workbook.',
    ' */',
    '',
    "import type { TopoSheetParams, CommonPoint } from './cassini'",
    '',
]

# Build sheet entries with both Helmert corners as common points
for sheet_id in sorted(helmert_results.keys()):
    hp = helmert_results[sheet_id]
    corners = whole_sheet_corners[sheet_id]
    
    # Build common points from corners
    cp_lines = []
    for i, c in enumerate(corners):
        cp_lines.append(
            f"    {{ station: 'C{i+1}', cassN: {c['cassY']:.1f}, cassE: {c['cassX']:.1f}, utmN: {c['utmN']:.3f}, utmE: {c['utmE']:.3f} }}"
        )
    
    # Check if we have 6-param polynomial coefficients
    has_poly = sheet_id in poly_params
    poly_suffix = ''
    if has_poly:
        pp = poly_params[sheet_id]
        poly_suffix = f""",
    A: {pp['A']:.15e},
    B: {pp['B']:.15e}"""
    
    ts_lines.append(f"const COMMON_POINTS_{sheet_id.replace('/', '_').replace('.', '_')}: CommonPoint[] = [")
    ts_lines.append(',\n'.join(cp_lines))
    ts_lines.append("]")
    ts_lines.append("")
    
    entry = f"""  {{
    id: '{sheet_id}',
    name: 'Sheet {sheet_id}',
    description: 'Kenya topo sheet {sheet_id}. Params from 4 national file corners.'{poly_suffix},
    P: {hp['P']:.15e},
    Q: {hp['Q']:.15e},
    Cx: {hp['Cx']:.10f},
    Cy: {hp['Cy']:.10f},
    commonPoints: COMMON_POINTS_{sheet_id.replace('/', '_').replace('.', '_')},
  }}"""
    ts_lines.append(entry)

ts_lines.append("")
ts_lines.append(f"export const ALL_KENYA_SHEETS: TopoSheetParams[] = [")
ts_lines.append(',\n'.join(ts_lines[len(ts_lines)-1:])) # This won't work, let me redo

# Redo the TypeScript generation more carefully
ts_lines2 = [
    '/**',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' * Kenya Topo Sheet Helmert Parameters — Auto-generated from National Survey XLS',
    ' * ═══════════════════════════════════════════════════════════════════════════════',
    ' *',
    ' * DO NOT EDIT MANUALLY — Generated by extract_all.py',
    f' * Total sheets: {len(helmert_results)}',
    ' *',
    ' * Each entry has Helmert 4-param (P, Q, Cx, Cy) computed from the 4 sheet corners',
    ' * in the Kenya Survey Department national XLS workbook.',
    ' * Sheets with 6-param polynomial data from individual workbooks also include A, B.',
    ' */',
    '',
    "import type { TopoSheetParams, CommonPoint } from './cassini'",
    '',
]

# Generate common points arrays
cp_arrays = []
sheet_entries = []
for sheet_id in sorted(helmert_results.keys()):
    hp = helmert_results[sheet_id]
    corners = whole_sheet_corners[sheet_id]
    
    var_name = f"CP_{sheet_id.replace('/', '_').replace('.', '_')}"
    cp_lines = []
    for i, c in enumerate(corners):
        cp_lines.append(
            f"    {{ station: 'C{i+1}', cassN: {c['cassY']:.1f}, cassE: {c['cassX']:.1f}, utmN: {c['utmN']:.3f}, utmE: {c['utmE']:.3f} }}"
        )
    cp_arrays.append(f"const {var_name}: CommonPoint[] = [\n" + ',\n'.join(cp_lines) + "\n]\n")
    
    has_poly = sheet_id in poly_params
    poly_lines = ''
    if has_poly:
        pp = poly_params[sheet_id]
        poly_lines = f",\n    A: {pp['A']:.15e},\n    B: {pp['B']:.15e}"
    
    sheet_entries.append(f"""  {{
    id: '{sheet_id}',
    name: 'Sheet {sheet_id}',
    description: 'Kenya topo sheet {sheet_id}. Params from 4 national file corners.'{poly_lines},
    P: {hp['P']:.15e},
    Q: {hp['Q']:.15e},
    Cx: {hp['Cx']:.10f},
    Cy: {hp['Cy']:.10f},
    commonPoints: {var_name},
  }}""")

ts_lines2.extend(cp_arrays)
ts_lines2.append(f"export const ALL_KENYA_SHEETS: TopoSheetParams[] = [")
ts_lines2.append(',\n\n'.join(sheet_entries))
ts_lines2.append("]\n")

with open(os.path.join(OUTPUT_DIR, 'kenya_sheets.ts'), 'w') as f:
    f.write('\n'.join(ts_lines2))
print(f"  ✓ kenya_sheets.ts ({len(sheet_entries)} sheets)")

# 7e. Sub-sheet Helmert params as JSON (compact format for embedding)
# Only output for the most commonly used sheets to keep size manageable
# All sheets: full output
subsheets_compact = {}
for sheet_id in sorted(subsheet_helmert.keys()):
    subsheets_compact[sheet_id] = subsheet_helmert[sheet_id]

with open(os.path.join(OUTPUT_DIR, 'subsheet_helmert.json'), 'w') as f:
    json.dump(subsheets_compact, f, indent=2)
print(f"  ✓ subsheet_helmert.json ({total_subs} sub-sheet Helmert params)")

print("\n" + "="*70)
print("EXTRACTION COMPLETE")
print("="*70)
print(f"Files written to: {OUTPUT_DIR}")
print(f"  - whole_sheet_corners.json     ({len(whole_sheet_corners)} sheets)")
print(f"  - synthetic_subsheets.json     ({len(all_subsheets)} sheets × 25 sub-sheets)")
print(f"  - merged_subsheets.json        ({len(merged_subsheets)} sheets × 25 sub-sheets)")
print(f"  - subsheet_helmert.json        ({total_subs} sub-sheet params)")
print(f"  - kenya_sheets.ts              ({len(sheet_entries)} sheets)")
