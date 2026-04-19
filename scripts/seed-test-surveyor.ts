/**
 * Seed script — Creates a test surveyor user for simulation
 * 
 * Run: npx tsx scripts/seed-test-surveyor.ts
 * 
 * Prerequisites:
 *   - DATABASE_URL must be set in environment
 *   - The users table must exist
 */

import { Pool } from 'pg'
import bcrypt from 'bcryptjs'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })

  const email = 'test.surveyor@metardu.com'
  const password = 'TestPassword123!'
  const fullName = 'Test Surveyor'
  const iskNumber = 'ISK/TEST/2024/001'
  const verifiedIsk = true

  console.log(`Seeding test surveyor: ${email}`)

  const passwordHash = await bcrypt.hash(password, 10)

  try {
    // Check if user exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (existing.length > 0) {
      // Update user
      await pool.query(
        'UPDATE users SET password_hash = $1, full_name = $2, isk_number = $3, verified_isk = $4, updated_at = NOW() WHERE email = $5',
        [passwordHash, fullName, iskNumber, verifiedIsk, email]
      )
      console.log(`Updated existing test surveyor: ${email}`)
    } else {
      await pool.query(
        `INSERT INTO users (email, password_hash, full_name, isk_number, verified_isk)
         VALUES ($1, $2, $3, $4, $5)`,
        [email, passwordHash, fullName, iskNumber, verifiedIsk]
      )
      console.log(`Created test surveyor: ${email}`)
    }

    console.log('Test surveyor credentials:')
    console.log(`  Email: ${email}`)
    console.log(`  Password: ${password}`)
    console.log(`  ISK Number: ${iskNumber}`)
    console.log('Done!')
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
