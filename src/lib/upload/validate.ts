/**
 * File upload validation — MIME type + size + name checks.
 */
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  documents: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'],
  dxf: ['application/dxf', 'text/plain', 'application/octet-stream'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/gif'],
}

const MAX_FILE_SIZES: Record<string, number> = {
  documents: 10 * 1024 * 1024,   // 10 MB
  dxf: 50 * 1024 * 1024,        // 50 MB
  csv: 5 * 1024 * 1024,          // 5 MB
  image: 10 * 1024 * 1024,       // 10 MB
}

export function validateUpload(
  file: File,
  category: keyof typeof ALLOWED_MIME_TYPES
): string | null {
  const allowed = ALLOWED_MIME_TYPES[category]
  if (!allowed) return `Unknown upload category: ${category}`
  
  if (!allowed.includes(file.type) && !allowed.includes('application/octet-stream')) {
    return `File type ${file.type} not allowed for ${category}. Allowed: ${allowed.join(', ')}`
  }
  
  const maxSize = MAX_FILE_SIZES[category] ?? 10 * 1024 * 1024
  if (file.size > maxSize) {
    return `File exceeds maximum size of ${Math.round(maxSize / 1024 / 1024)}MB for ${category}`
  }
  
  // Double extension / executable attacks
  if (/\.(php|sh|exe|bat|cmd|js|ts|py|rb|pl)\./i.test(file.name)) {
    return 'Suspicious file name detected'
  }
  
  // Null bytes
  if (file.name.includes('\x00')) {
    return 'Invalid file name'
  }
  
  return null
}
