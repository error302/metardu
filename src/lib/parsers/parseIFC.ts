import { extractProjectMetadata, parseIFCStep } from '@/lib/importers/ifcParser'
import type { ParsedInput } from './types'

/** Parse a STEP-encoded IFC file as a model inventory, not survey geometry. */
export async function parseIFCFile(file: File, base: ParsedInput): Promise<ParsedInput> {
  if (file.name.toLowerCase().endsWith('.ifcxml')) {
    return {
      ...base,
      errors: ['IFCXML is not supported. Export the model as IFC STEP (.ifc) and upload it again.'],
    }
  }

  const content = await file.text()
  if (!/^\s*ISO-10303-21\s*;/i.test(content)) {
    return { ...base, errors: ['The file is not a valid IFC STEP exchange file.'] }
  }

  const model = parseIFCStep(content)
  if (model.entities.size === 0) {
    return { ...base, errors: ['No supported IFC STEP entities were found in the DATA section.'] }
  }

  const metadata = extractProjectMetadata(model)
  const inventoryTypes = [
    'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
    'IFCWALL', 'IFCSLAB', 'IFCCOLUMN', 'IFCBEAM', 'IFCPIPESEGMENT',
    'IFCFLOWSEGMENT', 'IFCMANHOLE', 'IFCGRID', 'IFCSURVEYPOINT',
  ]
  const counts = inventoryTypes.flatMap((type) => {
    const count = model.byType.get(type)?.length ?? 0
    return count > 0 ? [`${type}: ${count}`] : []
  })
  const declaredCrs = metadata.epsgCode ? `EPSG:${metadata.epsgCode}` : 'not identified'
  const extractedText = [
    'IFC STEP model inventory',
    `Project: ${metadata.name || file.name}`,
    `Schema: ${model.header.schema || 'not declared'}`,
    `Declared projected CRS: ${declaredCrs}`,
    `Entities parsed: ${model.entities.size}`,
    ...counts,
  ].join('\n')
  const hasMapConversion = model.byType.has('IFCMAPCONVERSION')

  return {
    ...base,
    extractedText,
    confidence: 0.5,
    warnings: [
      'This import inventories IFC entities only; it does not create survey geometry, transform coordinates, or verify model units.',
      hasMapConversion && metadata.epsgCode
        ? 'A declared IFC map conversion and EPSG identifier were found, but the transform has not been applied. Do not use these values as survey control or set-out.'
        : 'No complete, verified IFC georeferencing was applied. BIM coordinates may be local and must not be treated as survey control or set-out.',
    ],
  }
}
