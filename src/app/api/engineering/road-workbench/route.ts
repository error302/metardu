export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler } from '@/lib/apiHandler'
import { db } from '@/lib/db'
import { AppError } from '@/lib/api/errors'
import { readTextBounded } from '@/lib/security/requestBody'
import {
  ROAD_RECOVERY_LIMIT,
  roadWorkbenchCommandSchema,
} from '@/lib/engineering/roadWorkbenchRecoveryContract'
import {
  loadRoadWorkbenchSource,
  readRoadWorkbenchOutcome,
  executeRoadWorkbenchCommand,
} from '@/lib/engineering/roadWorkbenchRecoveryServer'
const headers = { 'Cache-Control': 'private, no-store' }
const querySchema = z
  .object({
    project_id: z.string().uuid(),
    expected_user_id: z.string().uuid(),
  })
  .strict()
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 60, windowMs: 60000 } },
  async (req, ctx) => {
    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams),
    )
    if (!parsed.success)
      throw new AppError(
        'Supply the original account and project identifiers.',
        422,
        'ROAD_WORKBENCH_RECOVERY',
      )
    if (parsed.data.expected_user_id !== ctx.userId)
      throw new AppError(
        'The signed-in account changed. Recover this draft in its original account.',
        403,
        'ROAD_WORKBENCH_RECOVERY',
      )
    const source = await db.transaction((client) =>
      loadRoadWorkbenchSource(client, ctx.userId, parsed.data.project_id),
    )
    return NextResponse.json({ source }, { headers })
  },
)
const bodySchema = z
  .object({
    operation: z.enum(['commit', 'cancel', 'status']),
    command: roadWorkbenchCommandSchema,
  })
  .strict()
export const POST = apiHandler(
  { auth: true, rawBody: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (req, ctx) => {
    const text = await readTextBounded(req.body, ROAD_RECOVERY_LIMIT)
    if (text === null)
      throw new AppError(
        'The recoverable road request exceeds its limit or is not valid UTF-8.',
        413,
        'ROAD_WORKBENCH_RECOVERY',
      )
    let input: unknown
    try {
      input = JSON.parse(text)
    } catch {
      throw new AppError(
        'Supply the retained road request as valid JSON.',
        422,
        'ROAD_WORKBENCH_RECOVERY',
      )
    }
    const parsed = bodySchema.safeParse(input)
    if (!parsed.success)
      throw new AppError(
        'The retained road request is incomplete or invalid.',
        422,
        'ROAD_WORKBENCH_RECOVERY',
      )
    const { operation, command } = parsed.data
    const outcome = await db.transaction((client) =>
      operation === 'status'
        ? readRoadWorkbenchOutcome(client, ctx.userId, command)
        : executeRoadWorkbenchCommand(client, ctx.userId, command, operation),
    )
    return NextResponse.json({ outcome }, { headers })
  },
)
