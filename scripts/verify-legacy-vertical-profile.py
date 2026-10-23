"""Independently verify native BVC-anchored output using standard-library Decimal.

No imports from application code and no account, database or network access.
"""
from decimal import Decimal, ROUND_FLOOR, localcontext
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'legacy-vertical-profile'
receipt = folder / 'decimal-check.json'
receipt.write_text(json.dumps({'status': 'running'}))
try:
    probe = json.loads((folder / 'source-probe.json').read_text())
    assert probe['status'] == 'passed' and probe['sourcePreserved']
    for path, digest in probe['source'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
    results = []
    for fixture in probe['fixtures']:
        with localcontext() as context:
            context.prec = 60
            data = list(map(lambda value: Decimal(str(value)), fixture['input']))
            g1, g2, length, start = data[:4]
            interval = data[4] if len(data) == 5 else Decimal(10)
            delta = g2 - g1
            stations = [Decimal(0), length]
            count = int((length / interval).to_integral_value(rounding=ROUND_FLOOR))
            stations.extend(interval * index for index in range(1, count + 1) if interval * index < length)
            if delta:
                stationary = -g1 * length / delta
                if 0 <= stationary <= length:
                    stations.append(stationary)
            stations = sorted(set(stations))
            rows = fixture['rows']
            assert len(stations) == len(rows), (fixture['name'], 'station count')
            assert Decimal(str(rows[0]['rl'])) == start, (fixture['name'], 'exact anchor')
            for row, station in zip(rows, stations):
                actual_station = Decimal(str(row['chainage']))
                assert abs(actual_station - station) < Decimal('1e-9')
                offset = delta * station * station / (200 * length)
                level = start + g1 * station / 100 + offset
                assert abs(Decimal(str(row['cutFill'])) - offset) < Decimal('1e-10'), (fixture['name'], row)
                tolerance = max(Decimal('1e-10'), abs(level) * Decimal('2e-15'))
                assert abs(Decimal(str(row['rl'])) - level) <= tolerance, (fixture['name'], row, level)
            results.append({'name': fixture['name'], 'stations': len(rows)})
    assert len(probe['refusals']) == 11
    result = {'status': 'passed', 'fixtures': results, 'stations': sum(item['stations'] for item in results), 'refusals': len(probe['refusals'])}
    receipt.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception as error:
    receipt.write_text(json.dumps({'status': 'failed', 'error': repr(error)}))
    raise
