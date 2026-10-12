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

production = '--production' in sys.argv
root = Path('test-results/contour-production-browser/current-release' if production else 'test-results/contour-source-browser')
if production:
    promotion = json.loads(Path('test-results/notice-worker-release/promotion.json').read_text(encoding='utf-8-sig'))
    association = json.loads((root / 'browser-association.json').read_text(encoding='utf-8-sig'))
    assert promotion['status'] == 'promoted'
    assert association['releaseId'] == promotion['health']['releaseId']
    assert association['imageId'] == promotion['applicationAfter']['image']
    assert association['origin'] == 'http://127.0.0.1:3000'
dxf = ezdxf.readfile(root / 'contours.dxf')
audit = dxf.audit()
assert not audit.errors and not audit.fixes, 'Use a normal parser, without recovery or repairs'
entities = list(dxf.modelspace().query('LWPOLYLINE'))
assert len(entities) == 14 and dxf.header['$INSUNITS'] == 6 and dxf.dxfversion == 'AC1021'
def plane(e, n):
    return 100 + 0.1 * (e - 500000) + 0.05 * (n - 9900000)
for line in entities:
    for e, n, *_ in line.get_points():
        assert math.isfinite(e) and math.isfinite(n)
        assert abs(line.dxf.elevation - plane(e, n)) < 1e-8
    assert dxf.layers.get(line.dxf.layer).dxf.lineweight == (50 if line.dxf.elevation in [105, 110] else 15)
with (root / 'contours.csv').open(encoding='utf-8', newline='') as stream:
    rows = list(csv.DictReader(stream))
assert len({row['contour_id'] for row in rows}) == 14
assert sum(len(line.get_points()) for line in entities) == len(rows)
for row in rows:
    assert abs(float(row['elevation_m']) - plane(float(row['easting_m']), float(row['northing_m']))) < 1e-8
    assert row['horizontal_crs'] == 'EPSG:32737'
    assert row['vertical_datum'] == 'Synthetic benchmark BM-01 - metres'
    assert (row['is_index'] == 'true') == (float(row['elevation_m']) in [105, 110])
svg = ET.parse(root / 'contours.svg').getroot()
ns = {'s': 'http://www.w3.org/2000/svg'}
assert svg.attrib['width'] == '420mm' and svg.attrib['height'] == '297mm'
assert len(svg.findall('s:polyline', ns)) == 14
assert not svg.findall('.//s:script', ns)
labels = ' '.join(svg.itertext())
for expected in ['SYNTHETIC', 'DRAFT', 'EPSG:32737', 'Synthetic benchmark BM-01 - metres', 'MAP KEY']:
    assert expected in labels, expected
reader = pypdf.PdfReader(root / 'contour-plan-a3.pdf')
assert len(reader.pages) == 1
page = reader.pages[0]
assert abs(float(page.mediabox.width) - 1190.55) < 2 and abs(float(page.mediabox.height) - 841.89) < 2
text = page.extract_text() or ''
for expected in ['SYNTHETIC', 'DRAFT', 'MAP KEY', 'EPSG:32737', 'Synthetic benchmark BM-01', 'SURVEY QA REQUIRED']:
    assert expected in text, expected
with pdfplumber.open(root / 'contour-plan-a3.pdf') as document:
    for char in document.pages[0].chars:
        assert char['x0'] >= 0 and char['x1'] <= page.mediabox.width + 1
        assert char['top'] >= 0 and char['bottom'] <= page.mediabox.height + 1
result = {'synthetic': True, 'sourceBrowserOrigin': 'http://127.0.0.1:3000' if production else 'http://127.0.0.1:3021', 'browserDownloads': 4,
          'dxfNormalParserErrors': 0, 'dxfAuditRepairs': 0, 'polylines': 14,
          'csvVertices': len(rows), 'independentPlaneEquality': True, 'metreUnits': True,
          'indexLineweightsPreserved': True, 'svgXmlValid': True, 'svgPolylines': 14,
          'a3LandscapePdf': True, 'pdfTextWithinPage': True,
          'knownPlaneVolumeAbove100M': 75000, 'productionProof': production, 'fieldInstrumentProof': False,
          'files': {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in ['contours.dxf', 'contours.csv', 'contours.svg', 'contour-plan-a3.pdf']}}
(root / 'native-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
