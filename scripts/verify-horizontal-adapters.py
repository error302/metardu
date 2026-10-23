"""Independent 80-digit trigonometric checks of actual scalar and set-out outputs."""
from decimal import Decimal, ROUND_FLOOR, localcontext
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'horizontal-adapter-integrity'
receipt = folder / 'decimal-check.json'
receipt.write_text(json.dumps({'status': 'running'}))
try:
    probe = json.loads((folder / 'source-probe.json').read_text())
    assert probe['status'] == 'passed' and probe['sourcePreserved'] and probe['databaseCalls'] == 0
    for path, digest in probe['source'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
    results = []
    with localcontext() as context:
        context.prec = 80
        pi = Decimal('3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986')
        number = lambda value: Decimal(str(value))
        def sin(value):
            term = total = value
            for index in range(1, 100):
                term *= -value * value / ((2 * index) * (2 * index + 1))
                total += term
                if abs(term) < Decimal('1e-78'):
                    return total
            raise AssertionError('Sine failed to converge')
        def cos(value):
            term = total = Decimal(1)
            for index in range(1, 100):
                term *= -value * value / ((2 * index - 1) * (2 * index))
                total += term
                if abs(term) < Decimal('1e-78'):
                    return total
            raise AssertionError('Cosine failed to converge')
        def close(actual, expected, floor=Decimal('1e-10')):
            assert abs(number(actual) - expected) <= max(floor, abs(expected) * Decimal('5e-13')), (actual, expected)
        for fixture in probe['fixtures']:
            data, scalar, legacy = fixture['input'], fixture['scalar'], fixture['legacy']
            radius, angle, station = [number(data[key]) for key in ('radius', 'delta', 'piChainage')]
            theta = angle * pi / 180
            tangent = radius * sin(theta / 2) / cos(theta / 2)
            length = radius * theta
            chord = 2 * radius * sin(theta / 2)
            mid = radius * (1 - cos(theta / 2))
            external = radius * (1 / cos(theta / 2) - 1)
            pc, pt = station - tangent, station - tangent + length
            # CC can be near zero after cancellation of large T and L/2.
            # Bound station roundoff by operand scale, not only the small result.
            station_floor = max(Decimal('1e-10'), max(abs(station), abs(tangent), length) * Decimal('8e-15'))
            for key, expected in [('tangentLength', tangent), ('curveLength', length), ('longChord', chord),
                                  ('midOrdinate', mid), ('externalDistance', external)]:
                close(scalar[key], expected, Decimal('1e-24'))
                close(legacy[key], expected, Decimal('1e-24'))
                assert number(scalar[key]) > 0
            close(scalar['pcChainage'], pc, station_floor); close(scalar['ptChainage'], pt, station_floor)
            close(legacy['chainage_TC'], pc, station_floor); close(legacy['chainage_CT'], pt, station_floor); close(legacy['chainage_CC'], pc + length / 2, station_floor)
            assert scalar['contractVersion'] == 2 and scalar['standardCompliance'] == 'NOT_ASSESSED'
            assert scalar['coordinateReferenceStatus'] == 'NOT_VERIFIED'
            assert scalar['units'] == {'distance': 'm', 'station': 'm', 'angle': 'degrees'}
            assert legacy['standardCompliance'] == 'NOT_ASSESSED' and legacy['coordinateReferenceStatus'] == 'NOT_VERIFIED'
            interval = number(fixture['interval'])
            stations = [pc]
            peg = ((pc / interval).to_integral_value(rounding=ROUND_FLOOR) + 1) * interval
            while peg < pt:
                stations.append(peg)
                peg += interval
            stations.append(pt)
            rows = legacy['settingOutTable']
            assert len(rows) == len(stations), (fixture['name'], len(rows), len(stations))
            previous = pc
            for row, chainage in zip(rows, stations):
                close(row['chainage'], chainage, station_floor)
                offset = chainage - pc
                close(row['deflectionFromTC'], offset / radius / 2 * 180 / pi, Decimal('1e-15'))
                close(row['chordFromTC'], 2 * radius * sin(offset / radius / 2))
                close(row['chordIncrement'], 2 * radius * sin((chainage - previous) / radius / 2))
                previous = chainage
            results.append({'name': fixture['name'], 'stations': len(rows)})
    assert len(probe['refusals']) == 12 and len(probe['controls']) == 3
    result = {'status': 'passed', 'profiles': results, 'stations': sum(item['stations'] for item in results), 'refusals': 12, 'controls': 3}
    receipt.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception as error:
    receipt.write_text(json.dumps({'status': 'failed', 'error': repr(error)}))
    raise
