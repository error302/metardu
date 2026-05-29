import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import db from '@/lib/db'
import { apiSuccess, apiError } from '@/lib/api/response'
import { log } from '@/lib/logger'

export const POST = apiHandler({ auth: true }, async (req, ctx) => {
  const { projectId, hash } = ctx.body as { projectId?: string; hash?: string }
  if (!projectId || !hash) return NextResponse.json(apiError('Missing inputs'), { status: 400 })

  const { rows: profileResult } = await db.query(
    'SELECT full_name, isk_number FROM profiles WHERE id = $1 LIMIT 1',
    [ctx.userId]
  )
  const profile = profileResult[0]

  const signerName = profile?.full_name || ctx.session?.user?.email || 'Unknown Surveyor'
  const iskNumber = profile?.isk_number || 'Unknown LS'

  const { rows } = await db.query(
    `INSERT INTO signatures (user_id, project_id, signature_data, signer_name, isk_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, signed_at`,
    [ctx.userId, projectId, hash, signerName, iskNumber]
  )

  if (rows.length === 0) {
    log({ level: 'error', message: 'Failed to insert digital signature into database', metadata: { user_id: ctx.userId, project_id: projectId } })
    return NextResponse.json(apiError('Failed to sign plan'), { status: 500 })
  }

  const data = rows[0]
  return NextResponse.json(apiSuccess({
    id: data.id,
    signerName,
    iskNumber,
    signedAt: data.signed_at
  }))
})
