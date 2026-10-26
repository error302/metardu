"""Independent checks of the actual retained-job route artifacts, not fixtures rebuilt in Python."""
from pathlib import Path
import base64
import csv
import hashlib
import io
import json
import math
import sys

if sys.version_info[:2] != (3, 12):
    raise SystemExit('Use the existing bundled Python 3.12 artifact-verifier runtime; cached native wheels do not target the system default interpreter.')
sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf
import pyproj
from shapely.geometry import Polygon

root = Path('.cache/parcel-draft-sharing')
load = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
sha = lambda content: hashlib.sha256(content).hexdigest()
native, proof = load('native.json'), load('journey-proof.json')
assert native['status'] == proof['status'] == 'passed'
for flag in ['ownedFixtureRemoved', 'ownedExportFilesRemoved', 'originalRecordsPreserved', 'migrationLedgerPreserved', 'sourcePreserved']:
    assert native[flag] is True
for filename, digest in native['source'].items():
    assert sha(Path(filename).read_bytes()) == digest, filename
assert native['retainedJourney']['proofSha256'] == sha((root / 'journey-proof.json').read_bytes())
assert proof['synthetic'] is True
assert [stage['name'] for stage in proof['stages']] == [
    'original input committed once and recovered after lost acknowledgement',
    'explicit boundary order links the retained revision and recovers one parcel write',
    'actual DXF and geographic files recover exact registered bytes',
    'one explicit expiring grant recovers without renewal and exposes only its allowlist',
    'a later reviewed geometry refuses stale new exports while old artifacts and grant remain exact',
    'reference changes never relabel retained delivery and revocation closes recipient reads',
    'ownership transfer closes the former actor while preserving current-owner source history',
]
for name, record in proof['files'].items():
    file = root / name
    assert file.name == name and file.parent == root
    assert file.stat().st_size == record['bytes'] and sha(file.read_bytes()) == record['sha256'], name

command = load('journey-command.canonical.json')
result = load('journey-result.canonical.json')
receipt = load('journey-traverse-receipt.json')
boundary = load('journey-boundary.json')
original = (root / 'journey-original.csv').read_bytes()
assert sha(original) == receipt['sourceHash']
assert original == base64.b64decode(command['source']['bytesBase64'], validate=True)
assert sha((root / 'journey-request.json').read_bytes()) == receipt['requestHash']
assert sha((root / 'journey-command.canonical.json').read_bytes()) == receipt['inputHash']
assert sha((root / 'journey-result.canonical.json').read_bytes()) == receipt['resultHash']
assert load('journey-request.json') == command
assert receipt['status'] == boundary['status'] == 'draft_unverified'
assert result['isClosed'] is False and result['linearError'] is None and result['precisionRatio'] is None
assert len(result['coordinates']) == 4 and all('rl' not in p for p in result['coordinates'])
assert result['rawObservations'] == command['observations']
assert command['control']['openingEasting'] == '0250000.123456789'
assert command['control']['openingRL'] == '' and command['criterion'] is None
rows = list(csv.DictReader(io.StringIO(original.decode('utf-8'), newline='')))
assert len(rows) == len(command['observations']) == 3
for row, obs in zip(rows, command['observations']):
    assert [row['target'], row['face_left_deg'], row['face_right_deg'], row['slope_m'], row['zenith_deg'], row['ih_m'], row['th_m']] == [obs['station'], obs['hclDeg'], obs['hcrDeg'], obs['slopeDist'], obs['vaDeg'], obs['ih'], obs['th']]
assert [int(row['face_left_deg']) for row in rows] == [90, 270, 270]
assert [int(row['face_right_deg']) for row in rows] == [270, 90, 90]
assert all(row['zenith_deg'] == '90' and row['ih_m'] == row['th_m'] == '' for row in rows)
assert all(obs[key] == '0' for obs in command['observations'] for key in ['hclMin','hclSec','hcrMin','hcrSec','vaMin','vaSec'])

