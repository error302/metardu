import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { canAccessProject } from '@/lib/auth/rbac'
import { exportProjectSetoutCsv } from '@/lib/reports/projectSetoutCsv'
import { loadProjectSetoutShots } from '@/lib/reports/projectSetoutCsv'
import { generateProjectSetoutHtml } from '@/lib/reports/projectSetoutHtml'
import { generateProjectSetoutPdf, MAX_SETOUT_PDF_SHOTS, SETOUT_PDF_FONT_FILE, UnsupportedSetoutPdfTextError } from '@/lib/reports/projectSetoutPdf'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = await ctx.params
  const definitionId = req.nextUrl.searchParams.get('definitionId')
  const rawRevision = req.nextUrl.searchParams.get('revision')
  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const revision = rawRevision == null ? null : Number(rawRevision)
  if (!id || !UUID.test(id) || !definitionId || !UUID.test(definitionId) || !['csv', 'html', 'pdf'].includes(format)
    || (rawRevision != null && (!/^[1-9]\d*$/.test(rawRevision) || revision == null || !Number.isSafeInteger(revision) || revision > 2147483647))) {
    return NextResponse.json({ error: 'A project, definition and valid optional design revision are required.' }, { status: 400 })
  }
  if (!ctx.userId || !await canAccessProject(ctx.userId, id)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }
  if (format === 'html' || format === 'pdf') {
    const rows = await loadProjectSetoutShots(id, definitionId, revision)
    if (!rows.length) return NextResponse.json({ error: 'No saved observations found for this definition and revision.' }, { status: 404 })
    if (rows.length > 10000) return NextResponse.json({ error: 'Select a narrower design revision; the report is limited to 10,000 saved shots.' }, { status: 413 })
    const logo = await readFile(path.join(process.cwd(), 'public', 'metardu-icon.png'))
    if (format === 'pdf') {
      if (rows.length > MAX_SETOUT_PDF_SHOTS) return NextResponse.json({ error: 'Select a narrower design revision; PDF reports are limited to 1,000 saved shots.' }, { status: 413 })
      const font = await readFile(path.join(process.cwd(), 'public', 'fonts', SETOUT_PDF_FONT_FILE))
      let pdf: Buffer
      try { pdf = await generateProjectSetoutPdf(rows, { revision, logo, font }) }
      catch (error) {
        if (error instanceof UnsupportedSetoutPdfTextError) return NextResponse.json({ error: error.message, code: 'PDF_TEXT_UNSUPPORTED' }, { status: 422 })
        throw error
      }
      return new NextResponse(new Uint8Array(pdf), { headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="metardu-cut-sheet-${definitionId}${revision == null ? '-history' : '-r' + revision}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
      } })
    }
    return new NextResponse(generateProjectSetoutHtml(rows, { revision, logoDataUrl: 'data:image/png;base64,' + logo.toString('base64') }), { headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="metardu-cut-sheet-${definitionId}${revision == null ? '-history' : '-r' + revision}.html"`,
      'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    } })
  }
  const result = await exportProjectSetoutCsv(id, definitionId, revision)
  if (!result.count) return NextResponse.json({ error: 'No saved observations found for this definition and revision.' }, { status: 404 })
  if (!result.csv) return NextResponse.json({ error: 'More than 10,000 observations match. Select a design revision to split the export.' }, { status: 413 })
  return new NextResponse(result.csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="metardu-setout-${definitionId}${revision == null ? '-history' : '-r' + revision}.csv"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  } })
})
