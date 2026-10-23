"""Independent Decimal check of actual legacy-adapter geometry and evidence states."""
from decimal import Decimal, ROUND_FLOOR, localcontext
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'vpi-vertical-adapters'
receipt = folder / 'decimal-check.json'
receipt.write_text(json.dumps({'status': 'running'}))
try:
    probe = json.loads((folder / 'source-probe.json').read_text())
    assert probe['status'] == 'passed' and probe['sourcePreserved'] and probe['persistenceClientUnloaded']
    for path, digest in probe['source'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
    results = []
    for fixture in probe['fixtures']:
        with localcontext() as context:
            context.prec = 60
            data = fixture['input']
            number = lambda key: Decimal(str(data[key]))
            g1, g2, length, station, level = map(number, ('g1', 'g2', 'L', 'chainage_VIP', 'elevation_VIP'))
            interval = number('interval') if 'interval' in data else Decimal(20)
            delta = g2 - g1
            bvc, evc = station - length / 2, station + length / 2
            stations = [bvc, evc]
            peg = ((bvc / interval).to_integral_value(rounding=ROUND_FLOOR) + 1) * interval
            while peg < evc:
                stations.append(peg)
                peg += interval
            if delta:
                x_peak = -g1 * length / delta
                if 0 <= x_peak <= length:
                    stations.append(bvc + x_peak)
            stations = sorted(set(stations))
            for adapter in ('computed', 'curved'):
                result = fixture[adapter]
                assert result['standardCompliance'] == 'NOT_ASSESSED'
                assert result['verticalDatumStatus'] == 'NOT_VERIFIED'
                assert result['curveType'] == ('straight' if not delta else 'crest' if delta < 0 else 'sag')
                if not delta:
                    assert result['kValue'] is None
                else:
                    assert abs(Decimal(str(result['kValue'])) - length / abs(delta)) <= max(Decimal('1e-9'), abs(length / delta) * Decimal('1e-9'))
                assert Decimal(str(result['chainage_VPC'])) == bvc
                assert Decimal(str(result['chainage_VPT'])) == evc
                rows = result['elevationTable']
                assert len(rows) == len(stations), (fixture['name'], adapter, 'station count')
                for row, expected_station in zip(rows, stations):
                    assert abs(Decimal(str(row['chainage'])) - expected_station) < Decimal('1e-9')
                    x = expected_station - bvc
                    offset = delta * x * x / (200 * length)
                    rl = level - g1 * length / 200 + g1 * x / 100 + offset
                    grade = g1 + delta * x / length
                    for key, expected in [('elevation', rl), ('grade', grade), ('tangentOffset', offset)]:
                        assert abs(Decimal(str(row[key])) - expected) < Decimal('1e-10'), (fixture['name'], adapter, key, row, expected)
                    if adapter == 'computed':
                        assert row['cutFill'] is None
                if adapter == 'computed':
                    assert result['sightDistance'] is None and result['sightDistanceStatus'] == 'NOT_ASSESSED'
            results.append({'name': fixture['name'], 'stations_per_adapter': len(stations)})
    assert len(probe['refusals']) == 21
    result = {'status': 'passed', 'profiles': results, 'stations': sum(item['stations_per_adapter'] * 2 for item in results), 'refusals': len(probe['refusals'])}
    receipt.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception as error:
    receipt.write_text(json.dumps({'status': 'failed', 'error': repr(error)}))
    raise
