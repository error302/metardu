"""Independent GEOS/ezdxf checks against the fixed synthetic plane and footprint."""
from pathlib import Path
import hashlib, json, math, sys
sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

root=Path('.cache/terrain-domain')
receipt=json.loads((root/'green.json').read_text(encoding='utf-8'))
assert receipt['status']=='passed' and len(receipt['checks'])==52
artifact=receipt['maskedArtifact']
file=root/'masked-r1.dxf'
assert Path(artifact['path']).resolve()==file.resolve()
assert hashlib.sha256(file.read_bytes()).hexdigest()==artifact['sha256']
model=json.loads((root/'masked-model.json').read_text(encoding='utf-8'))
outer=[(500002,9850002),(500018,9850002),(500018,9850018),(500002,9850018)]
hole=[(500008,9850008),(500012,9850008),(500012,9850012),(500008,9850012)]
footprint=Polygon(outer,[hole]);assert footprint.is_valid and footprint.area==240
mesh=model['mesh'];points=mesh['points'];faces=[];volume=0
for triangle in mesh['triangles']:
    vertices=[points[triangle[key]] for key in ['a','b','c']]
    polygon=Polygon([(point['x'],point['y']) for point in vertices])
    assert polygon.is_valid and polygon.area>0 and footprint.buffer(1e-8).covers(polygon)
    faces.append(polygon)
    volume+=polygon.area*(sum(point['z'] for point in vertices)/3+2)
    for point in vertices:
        assert abs(point['z']-(-2+.1*(point['x']-500000)+.1*(point['y']-9850000)))<1e-8
coverage=unary_union(faces)
assert coverage.symmetric_difference(footprint).area<1e-7
assert abs(sum(face.area for face in faces)-coverage.area)<1e-7
assert abs(volume-480)<1e-7
assert mesh['heightBasis']=='retained_parent_tin_faces'
assert model['domain']['derivedVertexCount']==sum(origin['kind']=='derived_clip_vertex' for origin in mesh['vertexOrigins'])>0

doc=ezdxf.readfile(file);audit=doc.audit();assert not audit.errors and not audit.fixes
assert doc.units==6
space=doc.modelspace()
expected={(500000,9850000,-2),(500020,9850000,0),(500020,9850020,2),(500000,9850020,0),(500010,9850010,0)}
source_points=list(space.query('POINT'));assert len(source_points)==5 and {tuple(point.dxf.location) for point in source_points}==expected
boundary=list(space.query('LWPOLYLINE[layer=="TERRAIN_BOUNDARY"]'))
exclusions=list(space.query('LWPOLYLINE[layer=="TERRAIN_EXCLUSIONS"]'))
assert len(boundary)==1 and len(exclusions)==1
assert boundary[0].closed and exclusions[0].closed
assert {(x,y) for x,y,*_ in boundary[0].get_points()}==set(outer)
assert {(x,y) for x,y,*_ in exclusions[0].get_points()}==set(hole)
chains=list(space.query('POLYLINE[layer=="SURVEY_BREAKLINES_3D"]'))
assert len(chains)==1 and chains[0].is_3d_polyline
assert [tuple(vertex.dxf.location) for vertex in chains[0].vertices]==[(500000,9850000,-2),(500010,9850010,0),(500020,9850020,2)]
contours=[line for line in space.query('LWPOLYLINE') if line.dxf.layer in ['CONTOURS','CONTOUR_I']]
assert len(contours)==4
for contour in contours:
    xy=[(x,y) for x,y,*_ in contour.get_points()]
    assert not contour.closed and footprint.buffer(1e-8).covers(LineString(xy))
    for x,y in xy:assert abs(contour.dxf.elevation-(-2+.1*(x-500000)+.1*(y-9850000)))<1e-8
zero=[line for line in contours if line.dxf.elevation==0]
assert len(zero)==2
ends={tuple(line.get_points()[0][:2]) for line in zero}|{tuple(line.get_points()[-1][:2]) for line in zero}
assert ends=={(500002,9850018),(500008,9850012),(500012,9850008),(500018,9850002)}
texts=[entity.dxf.text for entity in space.query('TEXT')]
assert any('DRAFT' in text for text in texts) and any('derived clip vertices' in text for text in texts)
result={'status':'passed','synthetic':True,'sha256':artifact['sha256'],'independentEngine':'GEOS via Shapely; ezdxf',
    'coverageM2':coverage.area,'planeIntegralM3':volume,'originalMeasuredXYZ':5,'derivedClipVertices':model['domain']['derivedVertexCount'],
    'contourPaths':len(contours),'zeroContourSplitAtExclusion':True,'boundaryAndExclusionRings':2,'retained3dSourceChains':1,
    'auditErrors':0,'auditRepairs':0,'positivePlanDecisionAdapted':True,'receivingCadProof':False,'fieldProof':False,'productionProof':False}
(root/'independent-artifact.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
