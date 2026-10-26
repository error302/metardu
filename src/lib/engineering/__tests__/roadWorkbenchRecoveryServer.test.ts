/** @jest-environment node */
import type { PoolClient } from 'pg'
import { roadWorkbenchExample } from '../roadWorkbenchExample'
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
} from '../roadWorkbenchDraft'
import { hashDesignPayload, recordDesignRevision } from '../designRevisions'
import {
  loadRoadWorkbenchSource,
  executeRoadWorkbenchCommand,
  readRoadWorkbenchOutcome,
} from '../roadWorkbenchRecoveryServer'
import type { RoadWorkbenchCommand } from '../roadWorkbenchRecoveryContract'
jest.mock('../designRevisions', () => ({
  ...jest.requireActual<typeof import('../designRevisions')>(
    '../designRevisions',
  ),
  recordDesignRevision: jest.fn(),
}))
jest.mock('@/lib/db', () => ({ db: {} }))
const actor = '11111111-1111-4111-8111-111111111111',
  project = '22222222-2222-4222-8222-222222222222',
  request = '33333333-3333-4333-8333-333333333333'
const fixtureCrs = 'EPSG:32737'
let engineering: Record<string, unknown>,
  owner: string,
  refs: Record<string, unknown>,
  ledger: Array<Record<string, unknown>>
