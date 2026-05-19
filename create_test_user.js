
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: 'postgresql://metardu:Metardu2026SecurePwd@localhost:5432/metardu' });
  await client.connect();
  
  const hash = await bcrypt.hash('TestPass123!', 10);
  await client.query("UPDATE users SET password_hash = $1, full_name = 'E2E Test Surveyor' WHERE email = 'testuser@metardu.app'", [hash]);
  console.log('Password set for testuser@metardu.app');
  
  // Also reset mohameddosho20 password
  const hash2 = await bcrypt.hash('Metardu2024!', 10);
  await client.query("UPDATE users SET password_hash = $1 WHERE email = 'mohameddosho20@gmail.com'", [hash2]);
  console.log('Password set for mohameddosho20@gmail.com');
  
  await client.end();
}
main().catch(e => console.error(e));
