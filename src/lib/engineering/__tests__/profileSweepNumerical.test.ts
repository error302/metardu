/** @jest-environment node */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { integrateProfileSweep, type ProfilePoint } from '../profileGeometry'
type Case = { id: string; ground: ProfilePoint[]; formation: ProfilePoint[]; curvature: number }
const flat = (a: number, b: number, level: number) => [{ offset: a, level }, { offset: b, level }]
const cases: Case[] = [
  { id: 'right-rectangle', ground: flat(0, 10, 2), formation: flat(0, 10, 0), curvature: 0.01 },
  { id: 'left-rectangle', ground: flat(-10, 0, 2), formation: flat(-10, 0, 0), curvature: -0.01 },
  { id: 'mixed-crossing', ground: [{ offset: -2, level: -2 }, { offset: 2, level: 2 }], formation: flat(-2, 2, 0), curvature: 0.1 },
  { id: 'tiny-crossing', ground: [{ offset: -1, level: -1e-200 }, { offset: 1, level: 1e-200 }], formation: flat(-1, 1, 0), curvature: 0.01 },
  { id: 'large-depth-small-width', ground: [{ offset: 0, level: 5e307 }, { offset: 1e-308, level: -5e307 }], formation: [{ offset: 0, level: -5e307 }, { offset: 1e-308, level: 5e307 }], curvature: 0 },
]
for (let i = 0; i < 64; i++) {
  const shift = i % 4 === 0 ? 10000 : 0, height = i % 3 === 0 ? 9600 : i % 3 === 1 ? -1200 : 0
  const level = (n: number) => height + (((i + 3) * (n + 7) * 17) % 97 - 48) / 8
  cases.push({ id: `piecewise-${i}`, ground: [-20, -9, -1, 7, 20].map((x, n) => ({ offset: x + shift, level: level(n) })),
    formation: [-15, -3, 0, 4, 15].map((x, n) => ({ offset: x + shift, level: height + ((i + n * 11) % 23 - 11) / 5 })),
    curvature: (i % 5 - 2) * (shift ? 0.000001 : 0.01) })
}
it('emits deterministic local sweep calculations for independent rational-polynomial verification', () => {
  const rows = cases.map(input => {
    const result = integrateProfileSweep(input.ground, input.formation, input.curvature)
    expect(result.cutRateM2).toBeGreaterThanOrEqual(0)
    expect(result.fillRateM2).toBeGreaterThanOrEqual(0)
    return { ...input, result: { cutArea: result.cutArea, fillArea: result.fillArea, cutMomentM3: result.cutMomentM3, fillMomentM3: result.fillMomentM3, cutRateM2: result.cutRateM2, fillRateM2: result.fillRateM2 } }
  })
  if (process.env.METARDU_ROAD_SWEEP_EVIDENCE === '1') {
    const folder = resolve('.cache/road-section-sweep'); mkdirSync(folder, { recursive: true })
    const paths = ['src/lib/engineering/profileGeometry.ts', 'src/lib/engineering/crossSectionGeometry.ts', 'src/lib/engineering/roadCoordinateSetout.ts', 'src/lib/engineering/roadTerrainSectionSweep.ts', 'src/lib/engineering/roadQuantity.ts', 'src/lib/engineering/roadQuantityPersistence.ts', 'src/lib/engineering/__tests__/profileSweepNumerical.test.ts']
    writeFileSync(resolve(folder, 'numerical-native.json'), JSON.stringify({ scope: 'Synthetic profile arithmetic only, not database, browser, complete road integration or field acceptance.', sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')])), cases: rows }, null, 2) + '\n')
  }
})
