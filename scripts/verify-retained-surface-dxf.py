"""Independent parser and analytical-plane check of the native source-route DXF."""
from pathlib import Path
import hashlib, json, sys
sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf

assert len(sys.argv) == 1 or sys.argv[1:] == ['--recovery']
root = Path('.cache/surface-request-recovery' if len(sys.argv) == 2 else '.cache/surface-revisions')
receipt = json.loads((root / 'green.json').read_text(encoding='utf-8'))
artifact = receipt['exportArtifact']
file = Path(artifact['path'])
assert receipt['status'] == 'passed' and file.resolve() == (root / 'retained-r1.dxf').resolve()
assert hashlib.sha256(file.read_bytes()).hexdigest() == artifact['hash']
doc = ezdxf.readfile(file)
audit = doc.audit()
assert not audit.errors and not audit.fixes
assert doc.units == 6
model = doc.modelspace()
expected = {(500000,9850000,-2),(500020,9850000,0),(500020,9850020,2),(500000,9850020,0),(500010,9850010,0)}
points = list(model.query('POINT'))
assert len(points) == 5 and {tuple(point.dxf.location) for point in points} == expected
ends = {-1:{(500000,9850010),(500010,9850000)},0:{(500000,9850020),(500020,9850000)},1:{(500010,9850020),(500020,9850010)}}
contours = [line for line in model.query('LWPOLYLINE') if line.dxf.layer in ['CONTOURS','CONTOUR_I']]
assert len(contours) == 3 and {line.dxf.elevation for line in contours} == set(ends)
for line in contours:
    vertices = list(line.get_points())
    assert not line.closed and {(vertices[0][0],vertices[0][1]),(vertices[-1][0],vertices[-1][1])} == ends[line.dxf.elevation]
    for e,n,*_ in vertices:
        assert abs(line.dxf.elevation - (-2 + .1*(e-500000) + .1*(n-9850000))) < 1e-8
texts = [item.dxf.text for item in model.query('TEXT')]
for required in ['EPSG:21037','Synthetic BM','DRAFT','Surface R1',artifact['sourceRevision']]:
    assert any(required in value for value in texts), required
result = {'status':'passed','source':'native source route; adapted plan/session wrapper', 'sha256':artifact['hash'], 'measuredOriginalXYZ':5,'openContoursWithCorrectElevationAndEndpoints':3,'auditErrors':0,'auditRepairs':0,'receivingCadProof':False,'browserProof':False,'fieldProof':False,'productionProof':False}
(root / 'independent-dxf.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
