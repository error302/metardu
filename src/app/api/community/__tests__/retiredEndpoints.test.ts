/** @jest-environment node */
import { NextRequest } from 'next/server'
import * as discussions from '../discussions/route'
import * as reviews from '../peer-reviews/route'

jest.mock('@/lib/apiHandler', () => ({
  apiHandler: (_options: unknown, handler: (request: NextRequest) => Promise<Response>) => handler,
}))

for (const endpoint of [
  { name: 'discussions', code: 'COMMUNITY_DISCUSSIONS_RETIRED', ...discussions },
  { name: 'peer-reviews', code: 'COMMUNITY_PEER_REVIEWS_RETIRED', ...reviews },
]) {
  test(endpoint.name + ' GET explicitly refuses invented community evidence', async () => {
    const response = await endpoint.GET(new NextRequest('http://127.0.0.1/api/community/' + endpoint.name))
    expect(response.status).toBe(410)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toMatchObject({ code: endpoint.code, instrumentMarketplace: '/marketplace' })
  })
  test(endpoint.name + ' POST never reads or acknowledges a posting body', async () => {
    const request = new NextRequest('http://127.0.0.1/api/community/' + endpoint.name, { method: 'POST', body: 'malformed input' })
    const read = jest.spyOn(request, 'json')
    const response = await endpoint.POST(request)
    expect(response.status).toBe(410)
    expect(await response.json()).toMatchObject({ code: endpoint.code })
    expect(read).not.toHaveBeenCalled()
  })
}
