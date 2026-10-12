/** @jest-environment node */
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { createObservationBatch } from '@/lib/observations/observationBatches'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))

const mockQuery = db.query as jest.Mock

beforeEach(() => {
  mockQuery.mockReset()
  mockQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'batch-1',
        batch_number: 'B-1',
        source_type: 'import',
        point_count: 0,
        instrument_name: null,
      }],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
})

test.each([
  ['empty text', '', 0],
  ['binary bytes', Buffer.from([0x00, 0xff, 0x0a]), 3],
] as const)('hashes supplied %s exactly, including zero-byte content', async (_label, content, size) => {
  await createObservationBatch({
    projectId: 'project-1',
    batchNumber: 'B-1',
    sourceType: 'import',
    sourceFileName: 'source.dat',
    sourceFileContent: content,
  })

  const expectedHash = createHash('sha256').update(content).digest('hex')
  const insertParams = (mockQuery.mock.calls[0] as [string, unknown[]])[1]
  expect(insertParams[4]).toBe(expectedHash)
  expect(insertParams[5]).toBe(size)
  const eventParams = (mockQuery.mock.calls[2] as [string, unknown[]])[1]
  expect(eventParams[4]).toContain(expectedHash)
})

test('a filename without source content does not claim a file digest', async () => {
  await createObservationBatch({
    projectId: 'project-1',
    batchNumber: 'B-1',
    sourceType: 'manual',
    sourceFileName: 'fieldbook.csv',
  })

  const insertParams = (mockQuery.mock.calls[0] as [string, unknown[]])[1]
  expect(insertParams[3]).toBe('fieldbook.csv')
  expect(insertParams[4]).toBeNull()
  expect(insertParams[5]).toBeNull()
  const eventParams = (mockQuery.mock.calls[2] as [string, unknown[]])[1]
  expect(eventParams[4]).toContain('"file_hash":null')
})
