import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://metardu:JV3IexxVLcKdK6Cr0FOQ_R7O3ak_ptMt@localhost:5432/metardu'

const DOSHO_USER_ID = '5a278317-81db-4db9-b9b6-d5f8ca10ec38'

async function seed() {
  console.log('Connecting to PostgreSQL database...')
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  console.log('Seeding Mohamed Dosho survey projects across 6 disciplines...')

  // 1. Cadastral Boundary Survey (LR 209/14582)
  const cadastralId = 'de742cbc-c28c-42e3-8241-cff536ba0473'
  const cadastralBeacons = [
    { pointName: 'MB1', adjustedEasting: 257410.25, adjustedNorthing: 9857210.40, originalEasting: 257410.25, originalNorthing: 9857210.40 },
    { pointName: 'MB2', adjustedEasting: 257560.80, adjustedNorthing: 9857245.10, originalEasting: 257560.80, originalNorthing: 9857245.10 },
    { pointName: 'MB3', adjustedEasting: 257615.30, adjustedNorthing: 9857115.80, originalEasting: 257615.30, originalNorthing: 9857115.80 },
    { pointName: 'MB4', adjustedEasting: 257480.10, adjustedNorthing: 9857020.50, originalEasting: 257480.10, originalNorthing: 9857020.50 },
    { pointName: 'MB5', adjustedEasting: 257390.65, adjustedNorthing: 9857120.30, originalEasting: 257390.65, originalNorthing: 9857120.30 },
  ]

  await client.query(`
    INSERT INTO projects (id, user_id, name, lr_number, client_name, surveyor_name, surveyor_license, area_sqm, area_ha, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked, boundary_data)
    VALUES ($1, $2, 'LR 209/14582 Boundary Survey', 'LR 209/14582', 'Upper Hill Commercial Holdings Ltd', 'Mohamed Dosho', 'MISK / Reg. Surveyor', 31852.0, 3.1852, 'cadastral', 'small', 'Nairobi, Upper Hill', 37, 'S', 3, 6, $3)
    ON CONFLICT (id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      name = EXCLUDED.name,
      lr_number = EXCLUDED.lr_number,
      client_name = EXCLUDED.client_name,
      surveyor_name = EXCLUDED.surveyor_name,
      surveyor_license = EXCLUDED.surveyor_license,
      area_sqm = EXCLUDED.area_sqm,
      area_ha = EXCLUDED.area_ha,
      survey_type = EXCLUDED.survey_type,
      boundary_data = EXCLUDED.boundary_data,
      workflow_max_unlocked = 6;
  `, [cadastralId, DOSHO_USER_ID, JSON.stringify({ adjustedStations: cadastralBeacons, stations: cadastralBeacons })])

  // Insert Cadastral survey points
  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [cadastralId])
  for (const b of cadastralBeacons) {
    await client.query(`
      INSERT INTO survey_points (project_id, point_name, name, easting, northing, elevation, code)
      VALUES ($1, $2::varchar, $2::text, $3, $4, 1680.0, 'BEACON')
    `, [cadastralId, b.pointName, b.adjustedEasting, b.adjustedNorthing])
  }

  // Insert Cadastral Fieldbook entries
  await client.query(`DELETE FROM project_fieldbook_entries WHERE project_id = $1`, [cadastralId])
  const cadastralFieldbook = [
    { row_index: 0, station: 'MB2', bearing: 77.0207, distance: 154.497, raw: { fromStation: 'MB1', toStation: 'MB2', station: 'MB2', bearing: 77.0207, distance: 154.497, slopeDistance: 154.497 } },
    { row_index: 1, station: 'MB3', bearing: 157.1446, distance: 140.317, raw: { fromStation: 'MB2', toStation: 'MB3', station: 'MB3', bearing: 157.1446, distance: 140.317, slopeDistance: 140.317 } },
    { row_index: 2, station: 'MB4', bearing: 234.8207, distance: 165.412, raw: { fromStation: 'MB3', toStation: 'MB4', station: 'MB4', bearing: 234.8207, distance: 165.412, slopeDistance: 165.412 } },
    { row_index: 3, station: 'MB5', bearing: 318.1304, distance: 134.020, raw: { fromStation: 'MB4', toStation: 'MB5', station: 'MB5', bearing: 318.1304, distance: 134.020, slopeDistance: 134.020 } },
    { row_index: 4, station: 'MB1', bearing: 12.2727, distance: 92.207, raw: { fromStation: 'MB5', toStation: 'MB1', station: 'MB1', bearing: 12.2727, distance: 92.207, slopeDistance: 92.207 } },
  ]
  for (const e of cadastralFieldbook) {
    await client.query(`
      INSERT INTO project_fieldbook_entries (project_id, row_index, station, bearing, distance, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [cadastralId, e.row_index, e.station, e.bearing, e.distance, JSON.stringify(e.raw)])
  }

  // 2. Engineering Levelling Project
  const engineeringId = 'a1111111-1111-4111-8111-111111111111'
  await client.query(`
    INSERT INTO projects (id, user_id, name, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked)
    VALUES ($1, $2, 'Ngong-Suswa Road Access Levelling', 'engineering', 'small', 'Kajiado County', 37, 'S', 2, 6)
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, workflow_max_unlocked = 6;
  `, [engineeringId, DOSHO_USER_ID])

  // Insert Engineering Levelling Fieldbook Entries
  await client.query(`DELETE FROM project_fieldbook_entries WHERE project_id = $1`, [engineeringId])
  const levelEntries = [
    { idx: 0, station: 'BM1', bs: 1.452, is: null, fs: null, rl: 1750.000, remark: 'Opening Benchmark SoK Primary' },
    { idx: 1, station: 'CH 0+000', bs: null, is: 1.620, fs: null, rl: 1749.832, remark: 'Start of access road' },
    { idx: 2, station: 'CH 0+100', bs: null, is: 1.845, fs: null, rl: 1749.607, remark: 'Culvert inlet profile' },
    { idx: 3, station: 'CH 0+200', bs: null, is: 2.110, fs: null, rl: 1749.342, remark: 'Natural ground change' },
    { idx: 4, station: 'CP1', bs: 0.985, is: null, fs: 2.450, rl: 1749.002, remark: 'Change Point on peg' },
    { idx: 5, station: 'CH 0+300', bs: null, is: 1.320, fs: null, rl: 1748.667, remark: 'Bridge approach slope' },
    { idx: 6, station: 'CH 0+400', bs: null, is: 1.540, fs: null, rl: 1748.447, remark: 'Bridge abutment base' },
    { idx: 7, station: 'BM2', bs: null, is: null, fs: 1.825, rl: 1748.162, remark: 'Closing Benchmark (Check)' },
  ]
  for (const e of levelEntries) {
    const rawData = {
      station: e.station,
      bs: e.bs !== null ? String(e.bs) : '',
      is: e.is !== null ? String(e.is) : '',
      fs: e.fs !== null ? String(e.fs) : '',
      rl: e.rl !== null ? String(e.rl) : '',
      remark: e.remark,
    }
    await client.query(`
      INSERT INTO project_fieldbook_entries (project_id, row_index, station, bs, remark, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [engineeringId, e.idx, e.station, e.bs, e.remark, JSON.stringify(rawData)])
  }

  // 3. Topographic Survey Project
  const topoId = 'b2222222-2222-4222-8222-222222222222'
  await client.query(`
    INSERT INTO projects (id, user_id, name, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked)
    VALUES ($1, $2, 'Kitengela Commercial Hub Topo Survey', 'topographic', 'small', 'Kitengela', 37, 'S', 2, 6)
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, workflow_max_unlocked = 6;
  `, [topoId, DOSHO_USER_ID])

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [topoId])
  const topoPoints = [
    { name: 'T1', e: 265100.0, n: 9832100.0, z: 1540.20, code: 'CP' },
    { name: 'T2', e: 265250.0, n: 9832120.0, z: 1541.50, code: 'CP' },
    { name: 'S1', e: 265120.0, n: 9832130.0, z: 1540.80, code: 'SPOT' },
    { name: 'S2', e: 265160.0, n: 9832150.0, z: 1541.10, code: 'SPOT' },
    { name: 'S3', e: 265200.0, n: 9832140.0, z: 1541.80, code: 'SPOT' },
    { name: 'S4', e: 265220.0, n: 9832080.0, z: 1540.90, code: 'SPOT' },
    { name: 'S5', e: 265150.0, n: 9832060.0, z: 1539.95, code: 'DRAIN' },
  ]
  for (const p of topoPoints) {
    await client.query(`
      INSERT INTO survey_points (project_id, point_name, name, easting, northing, elevation, code)
      VALUES ($1, $2::varchar, $2::text, $3, $4, $5, $6)
    `, [topoId, p.name, p.e, p.n, p.z, p.code])
  }

  // 4. Geodetic Control Network Project
  const geodeticId = 'c3333333-3333-4333-8333-333333333333'
  await client.query(`
    INSERT INTO projects (id, user_id, name, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked)
    VALUES ($1, $2, 'Great Rift Valley Geodetic Control Network', 'geodetic', 'small', 'Naivasha', 37, 'S', 2, 6)
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, workflow_max_unlocked = 6;
  `, [geodeticId, DOSHO_USER_ID])

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [geodeticId])
  const geodPoints = [
    { name: 'KMNM_REF', e: 211540.23, n: 9912400.12, z: 1890.45, code: 'CORS' },
    { name: 'RUID_REF', e: 245100.80, n: 9890120.45, z: 1720.10, code: 'CORS' },
    { name: 'P_CTRL_01', e: 228400.15, n: 9901500.60, z: 1810.30, code: 'PRIM_CTRL' },
    { name: 'P_CTRL_02', e: 232150.40, n: 9897800.25, z: 1795.80, code: 'PRIM_CTRL' },
  ]
  for (const p of geodPoints) {
    await client.query(`
      INSERT INTO survey_points (project_id, point_name, name, easting, northing, elevation, code)
      VALUES ($1, $2::varchar, $2::text, $3, $4, $5, $6)
    `, [geodeticId, p.name, p.e, p.n, p.z, p.code])
  }

  // 5. Drone Photogrammetry Project
  const droneId = 'd4444444-4444-4444-8444-444444444444'
  await client.query(`
    INSERT INTO projects (id, user_id, name, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked)
    VALUES ($1, $2, 'Athi River Quarry UAV Photogrammetry', 'drone', 'small', 'Athi River', 37, 'S', 2, 6)
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, workflow_max_unlocked = 6;
  `, [droneId, DOSHO_USER_ID])

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [droneId])
  const gcps = [
    { name: 'GCP_01', e: 270100.25, n: 9830100.40, z: 1510.20, code: 'GCP' },
    { name: 'GCP_02', e: 270450.10, n: 9830180.15, z: 1515.60, code: 'GCP' },
    { name: 'GCP_03', e: 270500.80, n: 9829800.70, z: 1508.40, code: 'GCP' },
    { name: 'GCP_04', e: 270150.40, n: 9829750.25, z: 1502.10, code: 'GCP' },
  ]
  for (const p of gcps) {
    await client.query(`
      INSERT INTO survey_points (project_id, point_name, name, easting, northing, elevation, code)
      VALUES ($1, $2::varchar, $2::text, $3, $4, $5, $6)
    `, [droneId, p.name, p.e, p.n, p.z, p.code])
  }

  // 6. Deformation Monitoring Project
  const deformId = 'e5555555-5555-4555-8555-555555555555'
  await client.query(`
    INSERT INTO projects (id, user_id, name, survey_type, project_type, location, utm_zone, hemisphere, workflow_step, workflow_max_unlocked)
    VALUES ($1, $2, 'Thika Dam Crest Deformation Monitoring', 'deformation', 'small', 'Muranga', 37, 'S', 2, 6)
    ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, workflow_max_unlocked = 6;
  `, [deformId, DOSHO_USER_ID])

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [deformId])
  const deformPoints = [
    { name: 'MON_P1', e: 281400.12, n: 9895200.45, z: 1650.10, code: 'PILLAR' },
    { name: 'MON_P2', e: 281480.30, n: 9895215.10, z: 1650.05, code: 'PILLAR' },
    { name: 'MON_P3', e: 281560.55, n: 9895220.80, z: 1649.98, code: 'PILLAR' },
  ]
  for (const p of deformPoints) {
    await client.query(`
      INSERT INTO survey_points (project_id, point_name, name, easting, northing, elevation, code)
      VALUES ($1, $2::varchar, $2::text, $3, $4, $5, $6)
    `, [deformId, p.name, p.e, p.n, p.z, p.code])
  }

  console.log('Seeding completed successfully for all 6 disciplines!')
  await client.end()
}

seed().catch(err => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
