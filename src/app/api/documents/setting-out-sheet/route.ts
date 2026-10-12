export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { logger } from '@/lib/logger'
import { SETTING_OUT_TEMPLATE } from '@/lib/documents/templates/setting-out'
import { prepareSettingOutSheet, settingOutSheetRequestSchema } from '@/lib/documents/settingOutSheetSchema'

function safeFilenamePart(value: string): string {
  const safe = value.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return safe || 'survey'
}

export const POST = apiHandler(
  { auth: true, schema: settingOutSheetRequestSchema, rateLimit: { max: 12, windowMs: 60_000 } },
  async (_req, ctx) => {
    const prepared = prepareSettingOutSheet(ctx.body)
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 422 })

    try {
      const pdf = await SETTING_OUT_TEMPLATE.generate(prepared.data)
      const filename = `setting-out-${safeFilenamePart(prepared.data.projectName)}.pdf`
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store, max-age=0',
          Pragma: 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      logger.error('[documents/setting-out-sheet] PDF generation failed', { error })
      return NextResponse.json({ error: 'The setting-out PDF could not be generated. Your supplied data was not saved.' }, { status: 500 })
    }
  },
)
