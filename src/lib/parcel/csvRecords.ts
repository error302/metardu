/** Parse RFC 4180 style comma separated text, including escaped quotes and quoted line breaks. */
export function parseCsvRecords(text: string, options: { strict?: boolean; maxRecords?: number } = {}): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let inQuotes = false
  let afterQuote = false
  const appendRecord = () => {
    if (record.some((value) => value.trim())) records.push(record)
    if (options.maxRecords !== undefined && records.length > options.maxRecords) {
      throw new Error(`CSV exceeds the ${options.maxRecords - 1} data-row limit.`)
    }
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
        afterQuote = true
      } else {
        cell += char
      }
      continue
    }

    if (options.strict && afterQuote && char !== ',' && char !== '\n' && char !== '\r') {
      throw new Error('CSV has characters after a closing quote.')
    }
    if (options.strict && char === '"' && cell.length > 0) {
      throw new Error('CSV has a quote inside an unquoted field.')
    }
    if (char === '"' && cell.length === 0) {
      inQuotes = true
      afterQuote = false
    } else if (char === ',') {
      record.push(cell)
      cell = ''
      afterQuote = false
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      record.push(cell)
      appendRecord()
      record = []
      cell = ''
      afterQuote = false
    } else {
      cell += char
    }
  }

  if (inQuotes) throw new Error('CSV contains an unclosed quoted field.')
  record.push(cell)
  appendRecord()
  return records
}
