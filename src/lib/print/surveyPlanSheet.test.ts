import { buildSurveyPlanSheetDocument, openSurveyPlanSheet, surveyPlanSheets } from './surveyPlanSheet'
import { mmToPx } from '@/lib/reports/surveyPlan/geometry'
import { bundleSurveySheets } from '@/lib/reports/surveyPlan/schedulePages'

const width = mmToPx(420), height = mmToPx(297)
const plan = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><text x="40" y="40">UNVERIFIED DRAFT</text></svg>`

test('isolates physical A3 output from preview zoom and application navigation', () => {
  const html = buildSurveyPlanSheetDocument(plan, 'Project <unsafe>')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.title).toBe('Project <unsafe> — print sheet')
  expect(doc.querySelector('unsafe')).toBeNull()
  expect(doc.querySelector('svg')?.getAttribute('width')).toBe('420mm')
  expect(doc.querySelector('svg')?.getAttribute('height')).toBe('297mm')
  expect(html).toContain('@page { size: 420mm 297mm; margin: 0; }')
  expect(html).toContain('transform: none')
  expect(html).toContain('@media print { .print-tools { display: none; }')
  expect(doc.querySelector('nav')).toBeNull()
  expect(doc.querySelector('.plan-sheet')?.textContent).toContain('UNVERIFIED DRAFT')
})

test('crops recorded sheet rows as well as columns, with individual page breaks', () => {
  const combined = plan.replace(`0 0 ${width} ${height}`, `0 0 ${2 * width} ${2 * height}`)
  const sheets = surveyPlanSheets(combined, 3)
  expect(sheets).toHaveLength(3)
  expect(sheets[2]).toContain(`viewBox="0 ${height} ${width} ${height}"`)
  expect(buildSurveyPlanSheetDocument(combined, 'Three sheets', 3)).toContain('break-after: page')
  expect(() => surveyPlanSheets(plan, 3)).toThrow(/sheet count/)
  for (const count of [0, 51, 1.5, NaN]) expect(() => surveyPlanSheets(plan, count)).toThrow()
})

test('removes active content, external resources and injected print CSS', () => {
  const dirty = plan.replace('</svg>', '<style>@page{size:1mm}</style><script>alert(1)</script><a href="https://invalid.example"><text onclick="alert(1)" style="transform:scale(3)">unsafe</text></a><image href="https://invalid.example/x"/></svg>')
  const sheet = surveyPlanSheets(dirty)[0]
  expect(sheet).not.toMatch(/<style|<script|<image|<a\b|onclick|href|transform:scale|@page/)
})

test('extracts only each actual sheet, with a valid independent SVG namespace', () => {
  const bundle = bundleSurveySheets(['<text>first-page-only</text>', '<text>second-page-only</text>', '<text>third-page-only</text>'], width, height)
  const sheets = surveyPlanSheets(bundle)
  expect(sheets).toHaveLength(3)
  sheets.forEach((sheet, index) => {
    const doc = new DOMParser().parseFromString(sheet, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.documentElement.getAttribute('width')).toBe('420mm')
    expect(doc.documentElement.hasAttribute('x')).toBe(false)
    expect(doc.documentElement.textContent).toContain(['first-page-only', 'second-page-only', 'third-page-only'][index])
    expect(doc.documentElement.querySelectorAll('svg')).toHaveLength(0)
  })
  expect(sheets[0]).not.toContain('second-page-only')
  expect(() => surveyPlanSheets(bundle, 1)).toThrow(/sheet count/)
})

test('populates the owned landing document even when navigation drops initial Window load listeners', async () => {
  jest.useFakeTimers()
  const document = new DOMParser().parseFromString('<html><body>Preparing</body></html>', 'text/html')
  Object.defineProperty(document, 'URL', { value: `${window.location.origin}/print/survey-plan` })
  Object.defineProperty(document, 'readyState', { value: 'complete' })
  const popup = { closed: false, location: { href: `${window.location.origin}/print/survey-plan`, origin: window.location.origin, pathname: '/print/survey-plan' }, document, opener: window, print: jest.fn() }
  const open = jest.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  try {
    const pending = openSurveyPlanSheet(plan, 'Owned draft')
    jest.advanceTimersByTime(200)
    await pending
    expect(document.querySelector('svg')?.getAttribute('width')).toBe('420mm')
    expect(popup.opener).toBeNull()
    document.getElementById('print-plan-sheet')?.click()
    expect(popup.print).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  } finally { open.mockRestore(); jest.useRealTimers() }
})
