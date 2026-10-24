"""Independent Decimal arithmetic over the native source-adapter report."""
import json
from decimal import Decimal as D, getcontext
from pathlib import Path

getcontext().prec = 60
report = json.loads((Path(__file__).resolve().parent.parent / '.cache/legacy-superelevation/source-probe.json').read_text(), parse_float=D)
assert report['status'] == 'passed' and report['sourcePreserved']
assert len(report['fixtures']) == 6 and report['refusals'] == 90
checks = 0
for fixture in report['fixtures']:
    i, r = fixture['input'], fixture['result']
    c = i['criteria']
    v, radius = D(i['designSpeed']), D(i['radius'])
    width = D(i['numLanes']) * D(i['laneWidth'])
    demand = v*v / (D(127)*radius)
    expected = {
        'requiredE': max(D(0), demand - D(c['lateralFriction'])),
        'designE': D(i['providedSuperelevation']),
        'rotatedWidth': width,
        'transitionLength': width * abs(D(i['providedSuperelevation'])-D(i['initialCrossfall'])) / D(c['maximumRelativeGradient']),
        'minimumRadiusAtLimit': v*v / (D(127)*(D(c['lateralFriction'])+D(c['maximumSuperelevation']))),
    }
    for key, value in expected.items():
        assert abs(D(r[key])-value) <= max(D('1e-14'), abs(value)*D('1e-14')), (key, r[key], value)
        checks += 1
    within = D(i['providedSuperelevation']) <= D(c['maximumSuperelevation'])
    met = D(i['providedSuperelevation']) + D(c['lateralFriction']) >= demand
    assert r['checks'] == {'withinSuperelevationLimit': within, 'lateralDemandMet': met}
    assert r['status'] == ('PASS' if within and met else 'FAIL')
    assert r['standardCompliance'] == 'NOT_ASSESSED' and r['criteriaReference'] == c['reference']
    assert not set(r).intersection(['BVC', 'EVC', 'A', 'L1', 'L2', 'table', 'tangentialRunout'])
print(f'Passed {checks} independent Decimal comparisons, 6 assessment outcomes and 90 native refusals.')
