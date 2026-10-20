import { generateDeedPlan } from '../deedPlanApi'
import type { DeedPlanInput } from '@/types/deedPlan'

describe('deed plan authenticated client', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('posts to this origin and preserves normal session credentials', async () => {
    const output = { svg: '<svg />' }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => output })
    global.fetch = fetchMock
    const input = { parcelNumber: 'SYNTHETIC' } as DeedPlanInput
    await expect(generateDeedPlan(input)).resolves.toEqual(output)
    expect(fetchMock).toHaveBeenCalledWith('/api/deed-plan/generate', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    })
  })

  it('reports an authentication rejection without retrying elsewhere', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Authentication required' }) })
    global.fetch = fetchMock
    await expect(generateDeedPlan({} as DeedPlanInput)).rejects.toThrow('Authentication required')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
