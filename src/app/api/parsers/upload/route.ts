export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/apiHandler'
import { routeFile, validateFile } from '@/lib/parsers/fileRouter'
import { summarizeParsedInput } from '@/lib/parsers/uploadSummary'

export const POST = apiHandler({ auth: true, rawBody: true }, async request => {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > 101 * 1024 * 1024) {
    return NextResponse.json({ error: 'Upload body exceeds the 100 MB parser limit.' }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 })
  }

  const entry = formData.get('file')
  if (!(entry instanceof File)) {
    return NextResponse.json({ error: 'Choose a file to parse.' }, { status: 400 })
  }

  if (entry.size === 0) {
    return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 })
  }

  const validation = validateFile(entry)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error ?? 'Unsupported file.' }, { status: 400 })
  }

  try {
    const parsed = await routeFile({ file: entry })
    const summary = summarizeParsedInput(parsed)
    const warnings = [...summary.warnings]
    if (formData.get('enhanceWithAI') === 'true') {
      warnings.push('AI enhancement is not enabled for this parser; results contain native parser output only.')
    }
    return NextResponse.json({ ...summary, warnings })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File parsing failed.'
    return NextResponse.json({ error: message }, { status: 422 })
  }
})
