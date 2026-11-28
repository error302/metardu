/** @jest-environment node */
import { Client } from 'pg'

const explicitTestUrl = process.env.MPESA_RLS_TEST_DATABASE_URL?.trim()
const postgresRlsTest = explicitTestUrl ? test : test.skip

postgresRlsTest(
  'a payment provider can read a unified checkout while an unscoped session cannot',
  async () => {
    const url = new URL(explicitTestUrl as string)
    const hostname = url.hostname.toLowerCase()
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1'])
    const allowedDatabaseMarkers = ['test', 'synthetic', 'verify', 'rehearsal']

    expect(allowedHosts.has(hostname)).toBe(true)
    expect(allowedDatabaseMarkers.some(marker => databaseName.toLowerCase().includes(marker))).toBe(true)
    expect(process.env.DATABASE_URL).not.toBe(explicitTestUrl)

    const client = new Client({ connectionString: explicitTestUrl, connectionTimeoutMillis: 10_000 })
    await client.connect()
    try {
      await client.query('BEGIN')

      const identity = await client.query<{
        role_name: string
        rolsuper: boolean
        rolbypassrls: boolean
        owner_name: string
      }>(
        `SELECT current_user AS role_name,
                role.rolsuper,
                role.rolbypassrls,
                pg_get_userbyid(table_class.relowner) AS owner_name
           FROM pg_roles AS role
           CROSS JOIN pg_class AS table_class
          WHERE role.rolname = current_user
            AND table_class.oid = 'public.payment_history'::regclass`,
      )
      expect(identity.rows[0]).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
      })
      expect(identity.rows[0]?.role_name).not.toBe(identity.rows[0]?.owner_name)

      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'payment_history'
            AND column_name IN ('checkout_request_id', 'phone_number')`,
      )
      expect(columns.rows.map(row => row.column_name).sort()).toEqual([
        'checkout_request_id',
        'phone_number',
      ])

      const paymentId = '90000000-0000-4000-8000-000000000901'
      await client.query(
        `SELECT set_config('request.user_id', '', false),
                set_config('request.access_role', 'payment_provider', false)`,
      )
      await client.query(
        `INSERT INTO public.payment_history
           (id, user_id, amount, currency, payment_method, provider, status,
            metadata, checkout_request_id, phone_number)
         VALUES ($1, NULL, 2500, 'KES', 'mpesa', 'safaricom', 'pending',
                 '{}'::jsonb, $2, $3)`,
        [paymentId, 'ws_CO_synthetic_rls_0001', '254712345678'],
      )

      await client.query(
        `SELECT set_config('request.user_id', '', false),
                set_config('request.access_role', '', false)`,
      )
      const unscoped = await client.query(
        'SELECT id FROM public.payment_history WHERE id = $1',
        [paymentId],
      )
      expect(unscoped.rows).toHaveLength(0)

      await client.query(
        `SELECT set_config('request.user_id', '', false),
                set_config('request.access_role', 'payment_provider', false)`,
      )
      const providerScoped = await client.query(
        'SELECT id FROM public.payment_history WHERE id = $1',
        [paymentId],
      )
      expect(providerScoped.rows).toHaveLength(1)
    } finally {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  },
)
