"""Independent scalar-parabola and tangent check using standard-library Decimal."""
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'vertical-scalar-integrity'
receipt = folder / 'decimal-check.json'
receipt.write_text(json.dumps({'status': 'running'}))
try:
    probe = json.loads((folder / 'source-probe.json').read_text())
    assert probe['status'] == 'passed' and probe['sourcePreserved'] and probe['databaseCalls'] == 0
    for path, digest in probe['source'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
    counts = []
    for fixture in probe['fixtures']:
        with localcontext() as context:
            context.prec = 80
            data, result = fixture['input'], fixture['result']
            number = lambda value: Decimal(str(value))
            station, level, g1, g2, length = [number(data[key]) for key in ('pvIChainage', 'pvIElevation', 'gradeIn', 'gradeOut', 'length')]
            bvc, evc = station - length / 2, station + length / 2
            start, end = level - g1 * length / 200, level + g2 * length / 200
            delta = g2 - g1
            def close(actual, expected):
                assert abs(number(actual) - expected) <= max(Decimal('1e-10'), abs(expected) * Decimal('5e-14')), (fixture['name'], actual, expected)
            for key, expected in [('pvcChainage', bvc), ('pvtChainage', evc), ('pvcElevation', start), ('pvtElevation', end)]:
                close(result[key], expected)
            assert result['contractVersion'] == 2 and result['standardCompliance'] == 'NOT_ASSESSED'
            assert result['verticalDatumStatus'] == 'NOT_VERIFIED'
            assert result['units'] == {'station': 'm', 'elevation': 'm', 'grade': 'percent'}
            if delta:
                close(result['kValue'], length / abs(delta))
                x_peak = -g1 * length / delta
                if 0 < x_peak < length:
                    close(result['highLowPoint']['chainage'], bvc + x_peak)
                    close(result['highLowPoint']['elevation'], start + g1 * x_peak / 100 + delta * x_peak * x_peak / (200 * length))
                else:
                    assert 'highLowPoint' not in result
            else:
                assert result['kValue'] is None and 'highLowPoint' not in result
            for row in fixture['samples']:
                query = number(row['chainage'])
                x = query - bvc
                if query < bvc:
                    expected_level, expected_grade = start + g1 * x / 100, g1
                elif query > evc:
                    expected_level, expected_grade = end + g2 * (query - evc) / 100, g2
                else:
                    expected_level = start + g1 * x / 100 + delta * x * x / (200 * length)
                    expected_grade = g1 + delta * x / length
                close(row['elevation'], expected_level)
                close(row['grade'], expected_grade)
            counts.append({'name': fixture['name'], 'samples': len(fixture['samples'])})
    assert len(probe['refusals']) == 8 and len(probe['controls']) == 3
    result = {'status': 'passed', 'profiles': counts, 'samples': sum(item['samples'] for item in counts), 'refusals': 8, 'controls': 3}
    receipt.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception as error:
    receipt.write_text(json.dumps({'status': 'failed', 'error': repr(error)}))
    raise
