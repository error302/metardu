import assert from 'node:assert/strict'
export const EXPECTED_CASES = 29
export async function verifySchemeViews(context) {
  const {
    check,
    pool,
    actor,
    other,
    project,
    secondProject,
    parcel,
    traverse,
    points,
    command,
    save,
    report,
    require,
    randomUUID,
  } = context
  const { GET } = require('../src/app/api/scheme/map/route.ts'),
    { NextRequest } = require('next/server'),
    { readSchemeSelection } = require('../src/lib/scheme/readSchemeView.ts')
  const bbox = [499900, 9499900, 500100, 9500100]
  const get = (query = {}, user = actor, id = project) =>
    GET(
      new NextRequest(
        `http://127.0.0.1:3021/api/scheme/map?${new URLSearchParams({ project_id: id, ...query })}`,
      ),
      user,
      id,
    )
  const view = (user = actor, id = project) =>
    get({ bbox: bbox.join(','), cellSize: '20' }, user, id)
  const json = async (response) => {
    assert.equal(response.status, 200, await response.clone().text())
    return response.json()
  }
  const reviewed = async () => {
    const result = await save(await command())
    assert.equal(result.status, 200, await result.clone().text())
    return (await result.json()).data
  }
  const raw = () =>
    pool.query(
      'UPDATE parcels SET geom=public.ST_MakeEnvelope(500000,9500000,500010,9500020,32737) WHERE id=$1',
      [parcel],
    )
  const bulk = async (size) => {
    await pool.query(
      "INSERT INTO parcels(id,project_id,parcel_number,status,updated_at,geom) SELECT gen_random_uuid(),$1,'SYN-'||i,'pending',NOW(),public.ST_MakeEnvelope((i%100)*10,(i/100)*10,(i%100)*10+1,(i/100)*10+1,32737) FROM generate_series(0,$2::int-1) i",
      [project, size],
    )
  }
  await pool.query(
    'CREATE INDEX fixture_parcel_geom_gist ON parcels USING GIST(geom);CREATE INDEX fixture_parcel_project ON parcels(project_id);CREATE INDEX fixture_coord_parent ON traverse_coordinates(traverse_id);CREATE INDEX fixture_obs_parent ON traverse_observations(traverse_id)',
  )
  await check(
    'map requires an explicit extent or bounded viewport and refuses duplicate scope',
    async () => {
      assert.equal((await get()).status, 400)
      assert.equal((await get({ bbox: '0,0,1,1', cellSize: '0' })).status, 400)
      assert.equal(
        (
          await GET(
            new NextRequest(
              `http://127.0.0.1:3021/api/scheme/map?project_id=${project}&project_id=${secondProject}&mode=extent`,
            ),
            actor,
            project,
          )
        ).status,
        400,
      )
    },
  )
  await check('map extent and viewport are owner-bound', async () => {
    assert.equal((await get({ mode: 'extent' }, other)).status, 404)
    assert.equal((await view(other)).status, 404)
    assert.equal((await get({ mode: 'extent' }, null)).status, 401)
  })
  await check(
    'computed stations without stored geometry do not manufacture a parcel',
    async () => {
      const extent = await json(await get({ mode: 'extent' }))
      assert.equal(extent.totalParcels, 1)
      assert.equal(extent.missingGeometry, 1)
      assert.equal(extent.geometryRecords, 0)
      assert.equal(extent.extent, null)
      const payload = await json(await view())
      assert.equal(payload.matchingRecords, 0)
      assert.deepEqual(payload.features, [])
    },
  )
  await check(
    'map reads the exact reviewed geometry rather than station-name order',
    async () => {
      const receipt = await reviewed(),
        payload = await json(await view())
      assert.equal(payload.mode, 'polygons')
      assert.equal(payload.features.length, 1)
      const feature = payload.features[0]
      assert.deepEqual(feature.geometry, receipt.polygon)
      assert.equal(feature.properties.evidenceState, 'reviewed_draft')
      assert.equal(feature.properties.canSnap, true)
      assert.equal(feature.properties.receiptId, receipt.receiptId)
      assert.equal(feature.properties.gridAreaSqM, 200)
      assert.equal(feature.properties.assessment, 'unverified')
      assert.equal(payload.crs, 'EPSG:32737')
    },
  )
  for (const mutation of [
    'coordinate',
    'coordinate_insert',
    'coordinate_delete',
    'observation_insert',
    'traverse',
    'reference',
    'parcel',
    'geometry',
  ])
    await check(
      `map invalidates review after ${mutation} changes`,
      async () => {
        await reviewed()
        if (mutation === 'coordinate')
          await pool.query(
            'UPDATE traverse_coordinates SET easting=easting+1 WHERE id=$1',
            [points[0]],
          )
        if (mutation === 'coordinate_insert')
          await pool.query(
            'INSERT INTO traverse_coordinates(id,traverse_id,easting,northing) VALUES($1,$2,1,1)',
            [randomUUID(), traverse],
          )
        if (mutation === 'coordinate_delete')
          await pool.query('DELETE FROM traverse_coordinates WHERE id=$1', [
            points[0],
          ])
        if (mutation === 'observation_insert')
          await pool.query(
            'INSERT INTO traverse_observations(traverse_id,distance) VALUES($1,10)',
            [traverse],
          )
        if (mutation === 'traverse')
          await pool.query(
            'UPDATE parcel_traverses SET version=version+1 WHERE id=$1',
            [traverse],
          )
        if (mutation === 'reference')
          await pool.query(
            "UPDATE project_reference_systems SET notes='SYNTHETIC changed calibration evidence' WHERE project_id=$1",
            [project],
          )
        if (mutation === 'parcel')
          await pool.query(
            "UPDATE parcels SET parcel_number='SYN-NEW' WHERE id=$1",
            [parcel],
          )
        if (mutation === 'geometry')
          await pool.query(
            'UPDATE parcels SET geom=public.ST_Translate(geom,1,0) WHERE id=$1',
            [parcel],
          )
        const payload = await json(await view())
        assert.equal(
          payload.features[0].properties.evidenceState,
          'changed_since_review',
        )
        assert.equal(payload.features[0].properties.canSnap, false)
      },
    )
  for (const crs of ['', 'EPSG:3857', 'EPSG:4326', 'EPSG:999999'])
    await check(
      `map refuses undeclared/display/geographic/unregistered reference ${crs || 'empty'}`,
      async () => {
        await pool.query(
          'UPDATE project_reference_systems SET horizontal_crs=$1 WHERE project_id=$2',
          [crs, project],
        )
        assert.equal((await get({ mode: 'extent' })).status, 409)
        assert.equal((await view()).status, 409)
      },
    )
  await check(
    'stored geometry in another reference is counted and hidden rather than relabelled',
    async () => {
      await reviewed()
      await pool.query(
        "UPDATE project_reference_systems SET horizontal_crs='EPSG:21037' WHERE project_id=$1",
        [project],
      )
      const extent = await json(await get({ mode: 'extent' }))
      assert.equal(extent.geometryRecords, 0)
      assert.equal(extent.otherReferenceRecords, 1)
      assert.equal(extent.extent, null)
      const payload = await json(await view())
      assert.equal(payload.features.length, 0)
    },
  )
  await check(
    'legacy stored geometry is explicitly unassessed and not snappable',
    async () => {
      await raw()
      const payload = await json(await view())
      assert.equal(
        payload.features[0].properties.evidenceState,
        'unassessed_geometry',
      )
      assert.equal(payload.features[0].properties.canSnap, false)
      assert.equal(payload.features[0].properties.receiptId, null)
      assert.equal(payload.features[0].properties.suppliedAreaHa, null)
    },
  )
  await check(
    'absent review storage preserves unassessed map reads',
    async () => {
      await raw()
      await pool.query(
        'ALTER TABLE parcel_boundary_drafts RENAME TO fixture_map_unavailable_history',
      )
      try {
        const payload = await json(await view())
        assert.equal(payload.history, 'unavailable')
        assert.equal(
          payload.features[0].properties.evidenceState,
          'unassessed_geometry',
        )
        assert.equal(payload.features[0].properties.canSnap, false)
      } finally {
        await pool.query(
          'ALTER TABLE fixture_map_unavailable_history RENAME TO parcel_boundary_drafts',
        )
      }
    },
  )
  await check(
    'invalid stored rings are omitted with an explicit partial count',
    async () => {
      await pool.query(
        "UPDATE parcels SET geom=public.ST_GeomFromText('POLYGON((500000 9500000,500010 9500020,500010 9500000,500000 9500020,500000 9500000))',32737) WHERE id=$1",
        [parcel],
      )
      const payload = await json(await view())
      assert.equal(payload.matchingRecords, 1)
      assert.equal(payload.representedRecords, 0)
      assert.equal(payload.omittedRecords, 1)
      assert.equal(payload.partial, true)
    },
  )
  await check(
    'oversized single geometry is refused for the bounded outline window',
    async () => {
      await pool.query(
        "UPDATE parcels SET geom=public.ST_Buffer(public.ST_SetSRID(public.ST_MakePoint(500000,9500000),32737),10,'quad_segs=1500') WHERE id=$1",
        [parcel],
      )
      const payload = await json(await view())
      assert.equal(payload.features.length, 0)
      assert.equal(payload.omittedRecords, 1)
      assert.equal(payload.partial, true)
    },
  )
  await check(
    '10000 stored polygons use count-bearing groups with bounded transport',
    async () => {
      await bulk(10000)
      const extent = await json(await get({ mode: 'extent' }))
      assert.equal(extent.totalParcels, 10001)
      assert.equal(extent.geometryRecords, 10000)
      const response = await get({ bbox: '0,0,1000,1000', cellSize: '100' }),
        payload = await json(response)
      assert.equal(payload.mode, 'density')
      assert.equal(payload.matchingRecords, 10000)
      assert.equal(payload.representedRecords, 10000)
      assert.equal(payload.features.length, 100)
      assert.equal(payload.partial, false)
      for (const feature of payload.features) {
        assert.equal(feature.properties.displayOnly, true)
        assert.equal(feature.properties.kind, 'density')
        assert.equal('parcelId' in feature.properties, false)
        assert.equal('easting' in feature.properties, false)
      }
      report.mapProfile = {
        synthetic: true,
        storedPolygons: 10000,
        groups: payload.features.length,
        represented: payload.representedRecords,
        responseBytes: Buffer.byteLength(JSON.stringify(payload)),
      }
      assert.ok(report.mapProfile.responseBytes < 65000)
    },
  )
  await check(
    'density display cap reports every omitted record explicitly',
    async () => {
      await bulk(10000)
      const payload = await json(
        await get({ bbox: '0,0,1000,1000', cellSize: '10' }),
      )
      assert.equal(payload.features.length, 500)
      assert.equal(payload.matchingRecords, 10000)
      assert.equal(payload.representedRecords, 500)
      assert.equal(payload.omittedRecords, 9500)
      assert.equal(payload.partial, true)
    },
  )
  await check(
    '50 shapes remain individual geometry and the next shape switches to density',
    async () => {
      await bulk(50)
      const one = await json(
        await get({ bbox: '0,0,1000,1000', cellSize: '100' }),
      )
      assert.equal(one.mode, 'polygons')
      assert.equal(one.features.length, 50)
      await pool.query(
        "INSERT INTO parcels(id,project_id,parcel_number,status,updated_at,geom) VALUES($1,$2,'SYN-51','pending',NOW(),public.ST_MakeEnvelope(1,1,2,2,32737))",
        [randomUUID(), project],
      )
      const many = await json(
        await get({ bbox: '0,0,1000,1000', cellSize: '100' }),
      )
      assert.equal(many.mode, 'density')
      assert.equal(many.representedRecords, 51)
    },
  )
  await check(
    'explicit owned geometry selection is exact and is not a viewport substitute',
    async () => {
      await reviewed()
      const payload = await readSchemeSelection(actor, project, [parcel])
      assert.equal(payload.bbox, null)
      assert.deepEqual(payload.selection, [parcel])
      assert.equal(payload.features[0].id, parcel)
      assert.equal(
        payload.features[0].properties.evidenceState,
        'reviewed_draft',
      )
    },
  )
  await check(
    'an incomplete or foreign geometry selection never returns a partial export set',
    async () => {
      await reviewed()
      await assert.rejects(
        readSchemeSelection(actor, project, [parcel, randomUUID()]),
        (error) => error.statusCode === 409,
      )
      await assert.rejects(
        readSchemeSelection(other, project, [parcel]),
        (error) => error.statusCode === 404,
      )
      await assert.rejects(
        readSchemeSelection(actor, project, [parcel, parcel]),
        (error) => error.statusCode === 400,
      )
    },
  )
  await check(
    'reference fingerprint changes even when the EPSG code does not',
    async () => {
      const first = await json(await get({ mode: 'extent' }))
      await pool.query(
        "UPDATE project_reference_systems SET notes='SYNTHETIC different basis' WHERE project_id=$1",
        [project],
      )
      const second = await json(await get({ mode: 'extent' }))
      assert.equal(first.crs, second.crs)
      assert.notEqual(first.referenceHash, second.referenceHash)
    },
  )
  await check(
    'source read failures remain errors rather than empty successful views',
    async () => {
      await reviewed()
      await pool.query(
        'ALTER TABLE traverse_coordinates RENAME TO fixture_map_unavailable_coordinates',
      )
      try {
        const response = await view()
        assert.equal(response.status, 500)
        const payload = await response.json()
        assert.equal('features' in payload, false)
      } finally {
        await pool.query(
          'ALTER TABLE fixture_map_unavailable_coordinates RENAME TO traverse_coordinates',
        )
      }
    },
  )
  await check(
    'foreign block metadata is not disclosed through an inconsistent parcel link',
    async () => {
      await raw()
      const block = randomUUID()
      await pool.query("INSERT INTO blocks VALUES($1,$2,'SYN-FOREIGN')", [
        block,
        secondProject,
      ])
      await pool.query('UPDATE parcels SET block_id=$1 WHERE id=$2', [
        block,
        parcel,
      ])
      const payload = await json(await view())
      assert.equal(payload.features[0].properties.blockId, null)
      assert.equal(payload.features[0].properties.blockNumber, null)
    },
  )
}
