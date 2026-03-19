import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Called server-side after Supabase auth.signUp succeeds.
// Creates the trial subscription using the service role key (bypasses RLS safely).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdmin()
  if (!admin) {
    // Non-fatal — subscription can be created later
    return NextResponse.json({ ok: true, note: 'admin not configured' })
  }

  // Idempotent: skip if trial already exists
  const { data: existing } = await admin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true })
  }

  const now = new Date()
  await admin.from('user_subscriptions').insert({
    user_id: user.id,
    plan_id: 'pro',
    status: 'trial',
    trial_ends_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    current_period_start: now.toISOString(),
    current_period_end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return NextResponse.json({ ok: true })
}
