"""Read actual source-generated drafts with independent ezdxf, using fixed synthetic expectations."""
import hashlib
import json
import math
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / '.cache' / 'road-quick-compute'
os.environ['XDG_CACHE_HOME'] = str(output / 'cad-cache')
sys.path.insert(0, str(root / '.cache' / 'cad-export-verifier'))
import ezdxf

manifest = json.loads((output / 'dxf-fixtures.json').read_text())
checks = []
(output / 'cad-reader.json').write_text(json.dumps({'status': 'running'}))
if len(sys.argv) > 1:
    assert sys.argv[1:] == ['--browser'], 'Use only the fixed --browser fixture extension.'
    for name in ('browser-left.dxf', 'browser-bank-fail.dxf'):
        manifest['files'][name] = hashlib.sha256((output / name).read_bytes()).hexdigest()


def check(name, value):
    assert value, name
    checks.append(name)


for path, digest in manifest['source'].items():
    check(f'unchanged source: {path}', hashlib.sha256((root / path).read_bytes()).hexdigest() == digest)

for name, digest in manifest['files'].items():
    file = output / name
    check(f'fixture hash: {name}', hashlib.sha256(file.read_bytes()).hexdigest() == digest)
    doc = ezdxf.readfile(file)
    audit = doc.audit()
    check(f'CAD audit without repairs: {name}', not audit.errors and not audit.fixes)
    check(f'metre units: {name}', doc.header['$INSUNITS'] == 6)
    model = doc.modelspace()
    notes = ' '.join(entity.dxf.text for entity in model.query('TEXT'))
    check(f'explicit local draft: {name}', 'DRAFT' in notes and 'no CRS' in notes and
          ('NOT_ASSESSED' in notes or 'NOT ASSESSED' in notes))
    if name.endswith('left.dxf') or name == 'right.dxf':
        sign = -1 if name == 'right.dxf' else 1
        arcs = list(model.query('ARC'))
        check(f'one true arc: {name}', len(arcs) == 1)
        arc = arcs[0]
        check(f'full radius: {name}', arc.dxf.radius == 100)
        check(f'full arc length: {name}', math.isclose(arc.dxf.radius * math.radians((arc.dxf.end_angle - arc.dxf.start_angle) % 360), 104.71975511966, abs_tol=1e-9))
        ends = [arc.start_point, arc.end_point]
        tc = ends[0] if sign == 1 else ends[1]
        ct = ends[1] if sign == 1 else ends[0]
        check(f'TC at origin: {name}', tc.isclose((0, 0, 0), abs_tol=1e-10))
        check(f'CT full-size position: {name}', ct.isclose((86.60254037844, sign * 50, 0), abs_tol=1e-9))
        pegs = [p.dxf.location for p in model.query('POINT')]
        check(f'all seven pegs: {name}', len(pegs) == 7 and pegs[0].isclose(tc, abs_tol=1e-9) and pegs[-1].isclose(ct, abs_tol=1e-9))
        check(f'successive 20m arc chord: {name}', math.isclose(pegs[1].distance(pegs[2]), 19.9666833293656, abs_tol=1e-9))
        for tangent in model.query('LINE[layer=="TANGENTS"]'):
            point = tangent.dxf.start if tangent.dxf.start.isclose(tc, abs_tol=1e-9) else tangent.dxf.end
            check(f'tangent perpendicular: {name}', math.isclose((point - arc.dxf.center).dot(tangent.dxf.end - tangent.dxf.start), 0, abs_tol=1e-9))
    else:
        section = list(model.query('LINE[layer=="GEOMETRY"]'))
        rise = 0.35 if name.endswith('bank-fail.dxf') else 0.21
        check(f'actual width and provided rise: {name}', len(section) == 1 and section[0].dxf.start.isclose((0, 0, 0)) and section[0].dxf.end.isclose((3.5, rise, 0)))
        verdict = 'FAIL' if name.endswith('bank-fail.dxf') else 'PASS'
        check(f'criteria verdict retained: {name}', f'Banking checks={verdict}; standard compliance=NOT_ASSESSED' in notes)
        check(f'criteria provenance: {name}', 'Synthetic criteria rev 1' in notes and 'Side friction=0.14; maximum e=8%; relative gradient=0.5%' in notes)

(output / 'cad-reader.json').write_text(json.dumps({'status': 'passed', 'reader': f'ezdxf {ezdxf.__version__}',
    'files': manifest['files'], 'source': manifest['source'],
    'readerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'checks': checks}, indent=2))
print(json.dumps({'status': 'passed', 'checks': len(checks), 'reader': ezdxf.__version__}))
