/** @jest-environment node */
import { createHash } from 'node:crypto'
import { readSchemeExportReply } from '@/lib/scheme/exportClient'
import {
  schemePendingHash,
  type PendingSchemeExport,
} from '@/lib/scheme/exportPending'
import { schemeExportSourceRevision } from '@/lib/scheme/exportContract'
const actor = '11111111-1111-4111-8111-111111111111',
  project = '33333333-3333-4333-8333-333333333333',
  request = '22222222-2222-4222-8222-222222222222',
  sourceCrs = 'EPSG:32737'
const pending: PendingSchemeExport = {
  version: 1,
  format: 'dxf',
  createdAt: '2026-10-25T00:00:00Z',
  body: {
    expectedUserId: actor,
    projectId: project,
    requestId: request,
    parcelIds: ['44444444-4444-4444-8444-444444444444'],
    sourceHash: 'a'.repeat(64),
    reviewed: true,
  },
}
async function headers() {
  return new Headers({
    'Content-Type': 'application/dxf',
    'Content-Disposition': `attachment; filename="boundary-drafts-${request}.dxf"`,
    'X-Metardu-Request': request,
    'X-Metardu-Request-Hash': await schemePendingHash(pending),
    'X-Metardu-Source-Hash': pending.body.sourceHash,
    'X-Metardu-Source-Revision': schemeExportSourceRevision(
      pending.body.sourceHash,
    ),
    'X-Metardu-Source-CRS': sourceCrs,
    'X-Metardu-Output-CRS': sourceCrs,
    'X-Metardu-Deliverable': actor,
    'X-Metardu-Deliverable-Revision-ID': project,
    'X-Metardu-Deliverable-Revision': '1',
    'X-Metardu-Content-SHA256': createHash('sha256')
      .update('synthetic retained bytes')
      .digest('hex'),
  })
}
it('accepts only the exact request metadata and registered bytes', async () => {
  const reply = await readSchemeExportReply(
    new Response('synthetic retained bytes', { headers: await headers() }),
    pending,
  )
  expect(reply.outcome).toBe('committed')
  if (reply.outcome === 'committed')
    expect(new TextDecoder().decode(reply.bytes)).toBe(
      'synthetic retained bytes',
    )
})
it('refuses a foreign nonce before downloading its content', async () => {
  const h = await headers()
  h.set('X-Metardu-Request', actor)
  await expect(
    readSchemeExportReply(
      new Response('synthetic retained bytes', { headers: h }),
      pending,
    ),
  ).rejects.toThrow(/exact retained request/)
})
it('refuses changed source and output-reference declarations', async () => {
  for (const [key, value] of [
    ['X-Metardu-Source-Hash', 'b'.repeat(64)],
    ['X-Metardu-Output-CRS', 'EPSG:4326'],
    ['Content-Type', 'text/html'],
  ]) {
    const h = await headers()
    h.set(key, value)
    await expect(
      readSchemeExportReply(
        new Response('synthetic retained bytes', { headers: h }),
        pending,
      ),
    ).rejects.toThrow(/metadata/)
  }
})
it('refuses corrupt bytes and empty artifacts', async () => {
  await expect(
    readSchemeExportReply(
      new Response('corrupt bytes', { headers: await headers() }),
      pending,
    ),
  ).rejects.toThrow(/registered content hash/)
  await expect(
    readSchemeExportReply(
      new Response('', { headers: await headers() }),
      pending,
    ),
  ).rejects.toThrow(/empty/)
})
it('cancels an oversized artifact stream at its window', async () => {
  let canceled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(4194305))
    },
    cancel() {
      canceled = true
    },
  })
  await expect(
    readSchemeExportReply(
      new Response(stream, { headers: await headers() }),
      pending,
    ),
  ).rejects.toThrow(/4 MiB/)
  expect(canceled).toBe(true)
})
it('accepts a matching durable cancellation and rejects another account receipt', async () => {
  const h = await headers()
  h.set('Content-Type', 'application/json')
  const data = {
    outcome: 'cancelled',
    projectId: project,
    actorId: actor,
    requestId: request,
    requestHash: await schemePendingHash(pending),
    sourceHash: pending.body.sourceHash,
    format: 'dxf',
  }
  expect(
    (
      await readSchemeExportReply(
        new Response(JSON.stringify({ data }), { headers: h }),
        pending,
      )
    ).outcome,
  ).toBe('cancelled')
  await expect(
    readSchemeExportReply(
      new Response(JSON.stringify({ data: { ...data, actorId: project } }), {
        headers: h,
      }),
      pending,
    ),
  ).rejects.toThrow(/cancellation/)
})
