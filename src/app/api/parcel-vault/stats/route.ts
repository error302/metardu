import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    const [total, shared, fresh, verify, stale] = await Promise.all([
      supabase.from('parcel_vault').select('id', { count: 'exact', head: true }),
      supabase.from('parcel_vault_shared').select('id', { count: 'exact', head: true }),
      supabase.from('parcel_vault').select('id', { count: 'exact', head: true }).eq('freshness', 'FRESH'),
      supabase.from('parcel_vault').select('id', { count: 'exact', head: true }).eq('freshness', 'VERIFY'),
      supabase.from('parcel_vault').select('id', { count: 'exact', head: true }).eq('freshness', 'STALE')
    ])

    return NextResponse.json({
      totalParcels: total.count || 0,
      sharedParcels: shared.count || 0,
      freshParcels: fresh.count || 0,
      verifyParcels: verify.count || 0,
      staleParcels: stale.count || 0
    })

  } catch (error) {
    console.error('Vault stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
