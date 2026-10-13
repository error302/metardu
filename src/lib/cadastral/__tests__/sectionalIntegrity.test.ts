import { createSectionalPlan, type SectionalFloor } from '../sectionalAndEncumbrance'

const floors: SectionalFloor[] = [{ floor: 0, name: 'Ground', totalArea: 100, units: [
  { id: 'a', unitNumber: 'A', floor: 0, type: 'residential', area: 40 },
  { id: 'b', unitNumber: 'B', floor: 0, type: 'residential', area: 40 },
  { id: 'c', unitNumber: 'Hall', floor: 0, type: 'common', area: 20 },
] }]
it('uses measured floor totals, excludes declared common areas from unit shares, and preserves an explicit zero residual', () => {
  expect(createSectionalPlan('Measured building', 'Source reference', floors)).toMatchObject({ totalArea: 100, totalUnitArea: 80, totalCommonArea: 20 })
  expect(createSectionalPlan('Measured building', 'Source reference', floors).participationQuotas.map(q => q.quota)).toEqual([50, 50])
  expect(createSectionalPlan('Measured building', 'Source reference', [{ ...floors[0], totalArea: 80, units: floors[0].units.slice(0, 2) }]).totalCommonArea).toBe(0)
})
it('rejects impossible floor totals and missing/non-finite unit measurements', () => {
  expect(() => createSectionalPlan('Building', 'Source', [{ ...floors[0], totalArea: 70 }])).toThrow()
  for (const area of [NaN, Infinity, -1, 0]) {
    expect(() => createSectionalPlan('Building', 'Source', [{ ...floors[0], units: [{ ...floors[0].units[0], area }] }])).toThrow()
  }
})
it('rejects duplicate unit identities across floors and inconsistent floor references', () => {
  expect(() => createSectionalPlan('Building', 'Source', [...floors, { ...floors[0], floor: 1 }])).toThrow()
  expect(() => createSectionalPlan('Building', 'Source', [{ ...floors[0], units: [{ ...floors[0].units[0], floor: 1 }] }])).toThrow()
  expect(() => createSectionalPlan('Building', 'Source', [{ ...floors[0], units: [floors[0].units[0], { ...floors[0].units[1], unitNumber: ' a ' }] }])).toThrow()
})
it('requires a real building/reference, nonempty floors and at least one private unit', () => {
  expect(() => createSectionalPlan('', 'Source', floors)).toThrow()
  expect(() => createSectionalPlan('Building', '', floors)).toThrow()
  expect(() => createSectionalPlan('Building', 'Source', [])).toThrow()
  expect(() => createSectionalPlan('Building', 'Source', [{ ...floors[0], units: [floors[0].units[2]] }])).toThrow()
})