# Analytical axis-aligned rectangle, independent of the TypeScript engine.
e0, n0 = float(command['control']['openingEasting']), float(command['control']['openingNorthing'])
factor = float(command['reduction']['combinedScaleFactor'])
assert factor == 0.9996 and command['sourceCrs'] == 'EPSG:32737'
assert command['control']['backsightDegrees'] == command['control']['backsightMinutes'] == command['control']['backsightSeconds'] == '0'
width, height = float(rows[0]['slope_m']) * factor, float(rows[1]['slope_m']) * factor
expected = [[e0,n0], [e0+width,n0], [e0+width,n0-height], [e0,n0-height], [e0,n0]]
ring = boundary['polygon']['coordinates'][0]
assert len(ring) == 5
assert all(abs(a-b) <= 1e-8 for actual, target in zip(ring, expected) for a,b in zip(actual,target))
shape = Polygon(ring)
assert shape.is_valid and abs(shape.area-width*height) < 1e-6
assert abs(shape.area-boundary['gridAreaSqM']) < 1e-9
assert boundary['areaHa'] == boundary['gridAreaSqM']/10000
assert abs(shape.length-2*(width+height)) < 1e-8

manifest = load('journey-dxf-source.json')
assert manifest['source']['features'][0]['geometry'] == boundary['polygon']
assert manifest['source']['features'][0]['properties']['receiptId'] == boundary['receiptId']
doc = ezdxf.readfile(root / 'journey.dxf')
audit = doc.audit()
assert not audit.errors and not audit.fixes
assert doc.header['$INSUNITS'] == 6
entities = list(doc.modelspace())
assert len(entities) == 1 and entities[0].dxftype() == 'LWPOLYLINE'
entity = entities[0]
assert entity.closed and entity.dxf.elevation == 0
actual = list(entity.get_points('xy'))
assert len(actual) == 4 and [list(p) for p in actual] == ring[:-1]
assert all(p[2] == p[3] == p[4] == 0 for p in entity.get_points('xyseb'))
assert manifest['layers'][entity.dxf.layer]['role'] == 'outer'
assert b'NO OBSERVED HEIGHTS' in (root / 'journey.dxf').read_bytes()

geo, geo_manifest = load('journey.geojson'), load('journey-geojson-source.json')
assert geo_manifest['source'] == manifest['source']
assert 'crs' not in geo and len(geo['features']) == 1
assert geo['metardu']['sourceHash'] == manifest['sourceHash']
assert geo['metardu']['dimensions'] == 2 and geo['metardu']['heights'] == 'not provided'
assert geo['metardu']['professionalApproval'] is geo['metardu']['fieldVerified'] is False
geo_ring = geo['features'][0]['geometry']['coordinates'][0]
assert Polygon(geo_ring).is_valid and Polygon(geo_ring).exterior.is_ccw
assert geo_ring[0] == geo_ring[-1] and all(len(p) == 2 and all(math.isfinite(v) for v in p) for p in geo_ring)
transform = pyproj.Transformer.from_crs(command['sourceCrs'], 'EPSG:4326', always_xy=True)
expected_geo = [transform.transform(x,y) for x,y in ring]
if not Polygon(expected_geo).exterior.is_ccw:
    expected_geo.reverse()
assert len(geo_ring) == len(expected_geo)
assert all(abs(a-b) < 1e-8 for actual, target in zip(geo_ring,expected_geo) for a,b in zip(actual,target))
snapshot = load('journey-public-snapshot.json')
assert snapshot['parcels'][0]['coordinates'] == geo['features'][0]['geometry']['coordinates']
assert snapshot['artifactHash'] == sha((root/'journey.geojson').read_bytes())
assert snapshot['sourceHash'] == manifest['sourceHash']
assert set(snapshot['parcels'][0]) == {'label','gridAreaSqM','coordinates'}
assert snapshot['professionalApproval'] is snapshot['fieldVerified'] is False

report = {'status':'passed','synthetic':True,'nativeReceiptSha256':sha((root/'native.json').read_bytes()),'journeyProofSha256':sha((root/'journey-proof.json').read_bytes()),'sourceInputHash':receipt['inputHash'],'sourceResultHash':receipt['resultHash'],'originalFileHash':receipt['sourceHash'],'dxfHash':sha((root/'journey.dxf').read_bytes()),'geojsonHash':sha((root/'journey.geojson').read_bytes()),'analyticalAreaToleranceSqM':1e-6,'coordinateToleranceM':1e-8,'geographicProjComparisonToleranceDegrees':1e-8,'ezdxf':ezdxf.__version__,'pyproj':pyproj.__version__,'auditErrors':0,'auditRepairs':0,'receivingCadApplicationVerified':False,'ordinaryAccountHttpVerified':False,'fieldVerified':False}
(root/'journey-independent.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
