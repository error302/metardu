import type { ParsedInput, ParsedInputType } from '../types'
import { parseIFCFile } from '../parseIFC'
import { parseImageFile } from '../parseImage'

function baseFor(file: File, type: ParsedInputType): ParsedInput {
  return {
    type,
    sourceFileName: file.name,
    sourceFileSize: file.size,
    sourceFileLastModified: file.lastModified,
    parsedAt: new Date(0).toISOString(),
    version: '1.0.0',
    errors: [],
    warnings: [],
    confidence: 0,
  }
}

function fileStub(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content)
  return {
    name,
    size: bytes.byteLength,
    lastModified: 0,
    text: async () => content,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  } as File
}

describe('non-geometric IFC and photo imports', () => {
  test('inventories wrapped IFC STEP entities without claiming georeferenced geometry', async () => {
    const file = fileStub('control.ifc', `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('test'),'2;1');
FILE_NAME('control.ifc','2026-01-01',('Surveyor'),('METARDU'),'Test','Test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT(
  'project-id',
  $,
  'Control; network',
  $, $, $, $, $, $
);
#2=IFCWALL('wall-id',$,'Retaining wall',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;`)

    const result = await parseIFCFile(file, baseFor(file, 'IFC'))

    expect(result.errors).toEqual([])
    expect(result.extractedText).toContain('Project: Control; network')
    expect(result.extractedText).toContain('IFCWALL: 1')
    expect(result.warnings.join(' ')).toMatch(/does not create survey geometry/i)
    expect(result.warnings.join(' ')).toMatch(/not be treated as survey control or set-out/i)
    expect(result.building).toBeUndefined()
  })

  test('states clearly that IFCXML is unsupported instead of returning a false empty parse', async () => {
    const file = fileStub('model.ifcxml', '<ifcXML />')
    const result = await parseIFCFile(file, baseFor(file, 'IFC'))
    expect(result.errors.join(' ')).toMatch(/IFCXML is not supported/i)
  })

  test('reports photo metadata limitations without pretending OCR succeeded', async () => {
    const file = fileStub('site.jpg', 'not a JPEG')
    const result = await parseImageFile(file, baseFor(file, 'IMAGE'))
    expect(result.errors).toEqual([])
    expect(result.extractedText).toBeUndefined()
    expect(result.warnings.join(' ')).toMatch(/no EXIF data/i)
    expect(result.warnings.join(' ')).toMatch(/OCR and drawing interpretation are not performed/i)
  })
})
