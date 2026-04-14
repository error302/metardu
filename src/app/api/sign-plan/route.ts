import { createClient } from '@/lib/supabase/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api/response'
import { log } from '@/lib/logger'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user ?? null
  if (!user) return NextResponse.json(apiError('Unauthorized'), { status: 401 })

  try {
    const { projectId, hash } = await req.json()
    if (!projectId || !hash) return NextResponse.json(apiError('Missing inputs'), { status: 400 })

    const supabase = await createClient()

    const profileResult = await supabase.from('profiles').select('full_name, license_number').eq('id', (session.user as { id?: string }).id ?? '').single()
    const profile = (profileResult as any).data

    const signerName = profile?.full_name || user.email || 'Unknown Surveyor'
    const iskNumber = profile?.license_number || 'Unknown LS'

    const result = await supabase.from('signatures').insert({
      user_id: (session.user as { id?: string }).id ?? '',
      project_id: projectId,
      document_hash: hash,
      signer_name: signerName,
      isk_number: iskNumber,
    }).select('id, signed_at').single()

    if ((result as any).error) {
      log({ level: 'error', message: 'Failed to insert digital signature into database', metadata: { error: (result as any).error, user_id: user.id, project_id: projectId } })
      return NextResponse.json(apiError('Failed to sign plan'), { status: 500 })
    }

    const data = (result as any).data
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
