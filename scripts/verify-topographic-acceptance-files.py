"""Independent file acceptance for the five-point synthetic plane, not field proof.

Run with the existing CAD verifier packages under .cache/cad-export-verifier.
Inputs must be ordinary browser downloads under the named source-only receipt.
"""
from pathlib import Path
import csv
import hashlib
import json
import math
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf
import pypdf
import pdfplumber

root = Path('test-results/topographic-source-acceptance')
expected_ends = {
    -1: {(500000, 9850010), (500010, 9850000)},
    0: {(500000, 9850020), (500020, 9850000)},
    1: {(500010, 9850020), (500020, 9850010)},
}
def plane(e, n):
    return -2 + 0.1 * (e - 500000) + 0.1 * (n - 9850000)

dxf = ezdxf.readfile(root / 'contours.dxf')
audit = dxf.audit()
assert not audit.errors and not audit.fixes, 'Ordinary parser must not repair the artifact'
assert dxf.header['$INSUNITS'] == 6 and dxf.dxfversion == 'AC1021'
lines = list(dxf.modelspace().query('LWPOLYLINE'))
assert len(lines) == 3 and {line.dxf.elevation for line in lines} == set(expected_ends)
for line in lines:
    vertices = list(line.get_points())
    ends = {(vertices[0][0], vertices[0][1]), (vertices[-1][0], vertices[-1][1])}
    assert ends == expected_ends[line.dxf.elevation] and not line.closed
    for e, n, *_ in vertices:
        assert math.isfinite(e) and math.isfinite(n)
        assert abs(line.dxf.elevation - plane(e, n)) < 1e-8
    assert dxf.layers.get(line.dxf.layer).dxf.lineweight == (50 if line.dxf.elevation == 0 else 15)
with (root / 'contours.csv').open(encoding='utf-8', newline='') as stream:
    rows = list(csv.DictReader(stream))
assert len(rows) == sum(len(line.get_points()) for line in lines) == 9
assert len({row['contour_id'] for row in rows}) == 3
for row in rows:
    assert abs(float(row['elevation_m']) - plane(float(row['easting_m']), float(row['northing_m']))) < 1e-8
    assert row['horizontal_crs'] == 'EPSG:21037'
    assert row['vertical_datum'] == 'Synthetic local benchmark - no field evidence'
    assert (row['is_index'] == 'true') == (float(row['elevation_m']) == 0)
svg = ET.parse(root / 'contours.svg').getroot()
ns = {'s': 'http://www.w3.org/2000/svg'}
assert svg.attrib['width'] == '420mm' and svg.attrib['height'] == '297mm'
assert len(svg.findall('s:polyline', ns)) == 3
assert not svg.findall('.//s:script', ns)
labels = ' '.join(svg.itertext())
for expected in ['SYNTHETIC', 'DRAFT', 'EPSG:21037', 'Synthetic local benchmark', 'MAP KEY']:
    assert expected in labels, expected
reader = pypdf.PdfReader(root / 'contour-plan-a3.pdf')
assert len(reader.pages) == 1
page = reader.pages[0]
assert abs(float(page.mediabox.width) - 1190.55) < 2 and abs(float(page.mediabox.height) - 841.89) < 2
text = page.extract_text() or ''
for expected in ['SYNTHETIC', 'DRAFT', 'MAP KEY', 'EPSG:21037', 'Synthetic local benchmark', 'SURVEY QA REQUIRED']:
    assert expected in text, expected
with pdfplumber.open(root / 'contour-plan-a3.pdf') as document:
    for char in document.pages[0].chars:
        assert char['x0'] >= 0 and char['x1'] <= float(page.mediabox.width) + 1
        assert char['top'] >= 0 and char['bottom'] <= float(page.mediabox.height) + 1
result = {
    'status': 'passed', 'synthetic': True, 'origin': 'http://127.0.0.1:3021',
    'projectId': '474f92f6-0e90-4129-83fb-d514db596876', 'browserDownloads': 4,
    'polylines': 3, 'csvVertices': 9, 'independentPlaneAndEndpoints': True,
    'zeroContourRetained': True, 'metreUnits': True, 'dxfAuditErrorsAndRepairs': 0,
    'a3LandscapePdf': True, 'pdfTextWithinPage': True, 'svgXmlValid': True,
    'independentExpectedVolumeAboveMinus2M': 800, 'volumeProof': 'browser display only; volume is not in these four files',
    'productionProof': False, 'fieldInstrumentProof': False, 'receivingCadApplicationProof': False,
    'files': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ['contours.dxf', 'contours.csv', 'contours.svg', 'contour-plan-a3.pdf']},
}
(root / 'native-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
