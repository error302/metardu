/** Parse RFC 4180 style comma separated text, including escaped quotes and quoted line breaks. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true
    } else if (char === ',') {
      record.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      record.push(cell)
      if (record.some((value) => value.trim())) records.push(record)
      record = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (inQuotes) throw new Error('CSV contains an unclosed quoted field.')
  record.push(cell)
  if (record.some((value) => value.trim())) records.push(record)
  return records
}
