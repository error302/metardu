import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { db } from '@/lib/db'
import { createProjectServer, projectTools, runTraverse } from './server'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))

const ORIGIN = 'https://metardu.space'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const REPORT_ID = '44444444-4444-4444-8444-444444444444'
// This synthetic fixture verifies the connector preserves an explicitly supplied grid reference.
// eslint-disable-next-line metardu/no-hardcoded-srid-default -- Intentional CRS fixture in a test.
const TEST_PROJECT_CRS = 'EPSG:32737'
const mockedDb = db as unknown as { query: jest.Mock }

function queryCall(index: number): [unknown, unknown[]] {
  const call = mockedDb.query.mock.calls[index] as [unknown, unknown[]] | undefined
  if (!call) throw new Error(`Expected database call ${index + 1}`)
  return call
}

async function connectedClient(auth: { userId: string; scopes: string[] } | null) {
  const server = createProjectServer(auth, ORIGIN)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'metardu-survey-tools-test', version: '1.0.0' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

afterEach(() => mockedDb.query.mockReset())

describe('METARDU ChatGPT survey tools', () => {
  it('advertises scoped survey tools, including a draft-only report writer', async () => {
    const { client, server } = await connectedClient(null)
    try {
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toEqual([
        'list_projects', 'get_project', 'list_project_observations', 'compute_closed_traverse', 'compute_stakeout', 'compute_level_book', 'create_report_draft',
      ])
      const observations = tools.find(tool => tool.name === 'list_project_observations')
      expect(projectTools.find(tool => tool.name === 'list_project_observations')?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['survey-data:read'] }])
      expect(observations?._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['survey-data:read'] }])
      const reportWriter = tools.find(tool => tool.name === 'create_report_draft')
      expect(projectTools.find(tool => tool.name === 'create_report_draft')?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['survey-documents:write'] }])
      expect(reportWriter?._meta?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['survey-documents:write'] }])
      expect(reportWriter?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false })
      for (const tool of tools) {
        expect(projectTools.find(definition => definition.name === tool.name)?.outputSchema).toBeDefined()
        expect(tool.annotations).toMatchObject({
          readOnlyHint: tool.name !== 'create_report_draft', destructiveHint: false, openWorldHint: false,
        })
      }
      expect(projectTools.every(tool => tool.securitySchemes.length > 0 && tool.outputSchema)).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('publishes top-level per-tool OAuth security schemes on the MCP wire', async () => {
    const server = createProjectServer(null, ORIGIN)
    const [wireProbe, serverTransport] = InMemoryTransport.createLinkedPair()
    try {
      await server.connect(serverTransport)
      const response = new Promise<unknown>(resolve => { wireProbe.onmessage = message => resolve(message) })
      await wireProbe.send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      const message = await response as { result?: { tools?: Array<Record<string, unknown>> } }
      const tool = message.result?.tools?.find(item => item.name === 'list_project_observations')
      expect(tool?.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['survey-data:read'] }])
      expect(tool?._meta).toMatchObject({ securitySchemes: [{ type: 'oauth2', scopes: ['survey-data:read'] }] })
    } finally {
      await server.close()
    }
  })

  it('returns an OAuth challenge with the protected-resource URL when the account is not connected', async () => {
    const { client, server } = await connectedClient(null)
    try {
      const result = await client.callTool({ name: 'compute_stakeout', arguments: {} })
      expect(result.isError).toBe(true)
      expect(result._meta?.['mcp/www_authenticate']).toEqual(expect.arrayContaining([
        expect.stringContaining(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`),
        expect.stringContaining('scope="survey:compute"'),
        expect.stringContaining('error="invalid_token"'),
        expect.stringContaining('error_description="Connect your METARDU account to use this tool."'),
      ]))
      expect(mockedDb.query).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('requires the requested permission and does not widen an existing project-only grant', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['projects:read'] })
    try {
      const result = await client.callTool({ name: 'compute_level_book', arguments: {} })
      expect(result.isError).toBe(true)
      const block = (result.content as Array<{ type: string; text: string }>)[0]
      if (!block) throw new Error('Expected an error response content block')
      expect(block).toMatchObject({ type: 'text' })
      expect(block.text).toContain('approve the survey:compute permission')
      expect(result._meta?.['mcp/www_authenticate']).toEqual(expect.arrayContaining([
        expect.stringContaining('scope="survey:compute"'),
        expect.stringContaining('error_description="Reconnect METARDU and approve the survey:compute permission to use this tool."'),
      ]))
      expect(mockedDb.query).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('requires the separate report-write scope and does not touch the database when it is absent', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['projects:read'] })
    try {
      const result = await client.callTool({ name: 'create_report_draft', arguments: {} })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ type: string; text: string }>)[0]?.text).toContain('survey-documents:write')
      expect(result._meta?.['mcp/www_authenticate']).toEqual(expect.arrayContaining([
        expect.stringContaining('scope="survey-documents:write"'),
      ]))
      expect(mockedDb.query).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('saves escaped user-approved content as a new draft only for an owned project', async () => {
    mockedDb.query.mockResolvedValueOnce({ rows: [{ id: REPORT_ID }] })
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey-documents:write'] })
    try {
      const result = await client.callTool({ name: 'create_report_draft', arguments: {
        project_id: PROJECT_ID,
        title: 'Drainage & Invert Notes',
        content: '<script>alert(1)</script>\nCheck the source readings before use.',
      } })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        report_id: REPORT_ID, project_id: PROJECT_ID, title: 'DRAFT — Drainage & Invert Notes', status: 'draft', revision: 'Draft 0',
        report_builder_url: `https://metardu.space/tools/survey-report-builder?projectId=${PROJECT_ID}&reportId=${REPORT_ID}`,
      })
      expect((result.structuredContent as { review_notice: string }).review_notice).toContain('unreviewed draft only')
      const [sql, params] = queryCall(0) as [string, unknown[]]
      expect(sql).toContain('FROM projects p WHERE p.id=$7 AND p.user_id=$2')
      expect(params[1]).toBe(USER_ID)
      const sections = JSON.parse(params[5] as string) as Array<{ content: string }>
      expect(sections[0]?.content).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(sections[0]?.content).not.toContain('<script>')
      expect(sections[0]?.content).toContain("not a surveyor's approval")
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('does not disclose or create a report for a project owned by someone else', async () => {
    mockedDb.query.mockResolvedValueOnce({ rows: [] })
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey-documents:write'] })
    try {
      const result = await client.callTool({ name: 'create_report_draft', arguments: {
        project_id: PROJECT_ID, title: 'Field note', content: 'Draft content supplied by the user.',
      } })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ type: string; text: string }>)[0]?.text).toBe('Project not found or not accessible to this account. No draft was saved.')
      expect(mockedDb.query).toHaveBeenCalledTimes(1)
      expect(queryCall(0)[0]).toContain('p.user_id=$2')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('reads only the connected user’s observation data and strips internal IDs and free-text columns', async () => {
    mockedDb.query
      .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID, name: 'Drainage Survey', survey_type: 'topographic', location: null, datum: 'Arc 1960', utm_zone: 37, hemisphere: 'south', reference_system: null }] })
      .mockResolvedValueOnce({ rows: [{
        id: '33333333-3333-4333-8333-333333333333', point_name: 'BM-01', observation_type: 'gnss',
        easting: 500000, northing: 9900000, elevation: 1772.4, latitude: null, longitude: null, accuracy: 0.02,
        satellites: 18, solution_type: 'fixed', hdop: 0.7, vdop: 1.2, pdop: 1.4,
        instrument_height: 1.8, rod_height: null, backsight: null, foresight: null, horizontal_angle: null,
        vertical_angle: null, slope_distance: null, temperature: null, pressure: null, humidity: null,
        horizontal_crs: 'EPSG:4326', vertical_datum: 'Receiver ellipsoidal height',
        fix_quality: 4, accuracy_source: 'receiver', observation_source: 'gnss_receiver',
        observed_at: null, client_id: 'private-device-key', notes: 'private free text',
      }] })
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey-data:read'] })
    try {
      const result = await client.callTool({ name: 'list_project_observations', arguments: { project_id: PROJECT_ID } })
      expect(result.isError).not.toBe(true)
      const output = result.structuredContent as { observations: Array<Record<string, unknown>>; project_id: string; next_cursor: string | null }
      expect(output.project_id).toBe(PROJECT_ID)
      expect(output.observations).toHaveLength(1)
      expect(output.observations[0]).toMatchObject({ point_name: 'BM-01', easting: 500000, elevation: 1772.4, solution_type: 'fixed' })
      expect(output.observations[0]).toMatchObject({
        horizontal_crs: 'EPSG:4326', vertical_datum: 'Receiver ellipsoidal height',
        fix_quality: 4, accuracy_source: 'receiver', observation_source: 'gnss_receiver',
      })
      expect(output.observations[0]).not.toHaveProperty('id')
      expect(output.observations[0]).not.toHaveProperty('client_id')
      expect(output.observations[0]).not.toHaveProperty('notes')
      expect(queryCall(0)[1]).toEqual([PROJECT_ID, USER_ID])
      expect(queryCall(1)[0]).toContain('p.user_id=$2')
      for (const column of ['horizontal_crs', 'vertical_datum', 'fix_quality', 'accuracy_source', 'observation_source']) {
        expect(queryCall(1)[0]).toContain(`o.${column}`)
      }
      expect(queryCall(1)[1]).toEqual([PROJECT_ID, USER_ID, null, 51])
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('leaves legacy observation reference and accuracy provenance unknown instead of inheriting the project grid', async () => {
    mockedDb.query
      .mockResolvedValueOnce({ rows: [{ id: PROJECT_ID, name: 'Legacy observations', survey_type: 'topographic', datum: 'Arc 1960', utm_zone: 37, hemisphere: 'south', reference_system: null }] })
      .mockResolvedValueOnce({ rows: [{ id: '33333333-3333-4333-8333-333333333333', point_name: 'Legacy-01', observation_type: 'gnss', horizontal_crs: null, vertical_datum: null, fix_quality: null, accuracy_source: null, observation_source: null }] })
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey-data:read'] })
    try {
      const result = await client.callTool({ name: 'list_project_observations', arguments: { project_id: PROJECT_ID } })
      expect(result.isError).not.toBe(true)
      const output = result.structuredContent as { observations: Array<Record<string, unknown>> }
      expect(output.observations[0]).toMatchObject({ horizontal_crs: null, vertical_datum: null, fix_quality: null, accuracy_source: null, observation_source: null })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('calculates a level book with METARDU’s engine and returns an explicit non-certification note', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    try {
      const result = await client.callTool({ name: 'compute_level_book', arguments: {
        opening_rl_m: 100, closing_rl_m: 101, distance_km: 0.2, method: 'rise_and_fall', allowable_misclosure_m: 0.002, tolerance_reference: 'Synthetic test specification',
        rows: [{ station: 'BM-01', bs_m: 1.5 }, { station: 'BM-02', fs_m: 0.5 }],
      } })
      expect(result.isError).not.toBe(true)
      const output = result.structuredContent as { checks: Record<string, number | boolean>; rows: Array<Record<string, unknown>>; note: string }
      expect(output.checks).toMatchObject({ arithmetic_consistent: true, closing_misclosure_m: 0, signed_closing_misclosure_m: 0, computed_closing_rl_m: 101, stated_closing_rl_m: 101, specified_allowable_misclosure_m: 0.002, within_specified_allowable_misclosure: true })
      expect(output.rows[0]).toMatchObject({ station: 'BM-01', rl_m: 100, height_of_collimation_m: 101.5 })
      expect(output.rows[1]).toMatchObject({ station: 'BM-02', rl_m: 101 })
      expect(output.note).toContain('not a surveyor’s approval or certification')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('does not silently apply a country tolerance when the caller omits the specification', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    try {
      const result = await client.callTool({ name: 'compute_level_book', arguments: {
        opening_rl_m: 100, closing_rl_m: 101, distance_km: 0.2, method: 'rise_and_fall',
        rows: [{ station: 'BM-01', bs_m: 1.5 }, { station: 'BM-02', fs_m: 0.5 }],
      } })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({ checks: { closing_misclosure_m: 0, specified_allowable_misclosure_m: null, within_specified_allowable_misclosure: null }, tolerance_reference: null })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects a level book without an opening backsight and closing foresight', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    try {
      const result = await client.callTool({ name: 'compute_level_book', arguments: {
        opening_rl_m: 100, closing_rl_m: 101, distance_km: 0.2, method: 'rise_and_fall',
        rows: [{ station: 'BM-01', fs_m: 0.5 }],
      } })
      expect(result.isError).toBe(true)
      expect((result.content as Array<{ type: string; text: string }>)[0]?.text).toContain('Invalid tool arguments')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('reduces a closed traverse without inventing an adopted accuracy standard', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    const observation = (station: string, backsight: string, foresight: string, left: number, right: number) => ({
      station, backsight, foresight,
      horizontal_circle_left: { degrees: left, minutes: 0, seconds: 0 },
      horizontal_circle_right: { degrees: right, minutes: 0, seconds: 0 },
      slope_distance_m: 100, zenith_angle: { degrees: 90, minutes: 0, seconds: 0 },
      instrument_height_m: 1.5, target_height_m: 1.5,
    })
    try {
      const result = await client.callTool({ name: 'compute_closed_traverse', arguments: {
        coordinate_reference: TEST_PROJECT_CRS,
        opening_easting: 1000, opening_northing: 2000, opening_station: 'A',
        closing_easting: 1000, closing_northing: 2000, closing_station: 'A',
        backsight_bearing: { degrees: 0, minutes: 0, seconds: 0 },
        observations: [
          observation('B', 'BS', 'C', 90, 270),
          observation('C', 'A', 'D', 270, 90),
          observation('D', 'B', 'A', 270, 90),
          observation('A', 'C', 'X', 270, 90),
        ],
      } })
      expect(result.isError).not.toBe(true)
      const output = result.structuredContent as { legs: Array<Record<string, unknown>>; coordinates: Array<Record<string, unknown>>; accuracy_classification: Record<string, unknown>; note: string }
      expect(output.legs).toHaveLength(4)
      expect(output.coordinates[1]).toMatchObject({ station: 'B', easting: 1100, northing: 2000 })
      expect(output.coordinates[1]).not.toHaveProperty('rl')
      expect(output).toMatchObject({ coordinate_reference: TEST_PROJECT_CRS, coordinate_reference_verified: false })
      expect(output.accuracy_classification).toMatchObject({ value: 'NOT ASSESSED', allowable_closing_error_mm: null })
      expect(output.accuracy_classification.basis).toContain('No adopted job criterion')
      expect(output.note).toContain('not a surveyor')
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('compares traverse closure only against an explicit paired limit and reference', () => {
    const request = {
      coordinate_reference: TEST_PROJECT_CRS,
      opening_easting: 0, opening_northing: 0, opening_station: 'A', closing_easting: 0, closing_northing: 100.002, closing_station: 'B',
      backsight_bearing: { degrees: 0, minutes: 0, seconds: 0 },
      allowable_misclosure_mm: 3, tolerance_reference: 'Synthetic specification 4',
      observations: [{ station: 'B', backsight: 'BACK', foresight: 'B', horizontal_circle_left: { degrees: 0, minutes: 0, seconds: 0 }, horizontal_circle_right: { degrees: 180, minutes: 0, seconds: 0 }, slope_distance_m: 100, zenith_angle: { degrees: 90, minutes: 0, seconds: 0 }, instrument_height_m: 0, target_height_m: 0 }],
    }
    expect(runTraverse(request).accuracy_classification).toMatchObject({ value: 'WITHIN STATED LIMIT', allowable_closing_error_mm: 3, basis: request.tolerance_reference })
    expect(() => runTraverse({ ...request, tolerance_reference: undefined })).toThrow()
    expect(runTraverse({ ...request, closing_northing: 100 }).closure.precision_ratio).toBeNull()
  })

  it('computes multi-point grid stakeout bearings, distances, and clockwise turns', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    try {
      const result = await client.callTool({ name: 'compute_stakeout', arguments: {
        coordinate_reference: TEST_PROJECT_CRS,
        setup_station: 'ST01', setup_easting_m: 1000, setup_northing_m: 2000,
        backsight_station: 'ST00', backsight_easting_m: 900, backsight_northing_m: 2000,
        targets: [
          { point_id: 'P-NORTH', easting_m: 1000, northing_m: 2100 },
          { point_id: 'P-EAST', easting_m: 1100, northing_m: 2000 },
        ],
      } })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        computation: 'grid_stakeout', coordinate_reference: TEST_PROJECT_CRS, coordinate_reference_verified: false,
        backsight: { grid_bearing_deg: 270 },
        targets: [
          { point_id: 'P-NORTH', grid_bearing_deg: 0, clockwise_turn_from_backsight_deg: 90, horizontal_distance_m: 100 },
          { point_id: 'P-EAST', grid_bearing_deg: 90, clockwise_turn_from_backsight_deg: 180, horizontal_distance_m: 100 },
        ],
      })
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects a stakeout target that has no direction from the setup station', async () => {
    const { client, server } = await connectedClient({ userId: USER_ID, scopes: ['survey:compute'] })
    try {
      const result = await client.callTool({ name: 'compute_stakeout', arguments: {
        coordinate_reference: TEST_PROJECT_CRS,
        setup_station: 'ST01', setup_easting_m: 1000, setup_northing_m: 2000,
        backsight_station: 'ST00', backsight_easting_m: 900, backsight_northing_m: 2000,
        targets: [{ point_id: 'ST01', easting_m: 1000, northing_m: 2000 }],
      } })
      expect(result.isError).toBe(true)
      expect(mockedDb.query).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await server.close()
    }
  })
})
