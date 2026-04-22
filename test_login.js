const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Dosho10701$@localhost:5432/metardu_dev'
});

async function testLogin() {
  try {
    console.log('Testing database connection...');
    const { rows } = await pool.query(
      'SELECT id, email, full_name, isk_number, verified_isk FROM users WHERE email = $1',
      ['mohameddosho20@gmail.com']
    );
    
    if (rows.length === 0) {
      console.log('ERROR: User not found!');
    } else {
      console.log('User found:', rows[0]);
    }
    
    // Check password hash
    const { rows: hashRow } = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['mohameddosho20@gmail.com']
    );
    
    if (hashRow.length > 0) {
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare('Dosho10701$', hashRow[0].password_hash);
      console.log('Password valid:', isValid);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

testLogin();