import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { AppError } from '@/lib/api/errors'
import { readSchemeExportHistory } from '@/lib/scheme/exportHistory'
import {
  previewSchemeExport,
  schemeExportAccess,
} from '@/lib/scheme/exportCommands'
export const dynamic = 'force-dynamic'
export const GET = apiHandler(
  { auth: true, rateLimit: { max: 30, windowMs: 60000 } },
  async (request, ctx) => {
    const query = new URL(request.url).searchParams
    if (query.get('mode') === 'history') {
      if (
        query.getAll('mode').length !== 1 ||
        query.getAll('page').length > 1 ||
        [...query.keys()].some((key) => !['mode', 'page'].includes(key)) ||
        !/^([1-9][0-9]{0,5})$/.test(query.get('page') ?? '1')
      )
        throw new AppError('Choose one valid export history page.', 400)
      return NextResponse.json(
        {
          data: await readSchemeExportHistory(
            ctx.userId,
            ctx.params.id,
            Number(query.get('page') ?? '1'),
          ),
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    if ([...query.keys()].some((key) => key !== 'parcel_id'))
      throw new AppError(
        'Choose the exact parcel_id selection for export review.',
        400,
      )
    return NextResponse.json(
      {
        data: query.getAll('parcel_id').length
          ? await previewSchemeExport(
              ctx.userId,
              ctx.params.id,
              query.getAll('parcel_id'),
            )
          : await schemeExportAccess(ctx.userId, ctx.params.id),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
