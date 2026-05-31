import bcrypt from 'bcryptjs'
import pg from 'pg'

const email = process.argv[2]
const password = process.argv[3]
const shouldSet = process.argv.includes('--set')

if (!email || !password) {
  console.error('Usage: node scripts/check-user-password.mjs <email> <password> [--set]')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

try {
  const { rows } = await pool.query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  )

  if (!rows.length) {
    console.log('USER_NOT_FOUND')
    process.exit(2)
  }

  const match = await bcrypt.compare(password, rows[0].password_hash)
  console.log(`USER_FOUND id=${rows[0].id}`)
  console.log(`PASSWORD_MATCH=${match}`)

  if (!match && shouldSet) {
    const hash = await bcrypt.hash(password, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email])
    console.log('PASSWORD_UPDATED=true')
  }
} finally {
  await pool.end()
}
