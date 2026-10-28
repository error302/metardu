import assert from 'node:assert/strict'

// Keep the pre-upgrade column catalog: newly added fields must not obscure a
// change to an original value. Only aggregate fingerprints leave the database.
export const RELEASE_PRESERVED_TABLES = Object.freeze(['setout_points', 'setout_observations', 'verticality_readings', 'user_consents', 'surveyor_profiles', 'road_alignments', 'alignment_ips', 'alignment_vertical_ips', 'cross_section_stations', 'observation_batches', 'survey_points', 'import_sessions', 'survey_observations', 'field_photos', 'users', 'projects', 'blocks', 'parcels', 'parcel_traverses', 'traverse_coordinates', 'traverse_observations', 'fieldbooks'])

export async function snapshotExistingRows(client, catalog) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const tables = catalog || (await client.query(`SELECT table_name AS name,array_agg(column_name::text ORDER BY ordinal_position) AS columns
      FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])
      GROUP BY table_name ORDER BY table_name`, [RELEASE_PRESERVED_TABLES])).rows
    assert.deepEqual(new Set(tables.map(table => table.name)), new Set(RELEASE_PRESERVED_TABLES), 'The original-data snapshot must cover every retained workflow table.')
    assert.equal(tables.length, RELEASE_PRESERVED_TABLES.length)
    const rows = []
    for (const table of tables) {
      assert.ok(RELEASE_PRESERVED_TABLES.includes(table.name))
      assert.ok(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.every(column => typeof column === 'string'))
      const result = await client.query(`SELECT count(*)::integer AS rows,
        md5(COALESCE(string_agg(md5(payload::text),'' ORDER BY md5(payload::text)),'')) AS fingerprint
        FROM (SELECT (SELECT jsonb_object_agg(j.key,CASE ${table.name === 'road_alignments' ? "WHEN j.key='cross_section_template' THEN t.cross_section_template::text::jsonb" : ''} WHEN jsonb_typeof(j.value)='number'
          THEN to_jsonb(trim_scale((j.value #>> '{}')::numeric)) ELSE j.value END ORDER BY j.key)
          FROM jsonb_each(to_jsonb(t)) j WHERE j.key=ANY($1::text[])) AS payload
          FROM public."${table.name}" t) normalized`, [table.columns])
      rows.push({ name: table.name, ...result.rows[0] })
    }
    await client.query('COMMIT')
    return { catalog: tables, rows }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
