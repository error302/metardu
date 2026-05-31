const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: 'postgresql://postgres:Dosho10701$@localhost:5432/metardu_dev'
  });
  await c.connect();
  console.log('Connected to local DB');

  // Seed admin user
  const hash = await bcrypt.hash('Dosho10701$', 10);
  const userId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  await c.query(
    `INSERT INTO users (id, email, password_hash, full_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = $3`,
    [userId, 'mohameddosho20@gmail.com', hash, 'Mohamed Dosho']
  );
  console.log('Admin user seeded');

  await c.query(
    `INSERT INTO profiles (id, email, full_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [userId, 'mohameddosho20@gmail.com', 'Mohamed Dosho']
  );
  console.log('Profile seeded');

  // Create a test cadastral project
  const projectRes = await c.query(
    `INSERT INTO projects (user_id, name, survey_type, location, utm_zone, hemisphere)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, 'Kiambu 4-Acre Subdivision', 'cadastral', 'Kiambu County', 37, 'S']
  );
  const projectId = projectRes.rows[0].id;
  console.log('Test project created:', projectId);

  // Add sample survey points (from the user's 4-acre data)
  const points = [
    ['BN-A', 260500.000, 9852100.000, 1650.00],
    ['BN-B', 260620.000, 9852100.000, 1648.50],
    ['BN-C', 260620.000, 9852235.000, 1649.20],
    ['BN-D', 260500.000, 9852235.000, 1651.00],
    ['CP-1', 260560.000, 9852167.500, 1649.80],
  ];

  for (const [name, e, n, el] of points) {
    await c.query(
      `INSERT INTO survey_points (project_id, name, easting, northing, elevation, is_control)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, name, e, n, el, name.startsWith('CP')]
    );
  }
  console.log('5 survey points seeded');

  // Add a parcel
  await c.query(
    `INSERT INTO parcels (project_id, name, area_sqm, area_ha, area_acres, perimeter_m, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [projectId, 'Plot 1 - Subdivision', 16187.43, 1.6187, 4.0, 510.0, userId]
  );
  console.log('Parcel seeded');

  // Create a second engineering project
  const projRes2 = await c.query(
    `INSERT INTO projects (user_id, name, survey_type, location, utm_zone, hemisphere)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [userId, 'Nairobi-Thika Highway Levelling', 'engineering', 'Nairobi County', 37, 'S']
  );
  console.log('Engineering project created:', projRes2.rows[0].id);

  await c.end();
  console.log('Done! Local dev DB is fully ready.');
}

main().catch(err => { console.error(err); process.exit(1); });
