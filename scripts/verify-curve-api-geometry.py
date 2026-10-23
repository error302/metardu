"""Independently verify actual source-handler JSON using Decimal and heading integration.

Pure standard library: no package install, account, network or database access.
Numerical comparison limits below are not survey or design acceptance tolerances.
"""
from decimal import Decimal, localcontext
import hashlib
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = root / '.cache' / 'curve-api-integrity'
receipt = output / 'independent-reader.json'
receipt.write_text(json.dumps({'status': 'running'}))
source = output / 'source-handler.json'
report = json.loads(source.read_text(encoding='utf-8'))
assert report['status'] == 'passed' and report['sourcePreserved']
for path, digest in report['source'].items():
    assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path

counts = {'verticalProfiles': 0, 'verticalSamples': 0, 'transitionAlignments': 0, 'transitionStations': 0, 'refusals': 0}


def close(actual, expected, label):
    assert isinstance(actual, (int, float)) and not isinstance(actual, bool), label
    assert math.isfinite(actual) and math.isclose(actual, float(expected), rel_tol=1e-12, abs_tol=1e-8), (label, actual, expected)


def integrate(function, start, end):
    if end == start:
        return 0.0
    n = 2048
    h = (end - start) / n
    return h / 3 * sum((1 if i in (0, n) else 4 if i % 2 else 2) * function(start + i * h) for i in range(n + 1))


for case in report['cases']:
    body = case['body']
    if case['status'] != 200:
        assert case['status'] in (400, 401) and 'geometry' not in body
        counts['refusals'] += 1
        continue
    if case['name'] == 'horizontal-control':
        close(body['chainage_TC'], 442.2649730810374, 'horizontal TC control')
        close(body['chainage_CT'], 546.9847282006972, 'horizontal CT control')
        continue
    assert body['contractVersion'] == 2 and body['standardCompliance'] == 'NOT_ASSESSED'
    assert body['assessmentBasis'] == 'geometry-only' and case['cache'] == 'private, no-store'
    data, geometry = case['input'], body['geometry']
    if body['curveType'] == 'vertical':
        counts['verticalProfiles'] += 1
        assert body['reference']['verticalDatum'] is None
        with localcontext() as context:
            context.prec = 50
            number = lambda key: Decimal(str(data[key]))
            g1, g2, station, level = map(number, ('g1', 'g2', 'vpiChainage', 'vpiRL'))
            delta = g2 - g1
            length = number('curveLength') if 'curveLength' in data else number('kValue') * abs(delta)
            bvc, evc = station - length / 2, station + length / 2
            start_level = level - g1 * length / 200
            close(geometry['L'], length, 'vertical length')
            close(geometry['bvcChainage'], bvc, 'BVC')
            close(geometry['evcChainage'], evc, 'EVC')
            close(geometry['bvcRL'], start_level, 'BVC level')
            close(geometry['evcRL'], level + g2 * length / 200, 'EVC level')
            if delta:
                close(geometry['K'], length / abs(delta), 'K in m/percent')
            else:
                assert geometry['K'] is None and geometry['rlPeak'] is None
            for row in geometry['rows'] + geometry['profileRows']:
                x = Decimal(str(row['chainage'])) - bvc
                expected = start_level + g1 * x / 100 + delta * x * x / (200 * length)
                close(row['x'], x, 'vertical horizontal distance')
                close(row['rl'], expected, 'independent parabola level')
                close(row['grade'], g1 + delta * x / length, 'independent grade')
                counts['verticalSamples'] += 1
            close(geometry['rows'][0]['chainage'], bvc, 'first row BVC')
            close(geometry['rows'][-1]['chainage'], evc, 'last row EVC')
            if delta:
                point = -g1 * length / delta
                if 0 <= point <= length:
                    close(geometry['chainagePeak'], bvc + point, 'stationary station')
                    close(geometry['rlPeak'], start_level + g1 * point / 100 + delta * point * point / (200 * length), 'stationary level')
                else:
                    assert geometry['chainagePeak'] is None and geometry['rlPeak'] is None
    else:
        counts['transitionAlignments'] += 1
        assert body['reference']['kind'] == 'local' and body['reference']['horizontalCrs'] is None
        r, ls, angle = data['radius'], data['spiralLength'], math.radians(abs(data['intersectionAngleDeg']))
        turn = 1 if data['intersectionAngleDeg'] > 0 else -1
        circular = r * angle - ls
        total = 2 * ls + circular

        def heading(distance):
            if ls == 0:
                return distance / r
            if distance <= ls:
                return distance * distance / (2 * r * ls)
            if distance <= total - ls:
                return ls / (2 * r) + (distance - ls) / r
            return angle - (total - distance) ** 2 / (2 * r * ls)

        entry_x = integrate(lambda s: math.cos(heading(s)), 0, ls)
        entry_y = integrate(lambda s: math.sin(heading(s)), 0, ls)
        p = entry_y - r * (1 - math.cos(ls / (2 * r)))
        k = entry_x - r * math.sin(ls / (2 * r))
        tangent = k + (r + p) * math.tan(angle / 2)
        ts = data['piChainage'] - tangent
        for key, expected in {'p': p, 'k': k, 'T': tangent, 'Lc': circular, 'totalLength': total,
                              'tsChainage': ts, 'scChainage': ts + ls, 'csChainage': ts + ls + circular, 'stChainage': ts + total}.items():
            close(geometry[key], expected, f'transition {key}')
        distances = [row['distanceFromTS'] for row in body['stations']]
        assert all(b > a for a, b in zip(distances, distances[1:]))
        for junction in (0, ls, ls + circular, total):
            assert any(abs(distance - junction) < 1e-8 for distance in distances), junction
        for row in body['stations']:
            assert 'easting' not in row and 'northing' not in row and 'tangentBearingDeg' not in row
            d = row['distanceFromTS']
            bounds = sorted(set((0, min(d, ls), min(d, total - ls), d)))
            x = sum(integrate(lambda s: math.cos(heading(s)), a, b) for a, b in zip(bounds, bounds[1:]))
            y = turn * sum(integrate(lambda s: math.sin(heading(s)), a, b) for a, b in zip(bounds, bounds[1:]))
            close(row['x'], x, 'integrated clothoid/circle X')
            close(row['y'], y, 'integrated clothoid/circle Y')
            close(row['chainage'], ts + d, 'arc station')
            close(row['tangentDeflectionDeg'], turn * math.degrees(heading(d)), 'signed tangent direction')
            counts['transitionStations'] += 1

assert counts['verticalProfiles'] == 6 and counts['transitionAlignments'] == 4 and counts['refusals'] == 11
receipt.write_text(json.dumps({'status': 'passed', 'counts': counts,
    'sourceHandlerReceiptHash': hashlib.sha256(source.read_bytes()).hexdigest(),
    'readerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'scope': 'independent numerical source-fixture check; not production, authentication or field proof'}, indent=2))
print(json.dumps({'status': 'passed', **counts}))
