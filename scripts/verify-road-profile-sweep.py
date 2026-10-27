"""Independent exact-rational integration of the retained native profile cases.

Run the opt-in profileSweepNumerical Jest test first, then this script from the
checkout root. No database, browser, network, dependencies or product mutation.
The reference integrates polynomial antiderivatives, independently of the native
polygon/triangle contribution method. Serialized decimal inputs define the cases.
"""
from fractions import Fraction as F
from decimal import Decimal, localcontext
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / '.cache' / 'road-section-sweep'
NATIVE = FOLDER / 'numerical-native.json'


def number(value):
    return F(str(value))


def profile(points):
    return sorted((number(p['offset']), number(p['level'])) for p in points)


def level(points, x):
    for (a, za), (b, zb) in zip(points, points[1:]):
        if a <= x <= b:
            return za + (x - a) * (zb - za) / (b - a)
    raise AssertionError('Reference interpolation left the original profile.')


def reference(case):
    g, f, k = profile(case['ground']), profile(case['formation']), number(case['curvature'])
    # Splitting at zero additionally provides an absolute first-moment error scale.
    cuts = sorted({x for x, _ in g + f if f[0][0] <= x <= f[-1][0]}
                  | ({F(0)} if f[0][0] < 0 < f[-1][0] else set()))
    expected = {key: F(0) for key in ('cutArea', 'fillArea', 'cutMomentM3', 'fillMomentM3', 'cutRateM2', 'fillRateM2')}
    scales = {key: F(0) for key in expected}
    for a, b in zip(cuts, cuts[1:]):
        da, db = level(g, a) - level(f, a), level(g, b) - level(f, b)
        m, c = (db - da) / (b - a), da - (db - da) / (b - a) * a
        edges = [a, b]
        if m and a < -c / m < b:
            edges.insert(1, -c / m)
        for left, right in zip(edges, edges[1:]):
            sign = 1 if m * ((left + right) / 2) + c >= 0 else -1
            kind = 'cut' if sign == 1 else 'fill'
            area = sign * (m * (right**2 - left**2) / 2 + c * (right - left))
            moment = sign * (m * (right**3 - left**3) / 3 + c * (right**2 - left**2) / 2)
            rate = area - k * moment
            assert area >= 0 and rate >= 0
            for name, value in ((kind + 'Area', area), (kind + 'MomentM3', moment), (kind + 'RateM2', rate)):
                expected[name] += value
                scales[name] += abs(value)
    return expected, scales


def main():
    native_bytes = NATIVE.read_bytes()
    native = json.loads(native_bytes)
    assert len(native['cases']) == 69
    for path, expected_hash in native['sourceHashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, path
    checks, largest_ratio = 0, Decimal(0)
    with localcontext() as ctx:
        ctx.prec = 90
        for case in native['cases']:
            expected, scales = reference(case)
            for name, exact in expected.items():
                truth = Decimal(exact.numerator) / Decimal(exact.denominator)
                scale = Decimal(scales[name].numerator) / Decimal(scales[name].denominator)
                actual = Decimal(str(case['result'][name]))
                tolerance = scale * Decimal('5e-11') + Decimal('1e-320')
                error = abs(actual - truth)
                assert error <= tolerance, (case['id'], name, str(actual), str(truth), str(tolerance))
                largest_ratio = max(largest_ratio, error / tolerance)
                checks += 1
    receipt = {
        'status': 'passed', 'scope': 'Independent exact-rational source-profile arithmetic, not professional or field acceptance.',
        'cases': len(native['cases']), 'scalarComparisons': checks,
        'referenceMethod': 'Exact Fraction interpolation, zero roots and polynomial area/moment antiderivatives; A-k*M rates.',
        'tolerance': '5e-11 times absolute reference contribution scale plus 1e-320; not instrument accuracy.',
        'largestErrorToToleranceRatio': str(largest_ratio),
        'nativeReceiptSha256': hashlib.sha256(native_bytes).hexdigest(),
        'sourceHashes': native['sourceHashes'],
        'verifierSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    (FOLDER / 'numerical-independent.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(f"Independent rational verifier passed: {receipt['cases']} cases / {checks} scalar comparisons.")


if __name__ == '__main__':
    main()
