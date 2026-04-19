const { Client } = require('pg')

const supabase = new Client({
  host: 'db.hqdovpgztgqhumhnvfoh.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Z7m7066C6UJBUK',
  database: 'postgres'
})

const vm = new Client({
  host: '34.170.248.156',
  port: 5432,
  user: 'metardu',
  password: 'Z7m7066C6UJBUK',
  database: 'metardu'
})

async function exportImport() {
  try {
    await supabase.connect()
    await vm.connect()
    
    // Get all tables in public schema
    const tables = await supabase.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
    `)
    
    console.log('Tables found:', tables.rows.map(r => r.tablename))
    
    for (const { tablename } of tables.rows) {
      console.log(`\nExporting ${tablename}...`)
      
      // Get table data from Supabase
      const data = await supabase.query(`SELECT * FROM ${tablename}`)
      const rows = data.rows
      
      if (rows.length === 0) {
        console.log(`  - No data, skipping`)
        continue
      }
      
      console.log(`  - ${rows.length} rows`)
      
      // Get column names
      const columns = Object.keys(rows[0])
      
      // Create table in VM if not exists (simplified - copy structure)
      try {
        // Try to insert data - might need table creation first
        for (const row of rows) {
          const cols = columns.map((c, i) => `"${c}"`).join(', ')
          const vals = columns.map((_, i) => `$${i + 1}`).join(', ')
          const values = columns.map(c => {
            const val = row[c]
            if (val === null) return null
            if (typeof val === 'object') return JSON.stringify(val)
            return val
          })
          
          try {
            await vm.query(`INSERT INTO ${tablename} (${cols}) VALUES (${vals})`, values)
          } catch (e) {
            // Table might not exist, try to create it
            if (e.message.includes('relation') && e.message.includes('does not exist')) {
              // Create basic table from first row
              const colDefs = columns.map(c => {
                const val = rows[0][c]
                let type = 'text'
                if (typeof val === 'number') type = 'integer'
                if (typeof val === 'object') type = 'jsonb'
                return `"${c}" ${type}`
              }).join(', ')
              
              try {
                await vm.query(`CREATE TABLE IF NOT EXISTS ${tablename} (${colDefs})`)
                console.log(`  - Created table ${tablename}`)
                
                // Retry insert
                for (const row of rows) {
                  const vals = columns.map((_, i) => `$${i + 1}`)
                  const values = columns.map(c => {
                    const val = row[c]
                    if (val === null) return null
                    if (typeof val === 'object') return JSON.stringify(val)
                    return val
                  })
                  await vm.query(`INSERT INTO ${tablename} (${cols}) VALUES (${vals})`, values)
                }
              } catch (createErr) {
                console.log(`  - Error creating table: ${createErr.message}`)
              }
            }
          }
        }
        console.log(`  - Imported to VM`)
      } catch (e) {
        console.log(`  - Error: ${e.message}`)
      }
    }
    
    console.log('\nDone!')
  } catch (e) {
    console.error('Error:', e.message)
  } finally {
    await supabase.end()
    await vm.end()
  }
}

exportImport()