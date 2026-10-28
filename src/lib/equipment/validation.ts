import type { z } from 'zod'
import { AppError } from '@/lib/api/errors'
import { NextResponse } from 'next/server'

export function equipmentSuccess(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}

export function validateEquipmentBody<T extends z.ZodType>(body: unknown, schema: T): z.output<T> {
  const result = schema.safeParse(body)
  if (!result.success) throw new AppError(result.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; '), 400, 'EQUIPMENT_INPUT_INVALID')
  return result.data
}
