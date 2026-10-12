"""Compare actual TypeScript results with independent Shapely/GEOS polygonization.

Inputs are synthetic engineering grids. No customer data or production DB access.
The geometry library receives raw input edges, never the engine's face rings.
"""
import json
import math
from pathlib import Path
import shapely
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize_full

root = Path(__file__).resolve().parent.parent
source = json.loads((root / 'test-results/cad-topology/source-engine.json').read_text())
checks = []
for case in source['cases']:
    data, result = case['input'], case['result']
    scale = data.get('metersPerPixel', 1)
    grid = bool(data.get('coordinateReferenceSystem'))
    points = {b['id']: (b['easting'], b['northing']) if grid else (b['x']*scale, -b['y']*scale) for b in data['beacons']}
    lines = [LineString([points[e['fromId']], points[e['toId']]]) for e in data['boundaries']]
    un_noded = []
    for i, line in enumerate(lines):
        for j in range(i):
            hit = line.intersection(lines[j])
            if hit.is_empty:
                continue
            common = set(line.coords) & set(lines[j].coords)
            if hit.geom_type != 'Point' or (hit.x, hit.y) not in common:
                un_noded.append([j, i])
    if un_noded:
        assert result['status'] == 'invalid', case['name']
        assert result['totalAreaM2'] is None, case['name']
        checks.append({'name': case['name'], 'passed': True, 'nativeUnsplitIntersections': un_noded, 'sourceStatus': result['status']})
        continue
    polygons, cuts, dangles, invalid = polygonize_full(lines)
    assert invalid.is_empty, case['name']
    faces = list(polygons.geoms)
    assert all(p.is_valid for p in faces), case['name']
    assert len(faces) == len(result['faces']), case['name']
    remainder = len(cuts.geoms) + len(dangles.geoms)
    expected_status = ('mixed' if remainder else 'closed') if faces else 'open'
    assert result['status'] == expected_status, case['name']
    assert remainder == result['unenclosedEdgeCount'], case['name']
    area = sum(face.area for face in faces)
    length = sum(line.length for line in lines)
    metric = 'metersPerPixel' in data
    if metric:
        assert math.isclose(area, result['totalAreaM2'], rel_tol=0, abs_tol=1e-6), case['name']
        assert math.isclose(length, result['networkLengthM'], rel_tol=0, abs_tol=1e-6), case['name']
        native_schedule = sorted((p.area, p.length) for p in faces)
        source_schedule = sorted((p['areaM2'], p['perimeterM']) for p in result['faces'])
        for native, actual in zip(native_schedule, source_schedule):
            assert all(math.isclose(a, b, rel_tol=0, abs_tol=1e-6) for a, b in zip(native, actual)), case['name']
    else:
        assert result['totalAreaM2'] is None and result['networkLengthM'] is None, case['name']
        assert all(p['areaM2'] is None and p['perimeterM'] is None for p in result['faces'])
    # Independently validate each reported face geometry against the native result.
    source_faces = [Polygon([(p['easting'],p['northing']) for p in face['rings'][0]], [[(p['easting'],p['northing']) for p in ring] for ring in face['rings'][1:]]) for face in result['faces']]
    assert all(any(p.equals(q) for q in faces) for p in source_faces), case['name']
    checks.append({'name':case['name'], 'passed':True, 'nativeFaceCount':len(faces), 'nativeArea':area, 'nativeNetworkLength':length, 'nativeUnenclosedEdges':remainder, 'metricAvailable':metric, 'sourceStatus':result['status']})

report = {'synthetic':True, 'shapelyVersion':shapely.__version__, 'geosVersion':shapely.geos_version_string, 'comparisonTolerance':1e-6, 'checks':checks, 'passed':len(checks), 'evidenceScope':'actual source engine versus native geometry; not browser-worker, production or field proof'}
(root / 'test-results/cad-topology/native-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
