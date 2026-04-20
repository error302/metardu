import db from '@/lib/db'
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

    const { rows: profileResult } = await db.query(
      'SELECT full_name, isk_number FROM profiles WHERE id = $1 LIMIT 1',
      [(session.user as { id?: string }).id]
    )
    const profile = profileResult[0]

    const signerName = profile?.full_name || user.email || 'Unknown Surveyor'
    const iskNumber = profile?.isk_number || 'Unknown LS'

    const { rows } = await db.query(
      `INSERT INTO signatures (user_id, project_id, signature_data, signer_name, isk_number) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, signed_at`,
      [(session.user as { id?: string }).id, projectId, hash, signerName, iskNumber]
    )

    if (rows.length === 0) {
      log({ level: 'error', message: 'Failed to insert digital signature into database', metadata: { user_id: (session.user as { id?: string }).id, project_id: projectId } })
      return NextResponse.json(apiError('Failed to sign plan'), { status: 500 })
    }

    const data = rows[0]
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
