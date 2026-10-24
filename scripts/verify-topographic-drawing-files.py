"""Verify original browser DXF downloads against independent synthetic inputs."""
from pathlib import Path
import hashlib, json, math, sys
sys.path.insert(0, str(Path('.cache/cad-export-verifier').resolve()))
import ezdxf

root=Path('test-results/topographic-source-acceptance')
expected={(500000,9850000,-2),(500020,9850000,0),(500020,9850020,2),(500000,9850020,0),(500010,9850010,0)}
ends={-1:{(500000,9850010),(500010,9850000)},0:{(500000,9850020),(500020,9850000)},1:{(500010,9850020),(500020,9850010)}}
results={}
for name in ['drawing-measured.dxf','drawing-without-title.dxf']:
    file=root/name
    doc=ezdxf.readfile(file)
    audit=doc.audit()
    assert not audit.errors and not audit.fixes, (name, 'DXF must open without recovery or repairs')
    assert doc.dxfversion=='AC1021' and doc.units==6
    model=doc.modelspace()
    points=list(model.query('POINT'))
    assert len(points)==5 and {tuple(point.dxf.location) for point in points}==expected, 'Measured XYZ must not be flattened to a plan Z=0'
    assert {point.dxf.layer for point in points}=={'OTHER-UNKNOWN'}, 'Unmapped SPOT source codes remain unclassified'
    contours=[line for line in model.query('LWPOLYLINE') if line.dxf.layer in ['CONTOURS','CONTOUR_I']]
    assert len(contours)==3 and {line.dxf.elevation for line in contours}==set(ends)
    for line in contours:
        vertices=list(line.get_points())
        assert not line.closed and {(vertices[0][0],vertices[0][1]),(vertices[-1][0],vertices[-1][1])}==ends[line.dxf.elevation]
        for e,n,*_ in vertices:
            assert abs(line.dxf.elevation-(-2+0.1*(e-500000)+0.1*(n-9850000)))<1e-8
    grid=list(model.query('LINE[layer=="GRID"]'))
    assert grid
    for line in grid:
        for point in [line.dxf.start,line.dxf.end]:
            assert 499997<=point.x<=500023 and 9849997<=point.y<=9850023, 'No tick may escape the frame'
    texts=[item.dxf.text for item in model.query('TEXT')]
    for text in ['EPSG:21037','Synthetic local benchmark - no field evidence','DRAFT']:
        assert any(text in value for value in texts), (name,text)
    assert not any('REPUBLIC OF KENYA' in text or 'Arc 1960 / UTM Zone' in text for text in texts)
    title=list(model.query('TEXT[layer=="TITLE_BLOCK"]'))
    assert bool(title)==(name=='drawing-measured.dxf')
    results[name]={'points':len(points),'measuredXYZRetained':True,'contours':len(contours),'independentPlaneAndEndpoints':True,'boundedGridTicks':len(grid),'referenceAndDraftSurviveTitleSetting':True,'dxfAuditErrorsAndRepairs':0,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
receipt={'status':'passed','synthetic':True,'origin':'http://127.0.0.1:3021','projectId':'474f92f6-0e90-4129-83fb-d514db596876','ordinaryProFixture':True,'adminBypass':False,'providerProof':False,'productionProof':False,'receivingCadApplicationProof':False,'fieldInstrumentProof':False,'files':results}
(root/'drawing-native-verification.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt,indent=2))
