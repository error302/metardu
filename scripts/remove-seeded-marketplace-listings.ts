import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('Set DATABASE_URL in the database-owning runtime before running this cleanup.')

// These are the exact titles in the retired seed script. No fuzzy matching is
// used, and the cleanup stops if rows are missing, duplicated, or have inquiries.
const TITLES = [
  'Leica TS16 I 1" R1000 Robotic Total Station',
  'Trimble R12i GNSS Receiver System (Base + Rover)',
  'Sokkia B40A 24x Automatic Optical Level Kit',
  'DJI Matrice 300 RTK + Zenmuse L1 LiDAR Payload',
  'Emlid Reach RS2+ Multi-band RTK GNSS Receiver',
  'GeoMax Zoom90 1" Fully Robotic Total Station',
  'South N40 Total Station 2" Reflectorless 1000m',
  'Trimble DiNi 0.3 Digital Level with Invar Staff',
  'Garmin GPSMAP 66sr Multi-GNSS Handheld Receiver',
  'Leica DNA03 Precision Digital Level System',
  'Seco 2.5m Carbon Fiber Rover Pole + Bipod Kit',
  'WingtraOne GEN II VTOL Mapping Drone',
]

async function removeRetiredInventory() {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string; title: string; user_id: string }>(
      'SELECT id, title, user_id FROM instrument_listings WHERE title = ANY($1::text[]) FOR UPDATE',
      [TITLES],
    )
    if (rows.length !== TITLES.length || new Set(rows.map(row => row.title)).size !== TITLES.length) {
      throw new Error(`Expected exactly ${TITLES.length} unique seeded rows; found ${rows.length}. Nothing was removed.`)
    }
    if (new Set(rows.map(row => row.user_id)).size !== 1) {
      throw new Error('Seeded rows do not have the expected single owner. Nothing was removed.')
    }
    const ids = rows.map(row => row.id)
    const { rows: inquiryRows } = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM instrument_inquiries WHERE listing_id = ANY($1::uuid[])',
      [ids],
    )
    if (Number(inquiryRows[0]?.count ?? 0) > 0) {
      throw new Error('At least one listing has a buyer inquiry. Nothing was deleted so those records remain intact.')
    }
    const deleted = await client.query(
      'DELETE FROM instrument_listings WHERE id = ANY($1::uuid[]) AND title = ANY($2::text[])',
      [ids, TITLES],
    )
    if (deleted.rowCount !== TITLES.length) {
      throw new Error(`Deleted ${deleted.rowCount ?? 0} rows instead of ${TITLES.length}; transaction rolled back.`)
    }
    await client.query('COMMIT')
    process.stdout.write(`Removed ${deleted.rowCount} retired sample listings; buyer inquiries checked: 0.\n`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

removeRetiredInventory().catch(error => {
  console.error(error instanceof Error ? error.message : 'Marketplace cleanup failed.')
  process.exitCode = 1
})
