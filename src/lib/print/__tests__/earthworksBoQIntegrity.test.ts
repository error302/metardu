import { generateEarthworksBoQ } from '../earthworksBoQ'
import { computeCrossSection, computeEarthwork } from '@/lib/computations/earthworksEngine'

const template = { carriagewayWidth: 4, shoulderWidth: 0, camber: 0, cutSlopeH: 1, fillSlopeH: 1 }
const sections = [0, 37].map(chainage => computeCrossSection({ chainage, centrelineRL: 1, formationRL: 0,
  leftShots: [{ offset: -10, rl: 1 }], rightShots: [{ offset: 10, rl: 1 }] }, template))
const input = { sections, result: computeEarthwork(sections), template, roadName: '<script>bad</script>',
  startChainage: '', endChainage: '', meta: { title: 'Draft quantities' } }

it('prints the actual method, observations and unknown references without fabricating certification or material factors', () => {
  const html = generateEarthworksBoQ(input)
  expect(html).toContain('185.000')
  expect(html).toContain('Average end-area volume schedule')
  expect(html).toContain('DRAFT — NOT CERTIFIED')
  expect(html).toContain('Height reference: Not supplied')
  expect(html).toContain('No measured middle sections were supplied')
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;')
  expect(html).not.toContain('I certify')
  expect(html).not.toContain('Nairobi datum')
  expect(html).not.toContain('values govern')
  expect(html).not.toContain('0.85')
})
it('computes supplied rates from fresh end-area quantities and rejects invalid rate inputs', () => {
  expect(generateEarthworksBoQ({ ...input, cutRate: 2 })).toContain('370.000')
  expect(() => generateEarthworksBoQ({ ...input, cutRate: NaN })).toThrow()
  expect(() => generateEarthworksBoQ({ ...input, sections: [] })).toThrow()
})
it('blocks stale quantity totals or a changed template at print time', () => {
  expect(() => generateEarthworksBoQ({ ...input, result: { ...input.result, totalCutEndArea: 9999 } })).toThrow(/stale|inconsistent/i)
  expect(() => generateEarthworksBoQ({ ...input, template: { ...template, camber: 5 } })).toThrow(/stale|inconsistent/i)
})
