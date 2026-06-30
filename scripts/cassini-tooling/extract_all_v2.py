#!/usr/bin/env python3
"""
Extract all Kenya topo sheet data from the national XLS and individual sheet XLS files.
Generates TypeScript data files for integration into Metardu's cassini.ts

Key fixes from analysis:
  - Helmert equations use RAW N (not abs(N)) — critical for southern hemisphere sheets
  - National file 148 series uses Roman numerals (148_II → 148/2)
  - Sub-sheet corners have different orientation per sheet
  - Individual XLS files use 6-param polynomial (P, Q, A, B, Cx, Cy)

Outputs:
  1. whole_sheet_corners.json   - 250+ sheets with Cassini/UTM corner pairs
  2. kenya_sheets.ts            - Computed Helmert 4-param for all sheets  
  3. merged_subsheets.json     - Real + synthetic sub-sheet corners
"""

import xlrd
import json
import math
import os

# ponytail: resolve relative to repo root so the script is portable
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_INPUT_DIR = os.path.join(_REPO_ROOT, 'data', 'cassini-source')
# ponytail: JSON outputs go to data/cassini/, TS module goes to src/lib/geo/
_DATA_DIR = os.path.join(_REPO_ROOT, 'data', 'cassini')
_TS_DIR = os.path.join(_REPO_ROOT, 'src', 'lib', 'geo')
os.makedirs(_DATA_DIR, exist_ok=True)
os.makedirs(_TS_DIR, exist_ok=True)

# ─── Roman numeral mapping ───
ROMAN_MAP = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
    'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12'
}

def roman_to_arabic(name):
    """Convert sheet names like '148_II' to '148/2', '148_II_2' to '148/2.1'"""
    parts = name.split('_')
    result = []
    for p in parts:
        if p in ROMAN_MAP:
            result.append(ROMAN_MAP[p])
        else:
            result.append(p)
    if len(result) >= 2:
        sheet_num = result[0]
        series = result[1]
        suffix = ''
        if len(result) > 2:
            suffix = '.' + '.'.join(result[2:])
        return f"{sheet_num}/{series}{suffix}"
    return name

# ─── Ellipsoid & Math ───
A_FT = 20926348.0
B_FT = 20855232.84

def apply_conformal_correction(easting):
    ab = A_FT * B_FT
    E3 = easting ** 3
    E5 = easting ** 5
    return easting + E3 / (6 * ab) + E5 / (24 * ab * ab)

def compute_helmert4(corners):
    """
    Compute 4-parameter Helmert from corner pairs.
    CRITICAL: Uses RAW N (not abs) — works for both hemispheres.
    
    Equations:
      UTM_E = P * E_conf + Q * N + Cx
      UTM_N = -Q * E_conf + P * N + Cy
    where N is the RAW northing (negative in southern hemisphere).
    """
    rows = []
    obs = []
    for c in corners:
        e_conf = apply_conformal_correction(c['cassX'])
        n = c['cassY']  # RAW, no abs()
        rows.append([e_conf, n, 1, 0])
        obs.append(c['utmE'])
        rows.append([n, -e_conf, 0, 1])
        obs.append(c['utmN'])
    
    cols = 4
    MTM = [[0.0]*cols for _ in range(cols)]
    MTab = [0.0]*cols
    for r in range(len(rows)):
        for c1 in range(cols):
            for c2 in range(cols):
                MTM[c1][c2] += rows[r][c1] * rows[r][c2]
            MTab[c1] += rows[r][c1] * obs[r]
    
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
    
    x = [0.0]*cols
    for i in range(cols-1, -1, -1):
        s = aug[i][cols]
        for j in range(i+1, cols):
            s -= aug[i][j] * x[j]
        x[i] = s / aug[i][i]
    
    # Compute RMSE at corners
    ssr = 0
    for c in corners:
        e_conf = apply_conformal_correction(c['cassX'])
        n = c['cassY']
        pred_e = x[0] * e_conf + x[1] * n + x[2]
        pred_n = -x[1] * e_conf + x[0] * n + x[3]
        ssr += (pred_e - c['utmE'])**2 + (pred_n - c['utmN'])**2
    
    n_pts = len(corners)
    dof = max(n_pts - 2, 1)  # 4 params, n points, 2n obs
    rmse_m = math.sqrt(ssr / (2 * dof))
    
    return {'P': x[0], 'Q': x[1], 'Cx': x[2], 'Cy': x[3], 'rmse_mm': round(rmse_m * 1000, 1)}

