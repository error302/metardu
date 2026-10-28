const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: 'postgresql://metardu:JV3IexxVLcKdK6Cr0FOQ_R7O3ak_ptMt@localhost:5432/metardu'
  });
  
  // Try fallback connection strings if needed
  try {
    await c.connect();
  } catch  {
    console.log('Connecting with env or default failed, trying alternate...');
    const c2 = new Client({
      host: 'localhost',
      port: 5432,
      user: process.env.POSTGRES_USER || 'metardu',
      password: process.env.POSTGRES_PASSWORD || 'metardu_secure_2024',
      database: process.env.POSTGRES_DB || 'metardu'
    });
    await c2.connect();
    return runSeed(c2);
  }
  return runSeed(c);
}

async function runSeed(client) {
  console.log('Connected to Postgres');

  // 1. Seed/Update UX Test Boundary Survey
  const p1Id = 'de742cbc-c28c-42e3-8241-cff536ba0473';
  const p1Stations = [
    { pointName: 'MB-1', adjustedEasting: 256840.125, adjustedNorthing: 9851220.450, originalEasting: 256840.125, originalNorthing: 9851220.450 },
    { pointName: 'MB-2', adjustedEasting: 256985.340, adjustedNorthing: 9851210.120, originalEasting: 256985.340, originalNorthing: 9851210.120 },
    { pointName: 'MB-3', adjustedEasting: 256970.890, adjustedNorthing: 9851355.670, originalEasting: 256970.890, originalNorthing: 9851355.670 },
    { pointName: 'MB-4', adjustedEasting: 256830.450, adjustedNorthing: 9851340.230, originalEasting: 256830.450, originalNorthing: 9851340.230 },
  ];

  await client.query(`
    UPDATE projects 
    SET boundary_data = $1, utm_zone = 37, hemisphere = 'S', location = 'Westlands, Nairobi County'
    WHERE id = $2
  `, [JSON.stringify({ adjustedStations: p1Stations }), p1Id]);

  // Clean and insert points for P1
  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [p1Id]);
  for (const s of p1Stations) {
    await client.query(`
      INSERT INTO survey_points (project_id, name, easting, northing, elevation, is_control)
      VALUES ($1, $2, $3, $4, 1680.0, true)
    `, [p1Id, s.pointName, s.adjustedEasting, s.adjustedNorthing]);
  }
  console.log('P1 (UX Test Boundary Survey) seeded with 4 beacons & boundary_data');

  // 2. Seed/Update Admin Test Project
  const p2Id = '9d6d29d9-12c3-4dc7-8cf8-1da0d787c465';
  const p2Stations = [
    { pointName: 'BN-A', adjustedEasting: 260500.000, adjustedNorthing: 9852100.000, originalEasting: 260500.000, originalNorthing: 9852100.000 },
    { pointName: 'BN-B', adjustedEasting: 260620.000, adjustedNorthing: 9852100.000, originalEasting: 260620.000, originalNorthing: 9852100.000 },
    { pointName: 'BN-C', adjustedEasting: 260620.000, adjustedNorthing: 9852235.000, originalEasting: 260620.000, originalNorthing: 9852235.000 },
    { pointName: 'BN-D', adjustedEasting: 260500.000, adjustedNorthing: 9852235.000, originalEasting: 260500.000, originalNorthing: 9852235.000 },
  ];

  await client.query(`
    UPDATE projects 
    SET boundary_data = $1, utm_zone = 37, hemisphere = 'S', location = 'Kiambu 4-Acre Agricultural Subdivision'
    WHERE id = $2
  `, [JSON.stringify({ adjustedStations: p2Stations }), p2Id]);

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [p2Id]);
  for (const s of p2Stations) {
    await client.query(`
      INSERT INTO survey_points (project_id, name, easting, northing, elevation, is_control)
      VALUES ($1, $2, $3, $4, 1650.0, true)
    `, [p2Id, s.pointName, s.adjustedEasting, s.adjustedNorthing]);
  }
  await client.query(`
    INSERT INTO survey_points (project_id, name, easting, northing, elevation, is_control)
    VALUES ($1, 'CP-1', 260560.000, 9852167.500, 1649.8, true)
  `, [p2Id]);
  console.log('P2 (Admin Test Project) seeded with 5 beacons & boundary_data');

  // 3. Seed/Update E2E Traverse Project
  const p3Id = '1ffeea03-4fca-4bb6-82c7-4def37635e04';
  const p3Stations = [
    { pointName: 'TR-01', adjustedEasting: 255100.200, adjustedNorthing: 9860100.300, originalEasting: 255100.200, originalNorthing: 9860100.300 },
    { pointName: 'TR-02', adjustedEasting: 255250.450, adjustedNorthing: 9860120.600, originalEasting: 255250.450, originalNorthing: 9860120.600 },
    { pointName: 'TR-03', adjustedEasting: 255300.800, adjustedNorthing: 9860300.100, originalEasting: 255300.800, originalNorthing: 9860300.100 },
    { pointName: 'TR-04', adjustedEasting: 255140.150, adjustedNorthing: 9860280.900, originalEasting: 255140.150, originalNorthing: 9860280.900 },
  ];

  await client.query(`
    UPDATE projects 
    SET boundary_data = $1, utm_zone = 37, hemisphere = 'S', location = 'Thika Road Corridor, Ruiru'
    WHERE id = $2
  `, [JSON.stringify({ adjustedStations: p3Stations }), p3Id]);

  await client.query(`DELETE FROM survey_points WHERE project_id = $1`, [p3Id]);
  for (const s of p3Stations) {
    await client.query(`
      INSERT INTO survey_points (project_id, name, easting, northing, elevation, is_control)
      VALUES ($1, $2, $3, $4, 1620.0, true)
    `, [p3Id, s.pointName, s.adjustedEasting, s.adjustedNorthing]);
  }
  console.log('P3 (E2E Traverse Project) seeded with 4 beacons & boundary_data');

  await client.end();
  console.log('All sample projects enriched successfully!');
}

main().catch(err => {
  console.error('Error running seed:', err);
  process.exit(1);
});
