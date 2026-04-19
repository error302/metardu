const { Pool } = require('pg');
const fs = require('fs');

async function setupDatabase() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:Dosho10701$@localhost:5432/metardu_dev';
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('🔧 Setting up database tables...');
    
    // Read and execute SQL file
    const sqlContent = fs.readFileSync('./scripts/update-projects-table.sql', 'utf8');
    
    await pool.query(sqlContent);
    
    console.log('✅ Database setup completed successfully');
    
    // Test the table
    const testQuery = 'SELECT COUNT(*) FROM projects';
    const result = await pool.query(testQuery);
    console.log(`📊 Projects table now has ${result.rows[0].count} records`);
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase();