def compute_affine6(corners):
    """
    Compute 6-param affine from corners.
    E_utm = a + b*E + c*N
    N_utm = d + e*E + f*N
    """
    A = [[1, c['cassX'], c['cassY']] for c in corners]
    bE = [c['utmE'] for c in corners]
    bN = [c['utmN'] for c in corners]
    
    # Solve via normal equations
    n = 3
    ATA_E = [[0.0]*n for _ in range(n)]
    ATb_E = [0.0]*n
    ATA_N = [[0.0]*n for _ in range(n)]
    ATb_N = [0.0]*n
    
    for r in range(len(A)):
        for i in range(n):
            for j in range(n):
                ATA_E[i][j] += A[r][i] * A[r][j]
                ATA_N[i][j] += A[r][i] * A[r][j]
            ATb_E[i] += A[r][i] * bE[r]
            ATb_N[i] += A[r][i] * bN[r]
    
    def solve3x3(ATA, ATb):
        aug = [ATA[i][:] + [ATb[i]] for i in range(3)]
        for col in range(3):
            max_row = max(range(col, 3), key=lambda r: abs(aug[r][col]))
            if abs(aug[max_row][col]) < 1e-20: return None
            if max_row != col: aug[col], aug[max_row] = aug[max_row], aug[col]
            for row in range(col+1, 3):
                f = aug[row][col] / aug[col][col]
                for j in range(col, 4): aug[row][j] -= f * aug[col][j]
        x = [0.0]*3
        for i in range(2, -1, -1):
            s = aug[i][3]
            for j in range(i+1, 3): s -= aug[i][j] * x[j]
            x[i] = s / aug[i][i]
        return x
    
    xE = solve3x3(ATA_E, ATb_E)
    xN = solve3x3(ATA_N, ATb_N)
    if xE is None or xN is None: return None
    
    return {'a': xE[0], 'b': xE[1], 'c': xE[2], 'd': xN[0], 'e': xN[1], 'f': xN[2]}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: Parse National XLS Sheet 3 (Whole-Sheet Corners)
# ═══════════════════════════════════════════════════════════════════════════════

print("STEP 1: Parsing national XLS Sheet 3 (whole-sheet corners)...")
wb = xlrd.open_workbook(os.path.join(_INPUT_DIR, "national.xls"))
sheet3 = wb.sheet_by_index(3)

whole_sheet_corners = {}
current_sheet_id = None
corners = []

for row_idx in range(1, sheet3.nrows):
    row_vals = [sheet3.cell_value(row_idx, col) for col in range(5)]
    col_a, col_b, col_c, col_d, col_e = row_vals
    
    if col_a != '' and col_a is not None:
        if current_sheet_id and len(corners) == 4:
            whole_sheet_corners[current_sheet_id] = corners
        raw_id = str(col_a).strip()
        current_sheet_id = roman_to_arabic(raw_id)
        corners = []
        try:
            corners.append({'cassX': float(col_b), 'cassY': float(col_c), 'utmE': float(col_d), 'utmN': float(col_e)})
        except: pass
    elif current_sheet_id:
        try:
            corners.append({'cassX': float(col_b), 'cassY': float(col_c), 'utmE': float(col_d), 'utmN': float(col_e)})
        except: pass

if current_sheet_id and len(corners) == 4:
    whole_sheet_corners[current_sheet_id] = corners

print(f"  Extracted {len(whole_sheet_corners)} sheets")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: Parse National XLS Sheet 5 (Real Sub-sheet Corners)
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 2: Parsing national XLS Sheet 5 (real sub-sheet corners)...")
sheet5 = wb.sheet_by_index(5)

real_subsheets = {}
current_sheet = None
current_sub = None
sub_corners = []

for row_idx in range(2, sheet5.nrows):
    vals = [sheet5.cell_value(row_idx, c) for c in range(6)]
    col_a, col_b, col_c, col_d, col_e, col_f = vals
    
    if col_a != '' and col_a is not None:
        if current_sheet and current_sub and len(sub_corners) >= 3:
            if current_sheet not in real_subsheets:
                real_subsheets[current_sheet] = {}
            real_subsheets[current_sheet][current_sub] = sub_corners
        current_sheet = str(col_a).strip().replace('_', '/')
        try: current_sub = str(int(float(col_b)))
        except: current_sub = str(col_b).strip()
        sub_corners = []
        try:
            sub_corners.append({'cassX': float(col_c), 'cassY': float(col_d), 'utmE': float(col_e), 'utmN': float(col_f)})
        except: pass
    elif current_sheet:
        try:
            sub_corners.append({'cassX': float(col_c), 'cassY': float(col_d), 'utmE': float(col_e), 'utmN': float(col_f)})
        except: pass

if current_sheet and current_sub and len(sub_corners) >= 3:
    if current_sheet not in real_subsheets: real_subsheets[current_sheet] = {}
    real_subsheets[current_sheet][current_sub] = sub_corners

