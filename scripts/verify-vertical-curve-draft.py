"""Check original draft exports with Decimal/CSV and an independent PDF reader.

Use the existing bundled Python/pypdf. No network, account or database access.
"""
import csv
from decimal import Decimal, ROUND_FLOOR, localcontext
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import pypdf

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'curves-vertical-ui'
receipt = folder / 'file-reader.json'
receipt.write_text(json.dumps({'status': 'running'}))
manifest = json.loads((folder / 'source-fixtures.json').read_text(encoding='utf-8'))
assert manifest['status'] == 'passed' and manifest['sourcePreserved']
for path, digest in manifest['source'].items():
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
fixtures = dict(manifest['fixtures'])
if sys.argv[1:]:
    assert sys.argv[1:] == ['--browser']
    fixtures['browser-sag'] = {'input': fixtures['sag']['input']}
    assert hashlib.sha256((folder / 'browser-sag.csv').read_bytes()).hexdigest() == fixtures['sag']['csvHash']

results = {}
numeric_row = re.compile(r'^\s*(-?\d+\.\d{4})\s+(-?\d+\.\d{4})\s+(-?\d+\.\d{4})\s+(-?\d+\.\d{4})\s+(-?\d+\.\d{4})(?:\s+(.*))?\s*$')
for name, fixture in fixtures.items():
    csv_file, pdf_file = folder / f'{name}.csv', folder / f'{name}.pdf'
    for kind, file in [('csv', csv_file), ('pdf', pdf_file)]:
        if f'{kind}Hash' in fixture:
            assert hashlib.sha256(file.read_bytes()).hexdigest() == fixture[f'{kind}Hash']
    rows = list(csv.DictReader(csv_file.read_text(encoding='utf-8').splitlines()))
    data = fixture['input']
    with localcontext() as context:
        context.prec = 50
        number = lambda key: Decimal(str(data[key]))
        g1, g2, station, level = map(number, ('g1', 'g2', 'vpiChainage', 'vpiRL'))
        delta = g2 - g1
        length = number('curveLength') if 'curveLength' in data else number('kValue') * abs(delta)
        interval = number('interval')
        bvc, evc = station - length / 2, station + length / 2
        expected_stations = [bvc, evc]
        peg = ((bvc / interval).to_integral_value(rounding=ROUND_FLOOR) + 1) * interval
        while peg < evc:
            expected_stations.append(peg)
            peg += interval
        stationary = -g1 * length / delta if delta else None
        if stationary is not None and 0 <= stationary <= length:
            expected_stations.append(bvc + stationary)
        expected_stations = sorted(set(expected_stations))
        assert len(rows) == len(expected_stations), (name, 'row count')
        for row, expected_station in zip(rows, expected_stations):
            actual_station = Decimal(row['Chainage_m'])
            assert abs(actual_station - expected_station) < Decimal('1e-8')
            x = actual_station - bvc
            expected_level = level - g1 * length / 200 + g1 * x / 100 + delta * x * x / (200 * length)
            for field, expected in [('RL_m', expected_level), ('X_from_BVC_m', x),
                                    ('Offset_from_incoming_tangent_m', delta * x * x / (200 * length)),
                                    ('Grade_percent', g1 + delta * x / length)]:
                assert abs(Decimal(row[field]) - expected) < Decimal('1e-8'), (name, field, row[field], expected)
            assert row['VPI_RL_m'] == str(data['vpiRL']) and Decimal(row['VPI_chainage_m']) == station
            assert row['Model'] == 'symmetric-parabolic' and row['Draft_status'] == 'LOCAL_CALCULATION_DRAFT'
            assert row['Standard_compliance'] == 'NOT_ASSESSED' and row['Vertical_datum_status'] == 'NOT_VERIFIED'
            assert row['Length_authority'] == ('L' if 'curveLength' in data else 'K')
            if delta:
                assert abs(Decimal(row['K_m_per_percent']) - length / abs(delta)) < Decimal('1e-8')
            else:
                assert row['K_m_per_percent'] == '' and row['K_status'] == 'UNDEFINED_EQUAL_GRADES'
        assert 'BVC' in rows[0]['Point'] and 'EVC' in rows[-1]['Point']
        if stationary is not None and 0 < stationary < length:
            matches = [row for row in rows if abs(Decimal(row['Chainage_m']) - bvc - stationary) < Decimal('1e-8')]
            assert len(matches) == 1 and ('LOW POINT' if delta > 0 else 'HIGH POINT') in matches[0]['Point']

    document = pypdf.PdfReader(pdf_file, strict=True)
    text = '\n'.join(page.extract_text(extraction_mode='layout') for page in document.pages)
    assert 'DRAFT - REVIEW REQUIRED - NOT APPROVED FOR CONSTRUCTION' in text
    assert 'No project assigned (local draft)' in text and 'vertical datum NOT VERIFIED' in text
    assert 'Standard compliance NOT ASSESSED' in text
    assert 'K-Compliance' not in text and 'RDM 1.3 min K' not in text
    printed = [match for line in text.splitlines() if (match := numeric_row.match(line))]
    assert len(printed) == len(rows), (name, len(printed), len(rows))
    for match, row in zip(printed, rows):
        for value, field in zip(match.groups()[:5], ['Chainage_m', 'RL_m', 'X_from_BVC_m', 'Offset_from_incoming_tangent_m', 'Grade_percent']):
            assert math.isclose(float(value), float(row[field]), rel_tol=0, abs_tol=0.000051), (name, field)
        assert (match.group(6) or '').strip() == row['Point']
    for i, page in enumerate(document.pages, 1):
        assert page.mediabox.width > page.mediabox.height
        page_text = page.extract_text()
        assert f'Page {i} of {len(document.pages)}' in page_text
        assert 'NOT APPROVED FOR CONSTRUCTION' in page_text, (name, i, 'detached page lacks explicit draft status')
        if any(numeric_row.match(line) for line in page.extract_text(extraction_mode='layout').splitlines()):
            assert all(label in page_text for label in ['Chainage m', 'Level m', 'Grade %', 'Point'])
    if name == 'dense':
        assert len(document.pages) > 1
    (folder / f'{name}.txt').write_text(text, encoding='utf-8')
    results[name] = {'rows': len(rows), 'pdfPages': len(document.pages),
                     'csvHash': hashlib.sha256(csv_file.read_bytes()).hexdigest(), 'pdfHash': hashlib.sha256(pdf_file.read_bytes()).hexdigest()}

receipt.write_text(json.dumps({'status': 'passed', 'reader': f'pypdf {pypdf.__version__}', 'files': results,
    'readerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'scope': 'synthetic local drafts; numerical/printed precision checks are not field tolerances'}, indent=2))
print(json.dumps({'status': 'passed', 'draftPairs': len(results), 'rows': sum(result['rows'] for result in results.values()), 'pdfPages': sum(result['pdfPages'] for result in results.values())}))
