"""Independently inspect synthetic browser CAD downloads; requires ezdxf in an isolated verification environment."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
import ezdxf

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
args = parser.parse_args()
directory = args.directory.resolve()
source = json.loads((directory / 'drawing.metardu-cad').read_text(encoding='utf-8-sig'))
assert source['titleBlock']['projectName'].upper().startswith('SYNTHETIC'), 'Use labelled synthetic verification data only'
expected_points = [(500100.0, 694.0), (500200.0, 694.0)]
assert [(p['easting'], p['northing']) for p in source['beacons']] == expected_points
assert len(source['boundaries']) == 1

dxf = ezdxf.readfile(directory / 'drawing.dxf')
audit = dxf.audit()
assert not audit.errors and not audit.fixes, [(e.code, e.message) for e in [*audit.errors, *audit.fixes]]
assert dxf.dxfversion == 'AC1021'
assert dxf.units == 6
model = dxf.modelspace()
points = list(model.query('POINT[layer=="BEACONS"]'))
assert len(points) == 2
for point, expected in zip(points, expected_points):
    assert point.dxf.location.z == 0
    assert math.hypot(point.dxf.location.x - expected[0], point.dxf.location.y - expected[1]) < 1e-8
boundary, = model.query('LINE[layer=="BOUNDARY"]')
assert tuple(boundary.dxf.start) == (500100, 694, 0)
assert tuple(boundary.dxf.end) == (500200, 694, 0)
texts = [item.dxf.text for item in model.query('TEXT')]
assert '90°00\'00"  100.000m' in texts
assert any('EPSG:32636' in text and 'metres' in text for text in texts)
assert any('DRAFT — NOT CERTIFIED' in text for text in texts)
assert 'SYNTHETIC QA — NOT FOR FIELD USE' in texts
cartography = list(model.query('LINE[layer=="CARTOGRAPHY"]'))
assert any(math.isclose((line.dxf.end - line.dxf.start).magnitude, 50, abs_tol=1e-8) for line in cartography)

ns = {'s': 'http://www.w3.org/2000/svg'}
svg = ET.fromstring((directory / 'drawing.svg').read_bytes())
assert svg.attrib['viewBox'] == '0 0 1122 794'
assert not svg.findall('.//s:pattern', ns)
for element in svg.iter():
    assert not any(name.lower().startswith(('data-cad-', 'on')) for name in element.attrib)
    assert element.attrib.get('stroke') != '#2563eb', 'An active line/selection leaked into SVG'
svg_text = ''.join(svg.itertext())
assert '100.000m' in svg_text and '0.00m' not in svg_text
assert 'DRAFT — NOT CERTIFIED' in svg_text and 'EPSG:32636' in svg_text
metadata = json.loads(svg.find('s:metadata', ns).text)
assert metadata['certified'] is False and metadata['crs'] == 'EPSG:32636'
assert metadata['metersPerCanvasUnit'] == 0.5
assert any(e.attrib.get('x1') == '100' and e.attrib.get('y1') == '100' and e.attrib.get('x2') == '300' and e.attrib.get('y2') == '100' for e in svg.findall('.//s:line', ns))
for label, transform in [('QA-CONTROL', 'translate(100, 100)'), ('QA-B', 'translate(300, 100)')]:
    assert any(g.attrib.get('transform') == transform and any(t.text == label for t in g.findall('s:text', ns)) for g in svg.findall('.//s:g', ns))
    text, = [t for t in svg.findall('.//s:text', ns) if t.text == label]
    assert float(text.attrib['y']) - float(text.attrib['font-size']) > 1.5, 'Point label overlaps its incident horizontal boundary'

rows = list(csv.DictReader(io.StringIO((directory / 'coordinates.csv').read_text(encoding='utf-8-sig'), newline='')))
assert len(rows) == 2
assert [row['Beacon'] for row in rows] == ['QA-CONTROL', 'QA-B']
assert [(float(row['Easting']), float(row['Northing'])) for row in rows] == expected_points
assert all(row['CRS'] == 'EPSG:32636' and row['Units'] == 'metres' and row['Reference'] == 'Declared grid (draft)' for row in rows)
result = {'passed': True, 'synthetic': True, 'parser': f'ezdxf {ezdxf.__version__}', 'nativeAuditErrors': len(audit.errors), 'nativeAuditRepairs': len(audit.fixes),
          'points': expected_points, 'boundaryGridDistanceMetres': 100, 'bearingDegrees': 90, 'dxfVersion': dxf.dxfversion, 'unitsCode': dxf.units,
          'svgPreviewRemoved': True, 'csvReferencePassed': True,
          'files': {name: {'bytes': (directory / name).stat().st_size, 'sha256': hashlib.sha256((directory / name).read_bytes()).hexdigest()}
                    for name in ['drawing.dxf', 'drawing.svg', 'coordinates.csv', 'drawing.metardu-cad']},
          'autocadDesktopVerified': False, 'physicalSurveyAccuracyVerified': False}
(directory / 'native-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
