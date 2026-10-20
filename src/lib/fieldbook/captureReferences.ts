import { sourceImportSchema, type SourceImport } from './captureDraft'
import { canonicalJson } from '@/lib/provenance/canonicalJson'
export function readCaptureReferences(data: Record<string, unknown>, projectId: string): SourceImport | undefined {
  if (data.sourceImport === undefined) return undefined
  const result = sourceImportSchema.safeParse(data.sourceImport)
  if (!result.success) throw new Error('The retained source references are unreadable. The open book was not replaced.')
  if (result.data.sources.some(source => source.projectId !== projectId)) throw new Error('These source references belong to a different project. Select their original project before opening this source-linked book.')
  return result.data
}
export function captureReferenceColumns(imported: SourceImport | undefined, row: Record<string, string>): Record<string, string> {
  const source = imported?.sources.find(item => item.rowId === row.id)
  if (!source) return {}
  const current = Object.fromEntries(Object.keys(source.initialRow).map(key => [key, row[key] ?? '']))
  return { SourceClientID: source.clientId, SourceBatchID: source.batchId, SourceObservationID: source.observationId,
    SourceInputHash: source.inputHash, SourceCaptureAuthor: source.capturedBy ?? 'unknown',
    SourceBookRowChanged: canonicalJson(current) === canonicalJson(source.initialRow) ? 'no' : 'yes' }
}