let roundTrips = true
const query = jest.fn(async (sql: string, values: unknown[] = []) => {
  if (/AS supported_json/.test(sql))
    return { rows: [{ supported_json: roundTrips }] }
  if (/FROM projects/.test(sql))
    return {
      rows:
        values[1] === owner
          ? [{ id: project, user_id: owner, engineering_data: engineering }]
          : [],
    }
  if (/FROM project_reference_systems/.test(sql)) return { rows: [refs] }
  if (/FROM design_revisions/.test(sql))
    return { rows: ledger.filter((r) => r.entity_id === values[2]) }
  if (/UPDATE projects/.test(sql)) {
    engineering = /jsonb_set/.test(sql)
      ? { ...engineering, road: JSON.parse(String(values[2])) as unknown }
      : (JSON.parse(String(values[2])) as Record<string, unknown>)
    return { rows: [{ id: project, engineering_data: engineering }] }
  }
  throw Error('Unexpected fixture SQL: ' + sql)
})
const client = { query } as unknown as PoolClient
beforeEach(() => {
  jest.clearAllMocks()
  owner = actor
  ledger = []
  roundTrips = true
  engineering = {
    mode: 'road',
    standard: 'KRDM2017',
    road: roadWorkbenchExample().road,
    pipeNetwork: { fixture: 'retain unrelated design' },
  }
  refs = {
    horizontal_crs: fixtureCrs,
    horizontal_name: 'Synthetic WGS84 UTM 37S',
    datum_name: 'WGS84',
    units: 'metres',
    zone: 37,
    hemisphere: 'S',
    vertical_datum: 'Synthetic BM',
    vertical_reference: 'local',
    distance_mode: 'grid',
    coordinate_precision: 3,
  }
  jest.mocked(recordDesignRevision).mockImplementation(async (input) => {
    const row = {
      id: '44444444-4444-4444-8444-444444444444',
      project_id: project,
      discipline: 'road',
      entity_type: input.entityType,
      entity_id: input.entityId,
      revision: 'R01',
      revision_number: 1,
      status: 'DRAFT',
      created_by: actor,
      created_at: '2026-10-27T00:00:00Z',
      payload: input.payload,
      content_hash: hashDesignPayload(input.payload ?? {}),
    }
    ledger.push(row)
    return {
      revision:
        row as unknown as import('../designRevisions').DesignRevisionRecord,
      supersededId: null,
    }
  })
})
async function command(): Promise<RoadWorkbenchCommand> {
  const source = await loadRoadWorkbenchSource(client, actor, project)
  const draft = createRoadWorkbenchDraft(source.road)
  draft.vips[0].reducedLevel = '99'
  const road = evaluateRoadWorkbenchDraft(
    source.road,
    draft,
    source.reference,
  ).road
  if (!road) throw Error('Invalid synthetic edited road')
  return JSON.parse(
    JSON.stringify({
      version: 1,
      actorId: actor,
      projectId: project,
      requestId: request,
      expectedEngineeringHash: source.engineeringHash,
      expectedReferenceHash: source.referenceHash,
      road,
    }),
  ) as RoadWorkbenchCommand
}
it('compares both source identities, retains unrelated data and records the exact request in the same transaction', async () => {
  const c = await command(),
    result = await executeRoadWorkbenchCommand(client, actor, c, 'commit')
  expect(result.state).toBe('committed')
  expect(engineering.pipeNetwork).toEqual({
    fixture: 'retain unrelated design',
  })
  expect((engineering.road as typeof c.road).vips[0].reducedLevel).toBe(99)
  expect(
    query.mock.calls.filter(([sql]) => /UPDATE projects/.test(sql)),
  ).toHaveLength(1)
  expect(
    query.mock.calls.find(([sql]) => /UPDATE projects/.test(sql))?.[0],
  ).toContain('jsonb_set')
  expect(recordDesignRevision).toHaveBeenCalledWith(
    expect.objectContaining({
      draftOnly: true,
      entityId: request,
      userId: actor,
    }),
    client,
  )
  const payload = ledger[0].payload as {
    sourceEvidence: {
      engineering: Record<string, unknown>
      referenceRecord: Record<string, unknown>
    }
  }
  expect(
    hashDesignPayload({ engineering: payload.sourceEvidence.engineering }),
  ).toBe(c.expectedEngineeringHash)
  expect(
    hashDesignPayload({ reference: payload.sourceEvidence.referenceRecord }),
  ).toBe(c.expectedReferenceHash)
  expect(await readRoadWorkbenchOutcome(client, actor, c)).toEqual(result)
})
it('replays the original committed outcome after a lost response even when the project has subsequently changed', async () => {
  const c = await command(),
    first = await executeRoadWorkbenchCommand(client, actor, c, 'commit')
  engineering = { ...engineering, standard: 'KeRRA' }
  expect(await executeRoadWorkbenchCommand(client, actor, c, 'commit')).toEqual(
    first,
  )
  expect(
    query.mock.calls.filter(([sql]) => /UPDATE projects/.test(sql)),
  ).toHaveLength(1)
  expect(recordDesignRevision).toHaveBeenCalledTimes(1)
})
it.each(['engineering', 'reference'])(
  'refuses a stale %s source before a write or archive',
  async (what) => {
    const c = await command()
    if (what === 'engineering')
      engineering = { ...engineering, standard: 'KeRRA' }
    else refs = { ...refs, vertical_datum: 'Changed synthetic benchmark' }
    await expect(
      executeRoadWorkbenchCommand(client, actor, c, 'commit'),
    ).rejects.toThrow(/changed/i)
    expect(query.mock.calls.some(([sql]) => /UPDATE projects/.test(sql))).toBe(
      false,
    )
    expect(recordDesignRevision).not.toHaveBeenCalled()
  },
)
it('cancels durably before a late commit, and never changes the project', async () => {
  const c = await command(),
    cancelled = await executeRoadWorkbenchCommand(client, actor, c, 'cancel')
  expect(cancelled.state).toBe('cancelled')
  expect(await executeRoadWorkbenchCommand(client, actor, c, 'commit')).toEqual(
    cancelled,
  )
  expect(query.mock.calls.some(([sql]) => /UPDATE projects/.test(sql))).toBe(
    false,
  )
  expect(recordDesignRevision).toHaveBeenCalledTimes(1)
})
it('does not undo an already committed request when cancellation arrives late', async () => {
  const c = await command(),
    saved = await executeRoadWorkbenchCommand(client, actor, c, 'commit')
  expect(await executeRoadWorkbenchCommand(client, actor, c, 'cancel')).toEqual(
    saved,
  )
})
it('refuses changed ownership, cross-account requests and request ID reuse for different input', async () => {
  const c = await command()
  await expect(
    executeRoadWorkbenchCommand(
      client,
      '55555555-5555-4555-8555-555555555555',
      c,
      'commit',
    ),
  ).rejects.toThrow(/account/i)
  await executeRoadWorkbenchCommand(client, actor, c, 'commit')
  const altered = { ...c, road: { ...c.road, roadName: 'Changed' } }
  await expect(
    executeRoadWorkbenchCommand(client, actor, altered, 'commit'),
  ).rejects.toThrow(/different|identity/i)
  owner = '55555555-5555-4555-8555-555555555555'
  await expect(
    executeRoadWorkbenchCommand(client, actor, c, 'commit'),
  ).rejects.toThrow(/not found/i)
})
it('refuses alteration of retained ground or the original association in an editor-only command', async () => {
  const c = await command()
  c.road.stations[0].groundLevel += 2
  await expect(
    executeRoadWorkbenchCommand(client, actor, c, 'commit'),
  ).rejects.toThrow(/original|inputs/i)
  expect(recordDesignRevision).not.toHaveBeenCalled()
})
it('refuses a corrupted retained outcome instead of treating it as unknown or sending another save', async () => {
  const c = await command()
  await executeRoadWorkbenchCommand(client, actor, c, 'commit')
  ledger[0].content_hash = 'a'.repeat(64)
  await expect(readRoadWorkbenchOutcome(client, actor, c)).rejects.toThrow(
    /identity|integrity/i,
  )
})
it('refuses non-finite values in unrelated saved data before JSON normalization can coerce them', async () => {
  engineering = {
    ...engineering,
    pipeNetwork: { retainedMeasurement: Infinity },
  }
  await expect(loadRoadWorkbenchSource(client, actor, project)).rejects.toThrow(
    /finite|represent/i,
  )
  expect(query.mock.calls.some(([sql]) => /UPDATE projects/.test(sql))).toBe(
    false,
  )
})
it('refuses saved JSON that PostgreSQL says cannot round-trip without loss', async () => {
  const c = await command()
  roundTrips = false
  await expect(
    executeRoadWorkbenchCommand(client, actor, c, 'commit'),
  ).rejects.toThrow(/represent|precision/i)
  expect(query.mock.calls.some(([sql]) => /UPDATE projects/.test(sql))).toBe(
    false,
  )
  expect(recordDesignRevision).not.toHaveBeenCalled()
})