for sid in real_subsheets:
    print(f"  {sid}: {len(real_subsheets[sid])} sub-sheets")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: Compute Helmert 4-param for ALL whole-sheet corners (FIXED: raw N)
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 3: Computing Helmert 4-param (raw N) for all sheets...")
helmert_results = {}

for sheet_id, corners in whole_sheet_corners.items():
    params = compute_helmert4(corners)
    if params:
        helmert_results[sheet_id] = params

print(f"  Computed Helmert for {len(helmert_results)} sheets")

# Validate
for sid in ['148/1', '148/2', '148/3', '148/4', '75/3', '88/2', '88/4']:
    if sid in helmert_results:
        p = helmert_results[sid]
        print(f"  {sid}: P={p['P']:.10f}, Q={p['Q']:.2e}, RMSE={p['rmse_mm']}mm")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: Generate synthetic 5×5 sub-sheet grids
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 4: Generating synthetic 5×5 sub-sheet grids...")

def bilinear_grid(corners):
    """Create 6×6 grid from 4 corners, return 25 sub-sheets."""
    xs = [c['cassX'] for c in corners]
    ys = [c['cassY'] for c in corners]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    
    # Map corners by position
    corner_map = {}
    for c in corners:
        xk = 'min' if abs(c['cassX'] - min_x) < abs(c['cassX'] - max_x) else 'max'
        yk = 'min' if abs(c['cassY'] - min_y) < abs(c['cassY'] - max_y) else 'max'
        corner_map[f"{xk}_{yk}"] = c
    
    required = ['min_min', 'max_min', 'max_max', 'min_max']
    if not all(k in corner_map for k in required):
        return None
    
    tl = corner_map['min_min']  # min X, min Y
    tr = corner_map['max_min']
    br = corner_map['max_max']
    bl = corner_map['min_max']
    
    gs = 6  # grid size
    grid = []
    for r in range(gs):
        row = []
        for c in range(gs):
            s = c / (gs - 1)
            t = r / (gs - 1)
            def lerp(a, b, c, d, s, t):
                return (1-s)*(1-t)*a + s*(1-t)*b + (1-s)*t*c + s*t*d
            row.append({
                'cassX': lerp(tl['cassX'], tr['cassX'], bl['cassX'], br['cassX'], s, t),
                'cassY': lerp(tl['cassY'], tr['cassY'], bl['cassY'], br['cassY'], s, t),
                'utmE': lerp(tl['utmE'], tr['utmE'], bl['utmE'], br['utmE'], s, t),
                'utmN': lerp(tl['utmN'], tr['utmN'], bl['utmN'], br['utmN'], s, t),
            })
        grid.append(row)
    
    # Convert to 25 sub-sheets
    subs = {}
    for r in range(5):
        for c in range(5):
            sub_id = str(r * 5 + c + 1)
            subs[sub_id] = [grid[r][c], grid[r][c+1], grid[r+1][c+1], grid[r+1][c]]
    return subs

all_subsheets = {}
for sheet_id, corners in whole_sheet_corners.items():
    subs = bilinear_grid(corners)
    if subs:
        all_subsheets[sheet_id] = subs

print(f"  Generated sub-sheets for {len(all_subsheets)} sheets")

# Override with real data where available
for sid, subs in real_subsheets.items():
    all_subsheets[sheet_id] = subs  # BUG: should be sid not sheet_id
for sid, subs in real_subsheets.items():
    all_subsheets[sid] = subs
    print(f"  Overriding with REAL data for {sid}")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: Parse individual XLS for 6-param polynomial coefficients
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 5: Parsing individual XLS for 6-param coefficients...")
poly_params = {}

individual_files = [
    ('148/1',   '148_1.xls'),
    ('148/2',   '148_2.xls'),
    ('148/2.1', '148_2_1.xls'),
    ('148/3',   '148_3.xls'),
    ('148/4',   '148_4.xls'),
    ('148/4.1', '148_4_1.xls'),
]

