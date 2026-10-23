"""Independent trigonometry/CSV/PDF checks of retained synthetic curve drafts."""
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import pypdf

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'curve-plan-integrity'
receipt = folder / 'file-reader.json'
receipt.write_text(json.dumps({'status': 'running'}))
manifest = json.loads((folder / 'source-fixtures.json').read_text(encoding='utf-8'))
assert manifest['status'] == 'passed' and manifest['sourcePreserved']
for path, digest in manifest['source'].items():
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path


def close(actual, expected):
    assert math.isfinite(float(actual)) and math.isclose(float(actual), expected, rel_tol=1e-12, abs_tol=1e-8), (actual, expected)


counts = {'pairs': 0, 'stations': 0, 'printedStations': 0, 'pdfPages': 0}
labels = {'tangent_m': 'Tangent length (m)', 'arc_m': 'Arc length (m)', 'long_chord_m': 'Long chord (m)',
          'external_m': 'External distance (m)', 'mid_ordinate_m': 'Mid-ordinate (m)',
          'PC_m': 'PC chainage (m)', 'PI_m': 'PI chainage (m)', 'PT_m': 'PT chainage (m)', 'PCC_m': 'PCC chainage (m)',
          'first_tangent_m': 'First arc tangent (m)', 'second_tangent_m': 'Second arc tangent (m)',
          'first_arc_m': 'First arc length (m)', 'second_arc_m': 'Second arc length (m)', 'total_arc_m': 'Total arc length (m)',
          'intervening_tangent_m': 'Intervening tangent gap (m)', 'arc_sum_m': 'Sum of arc lengths (m)', 'total_path_m': 'Total path length (m)'}
for name, fixture in manifest['fixtures'].items():
    snapshot = fixture['snapshot']
    data, kind = snapshot['input'], snapshot['kind']
    if kind == 'simple':
        r, angle = data['radius'], math.radians(data['deflectionDeg'])
        tangent, arc = r * math.tan(angle / 2), r * angle
        pc = data['piChainage'] - tangent
        expected = {'tangent_m': tangent, 'arc_m': arc, 'long_chord_m': 2 * r * math.sin(angle / 2),
                    'external_m': r * (1 / math.cos(angle / 2) - 1), 'mid_ordinate_m': r * (1 - math.cos(angle / 2)),
                    'PC_m': pc, 'PI_m': data['piChainage'], 'PT_m': pc + arc}
        stations = [pc]
        peg = (math.floor(pc / data['interval']) + 1) * data['interval']
        while peg < pc + arc - 1e-9:
            stations.append(peg)
            peg += data['interval']
        stations.append(pc + arc)
    else:
        r1, r2 = data['R1'], data['R2']
        a1, a2 = math.radians(data['delta1Deg'] if kind == 'compound' else data['delta1']), math.radians(data['delta2Deg'] if kind == 'compound' else data['delta2'])
        t1, t2 = r1 * math.tan(a1 / 2), r2 * math.tan(a2 / 2)
        l1, l2 = r1 * a1, r2 * a2
        expected = {'first_tangent_m': t1, 'second_tangent_m': t2, 'first_arc_m': l1, 'second_arc_m': l2}
        if kind == 'compound':
            pcc = data['junctionChainage']
            expected.update({'total_arc_m': l1 + l2, 'PC_m': pcc - l1, 'PCC_m': pcc, 'PT_m': pcc + l2})
        else:
            gap = data['AB'] - t1 - t2
            assert gap >= 0
            expected.update({'intervening_tangent_m': gap, 'arc_sum_m': l1 + l2, 'total_path_m': l1 + gap + l2})
    assert set(expected) == set(snapshot['values'])
    for field, value in expected.items():
        close(snapshot['values'][field], value)

    csv_path, pdf_path = folder / f'{name}.csv', folder / f'{name}.pdf'
    assert hashlib.sha256(csv_path.read_bytes()).hexdigest() == fixture['csvHash']
    assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == fixture['pdfHash']
    rows = list(csv.DictReader(csv_path.read_text(encoding='utf-8').splitlines()))
    inputs = {row['Parameter']: float(row['Value']) for row in rows if row['Record'] == 'INPUT'}
    results = {row['Parameter']: float(row['Value']) for row in rows if row['Record'] == 'RESULT'}
    assert inputs == data and set(results) == set(expected)
    for field, value in expected.items():
        close(results[field], value)
    assert all(row['Draft_status'] == 'LOCAL_CALCULATION_DRAFT' and row['Standard_compliance'] == 'NOT_ASSESSED' and row['CRS_status'] == 'NOT_VERIFIED' for row in rows)
    pegs = [row for row in rows if row['Record'] == 'STATION']
    if kind == 'simple':
        assert len(pegs) == len(stations)
        for row, station in zip(pegs, stations):
            close(row['Chainage_m'], station)
            close(row['Chord_from_PC_m'], 2 * r * math.sin((station - pc) / (2 * r)))
        assert pegs[-1]['Deflection_from_PC_tangent'].startswith('30°')
        counts['stations'] += len(pegs)
    else:
        assert not pegs

    pdf = pypdf.PdfReader(pdf_path, strict=True)
    text = '\n'.join(page.extract_text(extraction_mode='layout') for page in pdf.pages)
    for field, value in expected.items():
        matches = re.findall(r'^\s*' + re.escape(labels[field]) + r'\s+(-?\d+\.\d{4})\s*$', text, flags=re.M)
        assert len(matches) == 1, (name, field, matches)
        assert math.isclose(float(matches[0]), value, rel_tol=0, abs_tol=0.000051)
    assert 'NOT ASSESSED' in text and 'NOT VERIFIED' in text
    assert 'No project assigned (local draft)' in text
    assert 'RDM 1.3 Compliance' not in text
    if kind == 'simple':
        printed = re.findall(r'^\s*(-?\d+\.\d{4})\s+(\d+\.\d{4})\s+(.+?)\s*$', text, flags=re.M)
        assert len(printed) == len(pegs), (name, len(printed), len(pegs))
        for row, peg in zip(printed, pegs):
            assert math.isclose(float(row[0]), float(peg['Chainage_m']), abs_tol=0.000051)
            assert math.isclose(float(row[1]), float(peg['Chord_from_PC_m']), abs_tol=0.000051)
        counts['printedStations'] += len(printed)
    for i, page in enumerate(pdf.pages, 1):
        assert 'DRAFT - NOT APPROVED FOR CONSTRUCTION' in page.extract_text()
        assert f'Page {i} of {len(pdf.pages)}' in page.extract_text()
    if name == 'simple-dense':
        assert len(pdf.pages) > 1
    counts['pairs'] += 1
    counts['pdfPages'] += len(pdf.pages)
    (folder / f'{name}.txt').write_text(text, encoding='utf-8')

receipt.write_text(json.dumps({'status': 'passed', 'counts': counts, 'reader': f'pypdf {pypdf.__version__}',
    'sourceReceiptHash': hashlib.sha256((folder / 'source-fixtures.json').read_bytes()).hexdigest(),
    'readerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'scope': 'synthetic source calculation/file checks; not browser, production or field acceptance'}, indent=2))
print(json.dumps({'status': 'passed', **counts}))
