"""Independent ezdxf/GEOS/PROJ checks of actual synthetic scheme-handler files."""
from pathlib import Path
import hashlib, json, math, sys

sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf
import pyproj
from shapely.geometry import Polygon

root=Path('.cache/scheme-boundary-export')
native=json.loads((root/'native.json').read_text(encoding='utf-8'))
assert native['status']=='passed'
assert native['ownedFixtureRemoved'] and native['ownedExportFilesRemoved']
assert native['originalRecordsPreserved'] and native['migrationLedgerPreserved'] and native['sourcePreserved']
sha=lambda value:hashlib.sha256(value).hexdigest()
results=[]

def inspect_dxf(filename,manifest_name,count):
    file=root/filename
    manifest=json.loads((root/manifest_name).read_text(encoding='utf-8'))
    source=manifest['source']
    assert source['crs']=='EPSG:32737' and len(source['features'])==count
    assert manifest['dimensions']==2 and manifest['heights']=='not provided'
    assert not manifest['professionalApproval'] and not manifest['fieldVerified']
    doc=ezdxf.readfile(file)
    audit=doc.audit()
    assert not audit.errors, [str(error) for error in audit.errors]
    assert not audit.fixes, [str(fix) for fix in audit.fixes]
    assert doc.header['$INSUNITS']==6
    entities=list(doc.modelspace())
    assert len(entities)==count and all(entity.dxftype()=='LWPOLYLINE' for entity in entities)
    parcels={item['id']:item for item in source['features']}
    origins=set()
    for entity in entities:
        assert entity.closed and entity.dxf.elevation==0
        mapping=manifest['layers'][entity.dxf.layer]
        assert mapping['role']=='outer' and mapping['ring']==0
        expected=parcels[mapping['parcelId']]['geometry']['coordinates'][0][:-1]
        actual=list(entity.get_points('xy'))
        assert len(actual)==len(expected)==4
        assert all(math.isfinite(value) for point in actual for value in point)
        assert all(abs(a-b)<1e-9 for point,reference in zip(actual,expected) for a,b in zip(point,reference))
        assert all(point[2]==0 and point[3]==0 and point[4]==0 for point in entity.get_points('xyseb'))
        shape=Polygon(actual)
        assert shape.is_valid and abs(shape.area-200)<1e-9 and abs(shape.length-60)<1e-9
        assert shape.bounds[1]==9500000 and shape.bounds[3]==9500020
        assert shape.bounds[2]-shape.bounds[0]==10
        origins.add(shape.bounds[0])
    assert origins=={500000+i*30 for i in range(count)}
    assert b'NO OBSERVED HEIGHTS' in file.read_bytes()
    if count==1:assert sha(file.read_bytes())==native['dxfArtifact']['sha256']
    else:assert file.stat().st_size==native['exportProfile']['artifactBytes']
    results.append({'file':filename,'sha256':sha(file.read_bytes()),'closed2dOutlines':count,'gridAreaSqMPerParcel':200,'gridPerimeterMPerParcel':60,'auditErrors':0,'auditRepairs':0})

inspect_dxf('selected.dxf','dxf-source.json',1)
inspect_dxf('selected50.dxf','dxf50-source.json',50)

geo_file=root/'selected.geojson'
manifest=json.loads((root/'geojson-source.json').read_text(encoding='utf-8'))
geo=json.loads(geo_file.read_text(encoding='utf-8'))
assert sha(geo_file.read_bytes())==native['geojsonArtifact']['sha256']
assert 'crs' not in geo and geo['type']=='FeatureCollection'
assert geo['metardu']['dimensions']==2 and geo['metardu']['heights']=='not provided'
assert not geo['metardu']['professionalApproval'] and not geo['metardu']['fieldVerified']
assert geo['metardu']['sourceHash']==manifest['sourceHash']
source=manifest['source']['features'][0]
assert source['geometry']['coordinates'][0]==[[500000,9500000],[500010,9500000],[500010,9500020],[500000,9500020],[500000,9500000]]
actual=geo['features'][0]
assert len(geo['features'])==1 and actual['id']==source['id']
assert actual['geometry']['type']=='Polygon' and len(actual['geometry']['coordinates'])==1
ring=actual['geometry']['coordinates'][0]
assert len(ring)==5 and all(len(point)==2 for point in ring) and ring[0]==ring[-1]
assert Polygon(ring).is_valid and Polygon(ring).exterior.is_ccw
assert abs(ring[0][0]-39)<1e-10 and ring[0][1]<0
transform=pyproj.Transformer.from_crs('EPSG:32737','EPSG:4326',always_xy=True)
expected=[transform.transform(x,y) for x,y in source['geometry']['coordinates'][0]]
assert all(abs(a-b)<1e-8 for point,reference in zip(ring,expected) for a,b in zip(point,reference))
assert manifest['transformation']['engine']=='proj4' and not manifest['transformation']['independentlyVerified']
results.append({'file':'selected.geojson','sha256':sha(geo_file.read_bytes()),'geographic2dPolygons':1,'axisOrder':'longitude,latitude','independentProjComparisonToleranceDegrees':1e-8})
report={'status':'passed','synthetic':True,'nativeCheckedAt':native['checkedAt'],'nativeReceiptSha256':sha((root/'native.json').read_bytes()),'ezdxf':ezdxf.__version__,'pyproj':pyproj.__version__,'artifacts':results,'receivingCadApplicationVerified':False,'fieldVerified':False}
(root/'independent-artifacts.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
