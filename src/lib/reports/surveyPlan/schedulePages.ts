import { mmToPx } from './geometry'
import { escapeXml } from './symbols'

export interface ScheduleTable { title: string; headings: string[]; rows: string[][]; fractions: number[]; minWidth?: number }
export interface ScheduleFrame { x: number; top: number; bottom: number; width: number }

/** Conservative Helvetica widths at 10 SVG px; wrapping is presentation only. */
function textWidth(value: string): number {
  return Array.from(value).reduce((sum, char) => sum + (/[MW@%]/.test(char) ? 10 : /[ilI.,:;'!| ]/.test(char) ? 3 : /[A-Z0-9]/.test(char) ? 7 : /[a-z]/.test(char) ? 6 : 10), 0)
}

export function wrapScheduleText(value: string, width: number): string[] {
  if (!Number.isFinite(width) || width < 12) throw new Error('A schedule column is too narrow to print legibly.')
  const lines: string[] = []
  let line = ''
  for (const word of (value || '—').split(/\s+/)) {
    if (line && textWidth(`${line} ${word}`) > width) { lines.push(line); line = '' }
    for (const char of word) {
      if (textWidth(line + char) > width) { lines.push(line); line = '' }
      line += char
    }
    line += ' '
  }
  if (line.trim()) lines.push(line.trim())
  return lines.length ? lines : ['—']
}

/** Retains every row, repeats table headings, and never puts a row across pages. */
export function paginateScheduleTables(tables: ScheduleTable[], first: ScheduleFrame, continuation: ScheduleFrame): string[] {
  const pages = ['']
  let frame = first, y = frame.top
  const next = () => {
    if (pages.length >= 50) throw new Error('This plan exceeds 50 schedule sheets. Split the deliverable into explicitly identified packages.')
    pages.push(''); frame = continuation; y = frame.top
  }
  const text = (x: number, baseline: number, value: string, bold = false) => `<text x="${x}" y="${baseline}" font-family="helvetica, Arial, sans-serif" font-size="10" font-weight="${bold ? 'bold' : 'normal'}" fill="#000">${escapeXml(value)}</text>`
  for (const table of tables) {
    if (!table.fractions.length || table.fractions.some(value => value <= 0) || Math.abs(table.fractions.reduce((a, b) => a + b, 0) - 1) > 1e-6
      || (table.headings.length && table.headings.length !== table.fractions.length) || table.rows.some(row => row.length !== table.fractions.length)) throw new Error('The plan schedule has inconsistent columns.')
    let index = 0, continued = false
    if (table.minWidth && frame.width < table.minWidth) {
      if (continuation.width < table.minWidth) throw new Error('The schedule requires a wider physical sheet.')
      next()
    }
    do {
      const widths = table.fractions.map(fraction => fraction * frame.width)
      const row = table.rows[index]
      const wrapped = row?.map((value, column) => wrapScheduleText(value, widths[column] - mmToPx(3)))
      const rowH = wrapped ? Math.max(...wrapped.map(lines => lines.length)) * mmToPx(3.5) + mmToPx(1) : 0
      const headerH = mmToPx(table.headings.length ? 12 : 7)
      if (y + headerH + rowH + mmToPx(1) > frame.bottom) {
        if (frame === continuation && y === frame.top) throw new Error('An individual schedule row exceeds the printable sheet. Retain the original and split its presentation into identified continuation rows.')
        next(); continue
      }
      const top = y
      let body = text(frame.x + mmToPx(2), y + mmToPx(4), table.title + (continued ? ' (continued)' : ''), true)
      y += mmToPx(7)
      if (table.headings.length) {
        let x = frame.x
        table.headings.forEach((heading, column) => { body += text(x + mmToPx(1), y + mmToPx(3), heading, true); x += widths[column] })
        y += mmToPx(5)
      }
      let added = 0
      while (index < table.rows.length) {
        const lines = table.rows[index].map((value, column) => wrapScheduleText(value, widths[column] - mmToPx(3)))
        const height = Math.max(...lines.map(values => values.length)) * mmToPx(3.5) + mmToPx(1)
        if (y + height + mmToPx(1) > frame.bottom) break
        let x = frame.x
        lines.forEach((values, column) => {
          values.forEach((value, line) => { body += text(x + mmToPx(1), y + mmToPx(3 + line * 3.5), value) })
          x += widths[column]
        })
        y += height; index++; added++
      }
      if (row && !added) throw new Error('An individual schedule row exceeds the printable sheet. Shorten its presentation text while retaining the original record.')
      y += mmToPx(1)
      pages[pages.length - 1] += `<g class="plan-panel-section"><rect x="${frame.x}" y="${top}" width="${frame.width}" height="${y - top}" fill="white" stroke="#000" stroke-width="0.5"/>${body}</g>`
      y += mmToPx(3)
      if (index < table.rows.length) { next(); continued = true }
    } while (index < table.rows.length)
  }
  return pages
}

export function bundleSurveySheets(contents: string[], width: number, height: number): string {
  if (!contents.length || contents.length > 50) throw new Error('A plan must have between 1 and 50 actual sheets.')
  const columns = Math.ceil(Math.sqrt(contents.length)), rows = Math.ceil(contents.length / columns)
  return `<svg xmlns="http://www.w3.org/2000/svg" class="survey-plan-document" viewBox="0 0 ${columns * width} ${rows * height}" width="${columns * width}" height="${rows * height}">${contents.map((content, index) => `<svg class="survey-plan-sheet" x="${index % columns * width}" y="${Math.floor(index / columns) * height}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}<text x="${width / 2}" y="${mmToPx(13)}" text-anchor="middle" font-family="helvetica, Arial, sans-serif" font-size="10">Sheet ${index + 1} of ${contents.length}${index ? ' · Schedule continuation · UNVERIFIED DRAFT' : ''}</text></svg>`).join('')}</svg>`
}
