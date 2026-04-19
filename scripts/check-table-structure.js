const { Pool } = require('pg');

async function checkTableStructure() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:Dosho10701$@localhost:5432/metardu_dev';
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('🔍 Checking projects table structure...');
    
    // Get table structure
    const structureQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      ORDER BY ordinal_position
    `;
    
    const result = await pool.query(structureQuery);
    
    console.log('Current projects table structure:');
    console.table(result.rows);
    
    // Check if table exists at all
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'projects'
      )
    `;
    
    const existsResult = await pool.query(tableExistsQuery);
    console.log(`\nProjects table exists: ${existsResult.rows[0].exists}`);
    
  } catch (error) {
    console.error('❌ Error checking table structure:', error);
  } finally {
    await pool.end();
  }
}

checkTableStructure();
