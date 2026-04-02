import pg from 'pg'
const { Client } = pg

const client = new Client({
  connectionString: 'postgresql://metardu:Dosho10701$@34.170.248.156:5432/metardu'
})

async function test() {
  try {
    await client.connect()
    const result = await client.query('SELECT NOW() as now, version() as version')
    console.log('Connected!')
    console.log(result.rows[0])
    await client.end()
  } catch (e: any) {
    console.log('Error:', e.message)
  }
}

test()