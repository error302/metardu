import { uploadFieldPhoto } from '../photoUpload'

describe('uploadFieldPhoto', () => {
  it('uploads raw base64 through the authenticated storage endpoint and returns its owner-scoped path', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { path: 'survey-photos/user-1/abc-photo.jpg' }, error: null }),
    }) as unknown as typeof fetch

    await expect(uploadFieldPhoto('photo-1', 'AQID', 'project-1', 'image/jpeg', 'photo-1.jpg', fetcher))
      .resolves.toBe('survey-photos/user-1/abc-photo.jpg')

    const [url, init] = (fetcher as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/storage')
    expect(init.method).toBe('POST')
    const body = init.body as FormData
    expect(body.get('bucket')).toBe('survey-photos')
    expect(body.get('projectId')).toBe('project-1')
    expect(body.get('clientId')).toBe('photo-1')
    const file = body.get('file') as File
    expect(file.name).toBe('photo-1.jpg')
    expect(file.type).toBe('image/jpeg')
    expect(file.size).toBe(3)
  })

  it('accepts data URLs and surfaces storage authorization failures', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Forbidden' }),
    }) as unknown as typeof fetch

    await expect(uploadFieldPhoto('photo-2', 'data:image/jpeg;base64,AQID', 'project-2', 'image/jpeg', 'original.jpg', fetcher))
      .rejects.toThrow('Forbidden')
  })

  it('retains storage throttling instructions and bounds the upload lifetime', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 429,
      headers: new Map([['Retry-After', '90']]), json: async () => { throw new SyntaxError('Not JSON') } }) as unknown as typeof fetch
    await expect(uploadFieldPhoto('photo-throttled', 'AQID', 'project-2', 'image/jpeg', 'original.jpg', fetcher))
      .rejects.toMatchObject({ status: 429, retryAfter: '90' })
    const [, init] = (fetcher as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('binds a queued photo to the capture account before sending its original bytes', async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { path: 'survey-photos/owner/photo.png' } }) }) as unknown as typeof fetch
    await uploadFieldPhoto('photo', 'AQID', 'project', 'image/png', 'original.png', fetcher, 'capture-owner')
    const [, init] = (fetcher as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'X-Metardu-Expected-User': 'capture-owner' })
    expect(((init.body as FormData).get('file') as File).size).toBe(3)
  })

  it('rejects invalid image data before making a request', async () => {
    const fetcher = jest.fn() as unknown as typeof fetch
    await expect(uploadFieldPhoto('photo-3', '%%%bad%%%', 'project-3', 'image/jpeg', 'photo-3.jpg', fetcher))
      .rejects.toThrow('Photo data is not valid base64')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('retains the original raster type and rejects active-content formats', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { path: 'survey-photos/user-1/photo-4-site.png' }, error: null }),
    }) as unknown as typeof fetch

    await uploadFieldPhoto('photo-4', 'data:image/png;base64,AQID', 'project-4', 'image/png', 'site.png', fetcher)
    const [, init] = (fetcher as jest.Mock).mock.calls[0] as [string, RequestInit]
    const uploaded = (init.body as FormData).get('file') as File
    expect(uploaded.type).toBe('image/png')
    expect(uploaded.name).toBe('site.png')

    await expect(uploadFieldPhoto('photo-5', 'data:image/svg+xml;base64,AQID', 'project-4', 'image/svg+xml', 'unsafe.svg', fetcher))
      .rejects.toThrow('JPEG, PNG, HEIC, or HEIF')
  })
})
