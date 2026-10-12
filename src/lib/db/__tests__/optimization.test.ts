jest.mock('@/lib/db', () => ({
  db: { query: jest.fn() },
}))

import { db } from '@/lib/db'
import { applyRecommendedIndexes, getRecommendedIndexes } from '../optimization'

describe('applyRecommendedIndexes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('runs each curated index statement against PostgreSQL and reports only successful statements as applied', async () => {
    const expected = Object.values(getRecommendedIndexes()).flat()
    ;(db.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 })

    const result = await applyRecommendedIndexes()

    expect(db.query).toHaveBeenCalledTimes(expected.length)
    const calls = (db.query as jest.Mock).mock.calls as unknown as Array<[unknown]>
    expect(calls.map(([sql]) => sql)).toEqual(expected)
    expect(result.applied).toEqual(expected)
    expect(result.skipped).toEqual([])
  })

  it('continues after a database failure and reports that statement as skipped', async () => {
    const expected = Object.values(getRecommendedIndexes()).flat()
    const failedIndex = expected[2]
    ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql === failedIndex) throw new Error('permission denied')
      return { rows: [], rowCount: 0 }
    })

    const result = await applyRecommendedIndexes()

    expect(result.applied).toEqual(expected.filter(sql => sql !== failedIndex))
    expect(result.skipped).toEqual([failedIndex])
  })
})
