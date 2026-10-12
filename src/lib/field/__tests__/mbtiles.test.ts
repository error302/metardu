import { describe, expect, it } from '@jest/globals'
import { uploadMBTiles } from '../mbtiles'

describe('uploadMBTiles', () => {
  function mockFetch(payload: unknown) {
    let requestInit: RequestInit | undefined
    const fetchMock: typeof fetch = async (_input, init) => {
      requestInit = init
      return {
        ok: true,
        json: async () => payload,
      } as Response
    }
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    })
    return { getRequestInit: () => requestInit }
  }

  it('requests server storage and unwraps the API data envelope for the map viewer', async () => {
    const session = {
      key: 'e9d3d732-9925-4dc8-9343-58a871cf3296',
      name: 'Nairobi field map',
      storage: 'server' as const,
      format: 'png' as const,
      minZoom: 10,
      maxZoom: 17,
      bounds: [36.7, -1.4, 36.9, -1.2] as [number, number, number, number],
    }
    const fetchMock = mockFetch({ data: session })

    const result = await uploadMBTiles(new File(['sqlite'], 'nairobi.mbtiles'))
    const body = fetchMock.getRequestInit()?.body as FormData

    expect(body.get('storage')).toBe('server')
    expect(result).toEqual(session)
  })

  it('rejects a successful HTTP response without a usable tile session', async () => {
    mockFetch({ data: { name: 'missing key', minZoom: 0, maxZoom: 5 } })

    await expect(uploadMBTiles(new File(['sqlite'], 'invalid.mbtiles')))
      .rejects.toThrow(/incomplete metadata/i)
  })
})
