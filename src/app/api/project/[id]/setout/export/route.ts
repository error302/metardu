import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { canAccessProject } from '@/lib/auth/rbac'
import { exportProjectSetoutCsv } from '@/lib/reports/projectSetoutCsv'
import { loadProjectSetoutShots } from '@/lib/reports/projectSetoutCsv'
import { generateProjectSetoutHtml } from '@/lib/reports/projectSetoutHtml'
import { generateProjectSetoutPdf, MAX_SETOUT_PDF_SHOTS, SETOUT_PDF_FONT_FILE, UnsupportedSetoutPdfTextError } from '@/lib/reports/projectSetoutPdf'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeCaptureTime } from '@/lib/field/setoutCapture'
import { loadProjectPlumbHistory, type PlumbHistoryFilter } from '@/lib/reports/loadProjectPlumbHistory'
import { generatePlumbHistoryCsv, generatePlumbHistoryHtml, MAX_PLUMB_HISTORY_ROWS } from '@/lib/reports/projectPlumbHistory'
import { generatePlumbHistoryPdf, MAX_PLUMB_PDF_ROWS } from '@/lib/reports/projectPlumbPdf'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = apiHandler({ auth: true, rateLimit: { max: 30, windowMs: 60000 } }, async (req, ctx) => {
  const { id } = await ctx.params
  const definitionId = req.nextUrl.searchParams.get('definitionId')
  const rawRevision = req.nextUrl.searchParams.get('revision')
  const format = req.nextUrl.searchParams.get('format') ?? 'csv'
  const kind = req.nextUrl.searchParams.get('kind') ?? 'setout'
  const revision = rawRevision == null ? null : Number(rawRevision)
  if (!id || !UUID.test(id) || !['setout', 'plumb'].includes(kind) || !['csv', 'html', 'pdf'].includes(format)) {
    return NextResponse.json({ error: 'A valid project, report kind and format are required.' }, { status: 400 })
  }
  let plumbFilter: PlumbHistoryFilter | null = null
  if (kind === 'plumb') {
    const label = req.nextUrl.searchParams.get('label')
    try {
      if (definitionId !== null || rawRevision !== null || label !== null && (!label.trim() || label.length > 40)) throw new RangeError('Plumb reports use an optional column label and server-recording UTC range, not a design revision.')
      const fromUtc = normalizeCaptureTime(req.nextUrl.searchParams.get('fromUtc')), toUtc = normalizeCaptureTime(req.nextUrl.searchParams.get('toUtc'))
      if (fromUtc && toUtc && Date.parse(fromUtc) > Date.parse(toUtc)) throw new RangeError('The recording range start must not follow its end.')
      plumbFilter = { label, fromUtc, toUtc }
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid report filter.' }, { status: 400 }) }
  } else if (!definitionId || !UUID.test(definitionId)
    || (rawRevision != null && (!/^[1-9]\d*$/.test(rawRevision) || revision == null || !Number.isSafeInteger(revision) || revision > 2147483647))) {
    return NextResponse.json({ error: 'A project, definition and valid optional design revision are required.' }, { status: 400 })
  }
  if (!ctx.userId || !await canAccessProject(ctx.userId, id)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  }
  if (plumbFilter) {
    const rows = await loadProjectPlumbHistory(id, plumbFilter)
    if (rows.some(row => typeof row.project_id !== 'string' || row.project_id.toLowerCase() !== id.toLowerCase())) return NextResponse.json({ error: 'The saved history does not match the authorized project; review the evidence before export.', code: 'PLUMB_EVIDENCE_INVALID' }, { status: 409 })
    if (!rows.length) return NextResponse.json({ error: 'No saved plumb readings match these filters.' }, { status: 404 })
    if (rows.length > MAX_PLUMB_HISTORY_ROWS || format === 'pdf' && rows.length > MAX_PLUMB_PDF_ROWS) return NextResponse.json({ error: `Filter the column or server-recording dates. ${format === 'pdf' ? MAX_PLUMB_PDF_ROWS : MAX_PLUMB_HISTORY_ROWS} saved readings are allowed for this format.` }, { status: 413 })
    const headers: Record<string, string> = { 'Content-Disposition': `attachment; filename="metardu-plumb-history-${id}.${format}"`, 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }
    try {
      if (format === 'csv') return new NextResponse(generatePlumbHistoryCsv(rows), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })
      const logo = await readFile(path.join(process.cwd(), 'public', 'metardu-icon.png'))
      if (format === 'html') return new NextResponse(generatePlumbHistoryHtml(rows, { logoDataUrl: 'data:image/png;base64,' + logo.toString('base64') }), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } })
      const font = await readFile(path.join(process.cwd(), 'public', 'fonts', SETOUT_PDF_FONT_FILE))
      const pdf = await generatePlumbHistoryPdf(rows, { logo, font })
      return new NextResponse(new Uint8Array(pdf), { headers: { ...headers, 'Content-Type': 'application/pdf' } })
    } catch (error) {
      if (error instanceof UnsupportedSetoutPdfTextError) return NextResponse.json({ error: error.message, code: 'PDF_TEXT_UNSUPPORTED' }, { status: 422 })
      if (error instanceof Error && /evidence|inconsistent|measurement|coordinates|timestamp|result/i.test(error.message)) return NextResponse.json({ error: error.message, code: 'PLUMB_EVIDENCE_INVALID' }, { status: 409 })
      throw error
    }
  }
  if (!definitionId) throw new Error('A set-out definition is required after validation.')
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
