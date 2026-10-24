"""Independent Decimal checks of actual road export findings and evidence states."""
from decimal import Decimal, localcontext
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
folder = root / '.cache' / 'road-export-gate'
receipt = folder / 'decimal-check.json'
receipt.write_text(json.dumps({'status': 'running'}))
try:
    probe = json.loads((folder / 'source-probe.json').read_text())
    assert probe['status'] == 'passed' and probe['sourcePreserved'] and probe['persistenceClientUnloaded']
    for path, digest in probe['source'].items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest, path
    comparisons = unassessed = 0
    with localcontext() as context:
        context.prec = 60
        number = lambda value: Decimal(str(value))
        for fixture in probe['fixtures']:
            data = fixture.get('engineering')
            for row in fixture['result']['violations']:
                if not row.get('field', '').startswith('engineering'):
                    continue
                assert row['source'] == 'metardu_qc' and row['standardCompliance'] == 'NOT_ASSESSED'
                if row['assessment'] == 'UNASSESSED':
                    assert 'actual' not in row and 'allowable' not in row
                    assert row['severity'] == ('info' if fixture['name'] == 'not-requested' else 'block')
                    unassessed += 1
                    continue
                criteria = data['criteria']
                if row['field'] == 'engineering.horizontalCurveRadiusM':
                    actual, limit = number(data['horizontalCurveRadiusM']), number(criteria['minimumRadiusM'])
                    passed = actual >= limit
                    assert row['roadEvidence'] == {'horizontalCurveRadiusM': data['horizontalCurveRadiusM'], 'minimumRadiusM': criteria['minimumRadiusM']}
                elif row['field'] == 'engineering.superelevation':
                    actual, limit = number(data['superelevation']) * 100, number(criteria['maximumSuperelevation']) * 100
                    passed = actual <= limit
                    assert row['roadEvidence'] == {'providedSuperelevation': data['superelevation'], 'maximumSuperelevation': criteria['maximumSuperelevation']}
                else:
                    assert row['field'] == 'engineering.availableSightDistanceM'
                    speed, grade = number(data['designSpeedKph']), number(data['gradePercent'])
                    friction, reaction = number(criteria['longitudinalFriction']), number(criteria['reactionTimeSeconds'])
                    model = speed * reaction / number('3.6') + speed * speed / (254 * (friction + grade / 100))
                    actual, limit = number(data['availableSightDistanceM']), max(model, number(criteria.get('minimumStoppingDistanceM', 0)))
                    passed = actual >= limit
                    assert row['roadEvidence'] == {'designSpeedKph': data['designSpeedKph'], 'gradePercent': data['gradePercent'],
                      'availableSightDistanceM': data['availableSightDistanceM'], 'longitudinalFriction': criteria['longitudinalFriction'],
                      'reactionTimeSeconds': criteria['reactionTimeSeconds'], 'minimumStoppingDistanceM': criteria.get('minimumStoppingDistanceM')}
                assert abs(number(row['actual']) - actual) < number('1e-12')
                assert abs(number(row['allowable']) - limit) < number('1e-12')
                assert row['assessment'] == ('PASS' if passed else 'FAIL')
                assert row['severity'] == ('info' if passed else 'block')
                assert row['criteriaReference'] == criteria['reference'] and criteria['reference'] in row['message']
                assert 'Road evidence:' in fixture['formatted']
                comparisons += 1
    assert comparisons == 11 and unassessed == 6 and len(probe['fixtures']) == 15
    result = {'status': 'passed', 'cases': 15, 'comparisons': comparisons, 'unassessed': unassessed}
    receipt.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
except Exception as error:
    receipt.write_text(json.dumps({'status': 'failed', 'error': repr(error)}))
    raise
