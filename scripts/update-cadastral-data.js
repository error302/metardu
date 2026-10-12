const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://metardu:JV3IexxVLcKdK6Cr0FOQ_R7O3ak_ptMt@localhost:5432/metardu';

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log('1. Deleting duplicate project 2bab16b2-42ea-4407-a95a-8823c46ec660...');
  await client.query(`DELETE FROM projects WHERE id = '2bab16b2-42ea-4407-a95a-8823c46ec660'`);

  console.log('2. Updating LR 209/14582 project metadata...');
  const cadastralBeacons = [
    { pointName: 'MB1', adjustedEasting: 257410.25, adjustedNorthing: 9857210.40, originalEasting: 257410.25, originalNorthing: 9857210.40 },
    { pointName: 'MB2', adjustedEasting: 257560.80, adjustedNorthing: 9857245.10, originalEasting: 257560.80, originalNorthing: 9857245.10 },
    { pointName: 'MB3', adjustedEasting: 257615.30, adjustedNorthing: 9857115.80, originalEasting: 257615.30, originalNorthing: 9857115.80 },
    { pointName: 'MB4', adjustedEasting: 257480.10, adjustedNorthing: 9857020.50, originalEasting: 257480.10, originalNorthing: 9857020.50 },
    { pointName: 'MB5', adjustedEasting: 257390.65, adjustedNorthing: 9857120.30, originalEasting: 257390.65, originalNorthing: 9857120.30 },
  ];

  await client.query(`
    UPDATE projects SET
      lr_number = 'LR 209/14582',
      client_name = 'Upper Hill Commercial Holdings Ltd',
      surveyor_name = 'Mohamed Dosho',
      surveyor_license = 'MISK / Reg. Surveyor',
      area_sqm = 31852.0,
      area_ha = 3.1852,
      workflow_step = 3,
      workflow_max_unlocked = 6,
      boundary_data = $1
    WHERE id = 'de742cbc-c28c-42e3-8241-cff536ba0473'
  `, [JSON.stringify({ adjustedStations: cadastralBeacons, stations: cadastralBeacons })]);

  console.log('3. Seeding fieldbook entries for de742cbc-c28c-42e3-8241-cff536ba0473...');
  await client.query(`DELETE FROM project_fieldbook_entries WHERE project_id = 'de742cbc-c28c-42e3-8241-cff536ba0473'`);

  const entries = [
    { row_index: 0, station: 'MB2', bearing: 77.0207, distance: 154.497, raw: { fromStation: 'MB1', toStation: 'MB2', station: 'MB2', bearing: 77.0207, distance: 154.497, slopeDistance: 154.497 } },
    { row_index: 1, station: 'MB3', bearing: 157.1446, distance: 140.317, raw: { fromStation: 'MB2', toStation: 'MB3', station: 'MB3', bearing: 157.1446, distance: 140.317, slopeDistance: 140.317 } },
    { row_index: 2, station: 'MB4', bearing: 234.8207, distance: 165.412, raw: { fromStation: 'MB3', toStation: 'MB4', station: 'MB4', bearing: 234.8207, distance: 165.412, slopeDistance: 165.412 } },
    { row_index: 3, station: 'MB5', bearing: 318.1304, distance: 134.020, raw: { fromStation: 'MB4', toStation: 'MB5', station: 'MB5', bearing: 318.1304, distance: 134.020, slopeDistance: 134.020 } },
    { row_index: 4, station: 'MB1', bearing: 12.2727, distance: 92.207, raw: { fromStation: 'MB5', toStation: 'MB1', station: 'MB1', bearing: 12.2727, distance: 92.207, slopeDistance: 92.207 } },
  ];

  for (const e of entries) {
    await client.query(`
      INSERT INTO project_fieldbook_entries (project_id, row_index, station, bearing, distance, raw_data)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['de742cbc-c28c-42e3-8241-cff536ba0473', e.row_index, e.station, e.bearing, e.distance, JSON.stringify(e.raw)]);
  }

  console.log('✅ Cadastral project and fieldbook data seeded successfully!');
  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
