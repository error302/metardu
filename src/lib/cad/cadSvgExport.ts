import type { CADDocument } from '@/components/cad-editor/CADEditor'
import { prepareCadSurveyExport, validateCadExportDocument } from './cadExportValidation'
import {cadDrawingBounds} from './cadDrawingBounds'

/** Serialize a clean scene copy; leave the interactive DOM and draft unchanged. */
export function generateCadDocumentSvg(source: SVGSVGElement, document: CADDocument): string {
  const validated = validateCadExportDocument(document)
  const doc = validated.coordinateReferenceSystem ? prepareCadSurveyExport(validated) : validated
  if (!doc.coordinateReferenceSystem && (doc.originEasting !== undefined || doc.originNorthing !== undefined)) throw new RangeError('Declare the Coordinate reference before exporting a drawing with a grid origin.')
  if (doc.backgroundImage?.visible && !/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(doc.backgroundImage.url)) throw new RangeError('Attach an embedded PNG, JPEG, WebP or GIF, or hide the image before SVG export. Remote or executable image references cannot produce a self-contained plan.')
  for (const annotation of doc.annotations) {
    if (annotation.type === 'line' && (annotation.x2 === undefined || annotation.y2 === undefined)) throw new RangeError('A line annotation needs both endpoints before export.')
    if (annotation.color && !/^(?:#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})|black|white|red|green|blue|gray|grey|transparent)$/i.test(annotation.color)) throw new RangeError('Choose a plain annotation colour before SVG export.')
  }
  const clone = source.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-cad-editor-only]').forEach(node => node.remove())
  clone.querySelectorAll('[data-cad-export-stroke], [data-cad-export-stroke-width], [data-cad-export-fill]').forEach(node => {
    for (const name of ['stroke', 'stroke-width', 'fill']) {
      const value = node.getAttribute(`data-cad-export-${name}`)
      if (value !== null) node.setAttribute(name, value)
    }
  })
  const edges = new Map(doc.boundaries.map(edge => [edge.id, edge]))
  clone.querySelectorAll('[data-cad-boundary-label]').forEach(node => {
    const edge = edges.get(node.getAttribute('data-cad-boundary-label') ?? '')
    if (edge) node.textContent = `${edge.bearing} ${edge.distanceM !== undefined ? `${edge.distance}m` : edge.distance}`
  })
  for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attribute of Array.from(node.attributes)) {
      if (/^(?:data-|on)/i.test(attribute.name) || ['style', 'class', 'tabindex', 'role', 'aria-label'].includes(attribute.name)) node.removeAttribute(attribute.name)
    }
  }
  const bounds=cadDrawingBounds(doc)
  clone.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
  clone.setAttribute('preserveAspectRatio','xMidYMid meet')
  const paper=clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg','rect')
  for(const [key,value] of Object.entries(bounds))paper.setAttribute(key,String(value))
  paper.setAttribute('fill','#ffffff');clone.insertBefore(paper,clone.firstChild)
  clone.setAttribute('width', String(doc.width)); clone.setAttribute('height', String(doc.height))
  clone.removeAttribute('xmlns')
  clone.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
  const reference = doc.coordinateReferenceSystem ?? 'UNREFERENCED'
  for (const [name, value] of [['title', `${doc.titleBlock.projectName || 'METARDU drawing'} — draft`],
    ['desc', `DRAFT — NOT CERTIFIED. CRS: ${reference}. ${doc.coordinateReferenceSystem ? 'Grid units: metres.' : 'Grid coordinates have no declared CRS.'} Verify print scale and survey accuracy.`],
    ['metadata', JSON.stringify({ format: 'METARDU CAD SVG', crs: doc.coordinateReferenceSystem ?? null, metersPerCanvasUnit: doc.metersPerPixel ?? null, originEasting: doc.originEasting ?? null, originNorthing: doc.originNorthing ?? null, certified: false })]]) {
    const element = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name)
    element.textContent = value; clone.insertBefore(element, clone.firstChild)
  }
  const footer = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text')
  footer.setAttribute('x', '12'); footer.setAttribute('y', String(doc.height - 10)); footer.setAttribute('font-size', '8'); footer.setAttribute('fill', '#334155')
  footer.textContent = `DRAFT — NOT CERTIFIED | ${reference}${doc.coordinateReferenceSystem ? ' | metres' : ''} | verify print scale`
  clone.appendChild(footer)
  return new XMLSerializer().serializeToString(clone)
}
