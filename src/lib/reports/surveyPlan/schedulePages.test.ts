import { bundleSurveySheets, paginateScheduleTables, wrapScheduleText } from './schedulePages'
import { mmToPx } from './geometry'

const first = { x: mmToPx(316), top: mmToPx(29), bottom: mmToPx(243), width: mmToPx(91) }
const continuation = { x: mmToPx(10), top: mmToPx(22), bottom: mmToPx(243), width: mmToPx(400) }

test('retains ordered station rows exactly once across physical pages with repeated headings', () => {
  const rows = Array.from({ length: 150 }, (_, index) => [`Station-${index + 1}`, `${500000 + index}.123`, `${9900000 + index}.456`])
  const pages = paginateScheduleTables([{ title: 'COORDINATE SCHEDULE', headings: ['Station', 'Easting', 'Northing'], rows, fractions: [0.26, 0.37, 0.37] }], first, continuation)
  expect(pages.length).toBeGreaterThan(2)
  const xml = new DOMParser().parseFromString(bundleSurveySheets(pages, mmToPx(420), mmToPx(297)), 'image/svg+xml')
  const stations = Array.from(xml.querySelectorAll('text')).map(node => node.textContent).filter(value => /^Station-\d+$/.test(value || ''))
  expect(stations).toEqual(rows.map(row => row[0]))
  for (const page of pages) {
    expect(page).toContain('COORDINATE SCHEDULE')
    expect(page).toContain('>Northing</text>')
    const doc = new DOMParser().parseFromString(`<svg>${page}</svg>`, 'image/svg+xml')
    for (const rect of Array.from(doc.querySelectorAll('rect'))) expect(Number(rect.getAttribute('y')) + Number(rect.getAttribute('height'))).toBeLessThanOrEqual(mmToPx(243))
  }
})

test('wraps and escapes long or hostile cell content without omitting it', () => {
  const value = '<script>MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM</script>'
  expect(wrapScheduleText(value, 80).join('').replaceAll(' ', '')).toBe(value)
  const pages = paginateScheduleTables([{ title: '<Title>', headings: [], rows: [[value]], fractions: [1] }], first, continuation)
  expect(pages.join('')).not.toContain('<script>')
  expect(pages.join('')).toContain('&lt;Title&gt;')
})

test('rejects malformed tables rather than printing missing or mismatched columns', () => {
  expect(() => paginateScheduleTables([{ title: 'Invalid', headings: ['A'], rows: [['one', 'two']], fractions: [1] }], first, continuation)).toThrow(/columns/)
})
