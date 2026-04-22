const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Dosho10701$@localhost:5432/metardu_dev'});
pool.query('SELECT password_hash FROM users WHERE email = $1', ['mohameddosho20@gmail.com'], (err, res) => {
  if (err) {
    console.error('Query error:', err.stack);
    pool.end();
    return;
  }
  if (res.rows.length === 0) {
    console.log('User not found');
    pool.end();
    return;
  }
  const hash = res.rows[0].password_hash;
  console.log('Hash for mohameddosho20@gmail.com:', hash);
  bcrypt.compare('Dosho10701$', hash, (err, result) => {
    if (err) {
      console.error('Bcrypt error:', err);
    } else {
      console.log('Password Dosho10701$ matches?', result);
    }
    // Also test the test user from init-test-db.sql
    pool.query('SELECT password_hash FROM users WHERE email = $1', ['test.surveyor@metardu.com'], (err2, res2) => {
      if (err2) {
        console.error('Query error for test user:', err2.stack);
      } else if (res2.rows.length === 0) {
        console.log('Test user test.surveyor@metardu.com not found');
      } else {
        const hash2 = res2.rows[0].password_hash;
        console.log('Hash for test.surveyor@metardu.com:', hash2);
        bcrypt.compare('TestPass123!', hash2, (err3, result3) => {
          if (err3) {
            console.error('Bcrypt error for test user:', err3);
          } else {
            console.log('Password TestPass123! matches for test.surveyor@metardu.com?', result3);
          }
          pool.end();
        });
      }
    });
  });
});