#!/usr/bin/env node
/**
 * METARDU VM Database Verification Script
 * Verifies the PostgreSQL database on the VM is accessible and ready.
 * 
 * Usage:
 *   node scripts/verify-vm.js
 * 
 * Requires DATABASE_URL environment variable or .env.local file.
 */

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Resolve DATABASE_URL from env or .env.local
let dbUrl = process.env.DATABASE_URL || ''
if (!dbUrl) {
  const envLocal = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envLocal)) {
    const content = fs.readFileSync(envLocal, 'utf8')
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m)
    if (match) dbUrl = match[1]
  }
}
if (!dbUrl) {
  const envFile = path.join(process.cwd(), '.env')
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8')
    const match = content.match(/^DATABASE_URL=["']?(.*?)["']?\s*$/m)
    if (match) dbUrl = match[1]
  }
}
if (!dbUrl) {
  console.error('DATABASE_URL not found. Set it in environment or .env.local')
  process.exit(1)
}

async function verify() {
  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 10000 })
  try {
    await client.connect()
    const result = await client.query('SELECT NOW() as now, current_database() as db')
    console.log('Database connected!')
    console.log('Time:', result.rows[0].now)
    console.log('Database:', result.rows[0].db)

    // Check tables
    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `)
    console.log('\nTables:', tables.rows.map(r => r.tablename).join(', ') || '(none)')

    // Check PostGIS
    try {
      const postgis = await client.query('SELECT PostGIS_Version()')
      console.log('PostGIS:', postgis.rows[0].postgis_version)
    } catch {
      console.log('PostGIS: Not installed')
    }

    await client.end()
    console.log('\nDatabase is ready.')
  } catch (e) {
    console.error('Database connection failed:', e.message)
    process.exit(1)
  }
}

verify()
