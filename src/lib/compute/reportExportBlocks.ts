/**
 * Read the structural subset produced by the survey report composer.
 * This is an inert conversion to text; no HTML, script, or resource is executed.
 */
export type ReportBlock = { kind: 'text'; text: string } | { kind: 'table'; head: string[][]; body: string[][] }

function plain(html: string): string {
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', deg: '°' }
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, value: string) => {
      if (!value.startsWith('#')) return entities[value.toLowerCase()] ?? entity
      const hex = value[1].toLowerCase() === 'x'
      const code = Number.parseInt(value.slice(hex ? 2 : 1), hex ? 16 : 10)
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : entity
    })
    .replace(/\s+/g, ' ').trim()
}

export function readReportBlocks(html: string): ReportBlock[] {
  const blocks: ReportBlock[] = []
  const inert = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|iframe|object)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
  const addText = (part: string) => {
    for (const line of part.split(/<br\b[^>]*>|<\/(?:div|p|li|h[1-6]|section|blockquote)>/i)) {
      const text = plain(line)
      if (text) blocks.push({ kind: 'text', text })
    }
  }
  let offset = 0
  for (const match of inert.matchAll(/<table\b[^>]*>([^]*?)<\/table\s*>/gi)) {
    addText(inert.slice(offset, match.index))
    const head: string[][] = [], body: string[][] = []
    for (const row of match[1].matchAll(/<tr\b[^>]*>([^]*?)<\/tr\s*>/gi)) {
      const cells = [...row[1].matchAll(/<(th|td)\b[^>]*>([^]*?)<\/\1\s*>/gi)]
      if (!cells.length) continue
      const values = cells.map(cell => plain(cell[2].replace(/<br\b[^>]*>/gi, ' ')))
      if (cells.every(cell => cell[1].toLowerCase() === 'th') && !body.length) head.push(values)
      else body.push(values)
    }
    if (head.length || body.length) blocks.push({ kind: 'table', head, body })
    offset = match.index + match[0].length
  }
  addText(inert.slice(offset))
  return blocks
}
