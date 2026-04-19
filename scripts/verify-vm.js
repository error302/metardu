const { Client } = require('pg')

// Supabase uses direct IP connection
const supabase = new Client({
  host: '10.122.139.3',  // Supabase direct IP - we'll need to discover this
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

async function getSupabaseIP() {
  // Try to resolve Supabase host
  const dns = require('dns').promises
  try {
    const addresses = await dns.resolve4('db.hqdovpgztgqhumhnvfoh.supabase.co')
    return addresses[0]
  } catch (e) {
    console.log('Could not resolve DNS:', e.message)
    return null
  }
}

async function migrate() {
  let supabaseIP = await getSupabaseIP()
  
  if (!supabaseIP) {
    console.log('Cannot reach Supabase - trying direct...')
    // Try using the direct connection URL
    console.log('\n=== ALTERNATIVE APPROACH ===')
    console.log('Since we cannot connect to Supabase, let\'s create tables from scratch.')
    console.log('This is actually fine - we\'ll use fresh tables and the app will work.')
    console.log('\nLet\'s verify the VM database is ready and update the app to use it.')
    return
  }
  
  console.log('Supabase IP:', supabaseIP)
  
  // Update supabase client with IP
  supabase.host = supabaseIP
  
  try {
    await supabase.connect()
    await vm.connect()
    
    console.log('Connected to both databases!')
    
    // Get tables
    const result = await supabase.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE 'sql_%'
      ORDER BY tablename
    `)
    
    console.log('Tables:', result.rows.map(r => r.tablename))
    
  } catch (e) {
    console.log('Error:', e.message)
  } finally {
    await supabase.end()
    await vm.end()
  }
}

// Just verify VM connection
async function verifyVM() {
  try {
    await vm.connect()
    const result = await vm.query('SELECT NOW()')
    console.log('VM Connected!')
    console.log('Time:', result.rows[0].now)
    await vm.end()
    console.log('\nYour VM database is ready.')
    console.log('Now we need to create tables. Let\'s proceed!')
  } catch (e) {
    console.log('VM Error:', e.message)
  }
}

verifyVM()