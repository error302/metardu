export type TotalStationFormat = 
  | 'gsi' | 'jobxml' | 'topcon' | 'sokkia' | 'south' | 'csv' | 'unknown'

export function detectTotalStationFormat(
  content: string, 
  filename: string
): TotalStationFormat {
  const ext = filename.toLowerCase().split('.').pop()
  const firstLine = content.trim().split('\n')[0]?.trim() || ''

  if (ext === 'gsi') return 'gsi'
  if (ext === 'job' || ext === 'jxl') return 'jobxml'
  if (ext === 'sdr') return 'sokkia'
  if (ext === 'dat') return 'south'

  if (content.includes('<JOBFile') || content.includes('<PointRecord')) 
    return 'jobxml'
  if (firstLine.startsWith('*') || /^\d{2}[0-9A-F]{2}/.test(firstLine)) 
    return 'gsi'
  if (firstLine.startsWith('08')) return 'sokkia'

  // South detection: explicit header or SS observation row with DMS angles
  if (firstLine.toLowerCase().startsWith('south,')) return 'south'
  if (/^SS,\d+,/.test(firstLine) && /\d{2,3}\.\d{4}/.test(firstLine)) return 'south'

  if (/^\w+,[\d.]+,[\d.]+,[\d.]+/.test(firstLine)) return 'topcon'

  return 'unknown'
}
