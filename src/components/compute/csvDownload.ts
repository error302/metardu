export function downloadRowsCsv(filename: string, headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : String(value)
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  const content = [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