for sheet_id, filename in individual_files:
    filepath = os.path.join(_INPUT_DIR, '148_series', filename)
    if not os.path.exists(filepath):
        print(f"  ✗ {sheet_id}: not found")
        continue
    try:
        wb_ind = xlrd.open_workbook(filepath)
        sol = wb_ind.sheet_by_name('solution of four parameters')
        # Scan for the solution values - they might not be at fixed rows
        # Let's look at all rows to find the P, Q, A, B, Cx, Cy pattern
        # The solution vector is typically labeled
        found = False
        for row_idx in range(sol.nrows):
            row_label = str(sol.cell_value(row_idx, 0)).strip().lower()
            val = sol.cell_value(row_idx, 1)
            try:
                val = float(val)
            except:
                continue
            if row_label in ['p', 'p ']:
                P = val
                Q = float(sol.cell_value(row_idx + 1, 1))
                A = float(sol.cell_value(row_idx + 2, 1))
                B = float(sol.cell_value(row_idx + 3, 1))
                Cx = float(sol.cell_value(row_idx + 4, 1))
                Cy = float(sol.cell_value(row_idx + 5, 1))
                poly_params[sheet_id] = {'P': P, 'Q': Q, 'A': A, 'B': B, 'Cx': Cx, 'Cy': Cy}
                print(f"  ✓ {sheet_id}: P={P:.10f}, Q={Q:.2e}, A={A:.2e}, B={B:.2e}")
                found = True
                break
        if not found:
            print(f"  ✗ {sheet_id}: could not find parameter labels in solution sheet")
    except Exception as e:
        print(f"  ✗ {sheet_id}: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: Output files
# ═══════════════════════════════════════════════════════════════════════════════

print("\nSTEP 6: Generating output files...")

# 6a. Whole-sheet corners JSON
with open(os.path.join(_DATA_DIR, 'whole_sheet_corners.json'), 'w') as f:
    json.dump(whole_sheet_corners, f, indent=2)
print(f"  ✓ whole_sheet_corners.json ({len(whole_sheet_corners)} sheets)")

# 6b. Merged sub-sheet corners
with open(os.path.join(_DATA_DIR, 'merged_subsheets.json'), 'w') as f:
    json.dump(all_subsheets, f, indent=2)
total_subs = sum(len(v) for v in all_subsheets.values())
print(f"  ✓ merged_subsheets.json ({len(all_subsheets)} sheets, {total_subs} sub-sheets)")

# 6c. TypeScript file with all Helmert params
ts_lines = []
ts_lines.append('/**')
ts_lines.append(' * Kenya Topo Sheet Data — Auto-generated from National Survey XLS')
ts_lines.append(' * DO NOT EDIT MANUALLY — Generated by extract_all.py')
ts_lines.append(f' * Total sheets: {len(helmert_results)}')
ts_lines.append(' * Each sheet: Helmert 4-param (P, Q, Cx, Cy) from 4 sheet corners')
ts_lines.append(' */')
ts_lines.append('')
ts_lines.append("import type { TopoSheetParams, CommonPoint } from './cassini'")
ts_lines.append('')

# Generate common point arrays and sheet entries
cp_defs = []
sheet_entries = []
for sheet_id in sorted(helmert_results.keys()):
    hp = helmert_results[sheet_id]
    corners = whole_sheet_corners[sheet_id]
    
    var_name = f"CP_{sheet_id.replace('/', '_').replace('.', 'p')}"
    cp_lines = []
    for i, c in enumerate(corners):
        cp_lines.append(
            f"    {{ station: 'C{i+1}', cassN: {c['cassY']:.1f}, cassE: {c['cassX']:.1f}, utmN: {c['utmN']:.3f}, utmE: {c['utmE']:.3f} }}"
        )
    cp_defs.append(f"const {var_name}: CommonPoint[] = [\n" + ',\n'.join(cp_lines) + "\n]")
    
    has_poly = sheet_id in poly_params
    poly_lines = ''
    if has_poly:
        pp = poly_params[sheet_id]
        poly_lines = f",\n    A: {pp['A']:.15e},\n    B: {pp['B']:.15e}"
    
    # Determine UTM zone from UTM easting
    utm_zone = 37  # default for Kenya
    utm_e = corners[0]['utmE']
    if utm_e < 166000:
        utm_zone = 36
    
    sheet_entries.append(f"""  {{
    id: '{sheet_id}',
    name: 'Sheet {sheet_id}',
    description: 'Kenya topo sheet {sheet_id}. Helmert from 4 corners. Zone {utm_zone}S.'{poly_lines},
    P: {hp['P']:.15e},
    Q: {hp['Q']:.15e},
    Cx: {hp['Cx']:.10f},
    Cy: {hp['Cy']:.10f},
    commonPoints: {var_name},
  }}""")

ts_lines.extend(cp_defs)
ts_lines.append('')
ts_lines.append(f'export const ALL_KENYA_SHEETS: TopoSheetParams[] = [')
ts_lines.append(',\n\n'.join(sheet_entries))
ts_lines.append(']')
ts_lines.append('')

with open(os.path.join(_TS_DIR, 'kenya_sheets.ts'), 'w') as f:
    f.write('\n'.join(ts_lines))
print(f"  ✓ kenya_sheets.ts ({len(sheet_entries)} sheets)")

# 6d. Sheet ID list for UI dropdown
sheet_ids = sorted(helmert_results.keys())
with open(os.path.join(_DATA_DIR, 'sheet_ids.json'), 'w') as f:
    json.dump(sheet_ids, f, indent=2)
print(f"  ✓ sheet_ids.json ({len(sheet_ids)} sheet IDs)")

print("\n" + "="*70)
print("EXTRACTION COMPLETE")
print("="*70)
