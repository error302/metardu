/** @jest-environment node */
import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import { db } from '@/lib/db'
import { GET, POST, DELETE } from '@/app/api/storage/route'
import { createHash } from 'node:crypto'

jest.mock('@/lib/apiHandler', () => ({ apiHandler: (_options: unknown, handler: (request: NextRequest, context: { userId: string }) => Promise<Response>) =>
  (request: NextRequest) => handler(request, { userId: 'alice' }) }))
jest.mock('@/lib/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }))
jest.mock('fs', () => ({ promises: {
  mkdir: jest.fn(), writeFile: jest.fn(), readFile: jest.fn(), unlink: jest.fn(),
} }))
const ctx = {}
const request = (value: string) => new NextRequest(`http://localhost/api/storage?path=${encodeURIComponent(value)}`)
const upload = (value: string) => {
  const form = new FormData()
  form.set('path', value)
  form.set('bucket', 'reports')
  form.set('file', new Blob(['data'], { type: 'application/pdf' }), 'report.pdf')
  return new NextRequest('http://127.0.0.1/api/storage', { method: 'POST', body: form })
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(db.transaction).mockImplementation(async callback => callback({ query: db.query } as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0]))
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [] })
  ;(fs.mkdir as jest.Mock).mockResolvedValue(undefined)
  ;(fs.writeFile as jest.Mock).mockResolvedValue(undefined)
  ;(fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('private report'))
  ;(fs.unlink as jest.Mock).mockResolvedValue(undefined)
})

test.each(['reports/alice/../../victim/report.pdf', 'reports/alice/../report.pdf',
  'reports/alice//report.pdf', 'reports/alice/./report.pdf', 'reports\\alice\\report.pdf',
  '../upload-other/reports/alice/report.pdf'])('rejects noncanonical path %s before storage access', async value => {
  expect((await GET(request(value), ctx)).status).toBe(400)
  expect((await DELETE(request(value), ctx)).status).toBe(400)
  expect((await POST(upload(value), ctx)).status).toBe(400)
  expect(fs.readFile).not.toHaveBeenCalled()
  expect(fs.unlink).not.toHaveBeenCalled()
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('prevents an upload from overwriting another owner report', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'file', user_id: 'bob' }] })
  expect((await POST(upload('submissions/project/report.pdf'), ctx)).status).toBe(403)
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('registration failure does not return successful upload or write the file', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT')) throw new Error('database unavailable')
    return { rows: [] }
  })
  await expect(POST(upload('reports/alice/report.pdf'), ctx)).rejects.toThrow('database unavailable')
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('ownership lookup failure cannot fall back to a user-looking path', async () => {
  ;(db.query as jest.Mock).mockRejectedValue(new Error('database unavailable'))
  await expect(GET(request('reports/alice/report.pdf'), ctx)).rejects.toThrow('database unavailable')
  await expect(DELETE(request('reports/alice/report.pdf'), ctx)).rejects.toThrow('database unavailable')
  expect(fs.readFile).not.toHaveBeenCalled()
  expect(fs.unlink).not.toHaveBeenCalled()
})

test('registered owner can read reports outside their user directory', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ user_id: 'alice', id: 'file' }] })
  const result = await GET(request('submissions/project/report.pdf'), ctx)
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('private report')
})

test('owner can upload, read and delete a registered report', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ user_id: 'alice', id: 'file' }] })
  const key = 'submissions/project/report.pdf'
  expect((await POST(upload(key), ctx)).status).toBe(200)
  expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), Buffer.from('data'))
  expect((await GET(request(key), ctx)).status).toBe(200)
  expect((await DELETE(request(key), ctx)).status).toBe(200)
  expect(fs.unlink).toHaveBeenCalledTimes(1)
})

test('new uploads register the caller and retain the default user directory', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => ({
    rows: sql.includes('INSERT') ? [{ user_id: 'alice', id: 'file' }] : [],
  }))
  const result = await POST(upload(''), ctx)
  expect(result.status).toBe(200)
  const body = await result.json() as { data: { path: string } }
  expect(body.data.path).toMatch(/^reports\/alice\/[a-f0-9]+-report\.pdf$/)
  expect(fs.writeFile).toHaveBeenCalledTimes(1)
})

test('an account change rejects a queued upload before any file or database write', async () => {
  const queued = upload('reports/alice/report.pdf')
  queued.headers.set('X-Metardu-Expected-User', 'previous-owner')
  expect((await POST(queued, ctx)).status).toBe(403)
  expect(fs.writeFile).not.toHaveBeenCalled()
  expect(db.query).not.toHaveBeenCalled()
})

test('unregistered paths outside the caller directory cannot be claimed', async () => {
  expect((await POST(upload('submissions/project/report.pdf'), ctx)).status).toBe(403)
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('a competing ownership registration prevents the subsequent write', async () => {
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [] })
  expect((await POST(upload('reports/alice/report.pdf'), ctx)).status).toBe(403)
  expect(fs.writeFile).not.toHaveBeenCalled()
})

test('uses the actual file_uploads columns for uploads and ownership lookups', async () => {
  ;(db.query as jest.Mock).mockImplementation(async (sql: string) => {
    if (/\b(file_path|original_name|updated_at|bucket)\b|ON CONFLICT/i.test(sql)) {
      throw new Error('unsupported file_uploads schema')
    }
    return { rows: [{ id: 'file', user_id: 'alice' }] }
  })
  const key = 'reports/alice/report.pdf'
  expect((await POST(upload(key), ctx)).status).toBe(200)
  expect((await GET(request(key), ctx)).status).toBe(200)
  expect((await DELETE(request(key), ctx)).status).toBe(200)
})

test.each(['surface-exports/alice/project/revision/file.dxf', 'SURFACE-EXPORTS/alice/project/revision/file.dxf'])('generic upload/delete cannot replace or erase retained surface artifacts: %s', async key => {
  expect((await POST(upload(key), ctx)).status).toBe(409)
  expect((await DELETE(request(key), ctx)).status).toBe(409)
  expect(fs.writeFile).not.toHaveBeenCalled(); expect(fs.unlink).not.toHaveBeenCalled()
})
test('a retained artifact is delivered only when the stored bytes match its acknowledgement', async () => {
  const sha256 = createHash('sha256').update('private report').digest('hex')
  ;(db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'file', user_id: 'alice', sha256 }] })
  const key = 'surface-exports/alice/project/revision/file.dxf'
  expect((await GET(request(key), ctx)).status).toBe(200)
  ;(fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('changed'))
  expect((await GET(request(key), ctx)).status).toBe(409)
})
test('unacknowledged retained artifacts cannot fall back to a user-looking path', async () => {
  expect((await GET(request('surface-exports/alice/project/revision/file.dxf'), ctx)).status).toBe(409)
  expect(fs.readFile).not.toHaveBeenCalled()
})
