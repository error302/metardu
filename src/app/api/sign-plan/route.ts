import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { log } from '@/lib/logger'
import { requireEnv } from '@/lib/env'

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) return NextResponse.json(apiError('Unauthorized'), { status: 401 })

  try {
    const { projectId, hash } = await req.json()
    if (!projectId || !hash) return NextResponse.json(apiError('Missing inputs'), { status: 400 })

    const { data: profile } = await supabase.from('profiles').select('full_name, license_number').eq('id', user.id).single()

    const signerName = profile?.full_name || user.email || 'Unknown Surveyor'
    const iskNumber = profile?.license_number || 'Unknown LS'

    const { data, error } = await supabase.from('signatures').insert({
      user_id: user.id,
      project_id: projectId,
      document_hash: hash,
      signer_name: signerName,
      isk_number: iskNumber,
    }).select('id, signed_at').single()

    if (error) {
      log({ level: 'error', message: 'Failed to insert digital signature into database', metadata: { error, user_id: user.id, project_id: projectId } })
      return NextResponse.json(apiError('Failed to sign plan'), { status: 500 })
    }

    return NextResponse.json(apiSuccess({ 
      id: data.id, 
      signerName, 
      iskNumber,
      signedAt: data.signed_at 
    }))
  } catch (err: any) {
    log({ level: 'error', message: 'Unhandled exception during plan signing', metadata: { error: err } })
    return NextResponse.json(apiError('Failed to process signing request'), { status: 500 })
  }
}
