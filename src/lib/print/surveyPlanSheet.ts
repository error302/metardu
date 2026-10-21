import { sanitizeHtml } from '@/lib/security/sanitize'
import { escapeXml } from '@/lib/reports/surveyPlan/symbols'
import { mmToPx, PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '@/lib/reports/surveyPlan/geometry'

/** Separate physical sheets from preview zoom and the surrounding workspace. */
export function surveyPlanSheets(svg: string, count?: number): string[] {
  if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 50)) throw new Error('Choose between 1 and 50 recorded plan sheets.')
  const document = new DOMParser().parseFromString(sanitizeHtml(svg), 'image/svg+xml')
  const root = document.documentElement
  if (root.localName !== 'svg' || document.querySelector('parsererror')) throw new Error('The plan SVG could not be prepared for printing.')
  const inertTags = new Set(['svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan'])
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!inertTags.has(element.localName) || element.namespaceURI !== 'http://www.w3.org/2000/svg') element.remove()
  }
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const physicalSheets = Array.from(root.children).filter(element => element.localName === 'svg' && element.classList.contains('survey-plan-sheet'))
  if (physicalSheets.length) {
    if (physicalSheets.length > 50 || (count !== undefined && count !== physicalSheets.length)) throw new Error('The sheet count does not match the rendered plan.')
    return physicalSheets.map((element, index) => {
      const sheet = element.cloneNode(true) as SVGElement
      if (sheet.getAttribute('viewBox') !== `0 0 ${mmToPx(420)} ${mmToPx(297)}`) throw new Error('An individual plan sheet has invalid paper dimensions.')
      sheet.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
      sheet.setAttribute('width', '420mm'); sheet.setAttribute('height', '297mm')
      sheet.removeAttribute('x'); sheet.removeAttribute('y')
      sheet.setAttribute('aria-label', `Survey plan sheet ${index + 1} of ${physicalSheets.length}`)
      for (const node of [sheet, ...Array.from(sheet.querySelectorAll('*'))]) {
        node.removeAttribute('style'); node.removeAttribute('href'); node.removeAttribute('src')
      }
      return new XMLSerializer().serializeToString(sheet)
    })
  }
  count ??= 1
  const columns = Math.ceil(Math.sqrt(count))
  const pageWidth = mmToPx(PAGE_WIDTH_MM), pageHeight = mmToPx(PAGE_HEIGHT_MM)
  const rows = Math.ceil(count / columns)
  if (!viewBox || viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox[0] !== 0 || viewBox[1] !== 0
    || Math.abs(viewBox[2] - columns * pageWidth) > 0.1 || Math.abs(viewBox[3] - rows * pageHeight) > 0.1) {
    throw new Error('The recorded sheet count does not match the plan viewport. Regenerate the saved plan before printing.')
  }
  return Array.from({ length: count }, (_, index) => {
    const sheet = root.cloneNode(true) as SVGElement
    sheet.setAttribute('viewBox', `${index % columns * pageWidth} ${Math.floor(index / columns) * pageHeight} ${pageWidth} ${pageHeight}`)
    sheet.setAttribute('width', `${PAGE_WIDTH_MM}mm`)
    sheet.setAttribute('height', `${PAGE_HEIGHT_MM}mm`)
    sheet.setAttribute('aria-label', `Survey plan sheet ${index + 1} of ${count}`)
    // Generated geometry uses presentation attributes. No external resources
    // or preview transforms belong in a standalone print document.
    for (const element of [sheet, ...Array.from(sheet.querySelectorAll('*'))]) {
      element.removeAttribute('style')
      element.removeAttribute('href')
      element.removeAttribute('src')
    }
    return new XMLSerializer().serializeToString(sheet)
  })
}

export function buildSurveyPlanSheetDocument(svg: string, title: string, count?: number): string {
  const sheets = surveyPlanSheets(svg, count)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeXml(title)} — print sheet</title>
<style>
@page { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Arial, sans-serif; }
.print-tools { padding: 16px; background: #f3f1ec; border-bottom: 1px solid #ccc; font-size: 14px; }
.print-tools button { margin-right: 12px; padding: 8px 16px; cursor: pointer; }
.plan-sheet { width: ${PAGE_WIDTH_MM}mm; height: ${PAGE_HEIGHT_MM}mm; break-inside: avoid; break-after: page; overflow: hidden; }
.plan-sheet:last-child { break-after: auto; }
.plan-sheet > svg { display: block; width: ${PAGE_WIDTH_MM}mm; height: ${PAGE_HEIGHT_MM}mm; max-width: none; transform: none; }
@media screen { body { background: #ddd; } .plan-sheet { margin: 16px auto; background: white; box-shadow: 0 2px 10px #0002; } }
@media print { .print-tools { display: none; } .plan-sheet { margin: 0; box-shadow: none; } body { width: ${PAGE_WIDTH_MM}mm; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><header class="print-tools"><button id="print-plan-sheet" type="button">Print A3 sheet</button>
A3 landscape · Actual size / 100% · Disable browser headers and footers. Use the scale bar to check the printed sheet. This is an unverified draft.</header>
${sheets.map((sheet, index) => `<section class="plan-sheet" aria-label="Sheet ${index + 1} of ${sheets.length}">${sheet}</section>`).join('')}
</body></html>`
}

export async function openSurveyPlanSheet(svg: string, title: string, count?: number): Promise<void> {
  const html = buildSurveyPlanSheetDocument(svg, title, count)
  const popup = window.open('/print/survey-plan', '_blank')
  if (!popup) throw new Error('Allow the print-sheet tab to open, then try again. Your saved plan is unchanged.')
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { window.clearInterval(poll); window.clearTimeout(timeout) }
    const populate = () => {
      try {
        if (popup.closed) throw new Error('The print tab was closed. Reopen Print A3 sheet from the saved plan.')
        if (popup.location.href === 'about:blank' || popup.document.URL === 'about:blank' || popup.document.readyState !== 'complete') return
        if (popup.location.origin !== window.location.origin || popup.location.pathname !== '/print/survey-plan') throw new Error('The print tab did not open on the expected application page. Reload the saved plan before retrying.')
        cleanup()
        popup.document.open()
        popup.document.write(html)
        popup.document.close()
        popup.opener = null
        popup.document.getElementById('print-plan-sheet')?.addEventListener('click', () => popup.print())
        resolve()
      } catch (error) { cleanup(); reject(error) }
    }
    // Navigation replaces the initial blank Window's event listeners in some
    // browsers. Wait for the owned landing document itself, not its old Window.
    const poll = window.setInterval(populate, 200)
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('The print tab did not load. Return to the saved plan and retry.')) }, 120000)
  })
}
