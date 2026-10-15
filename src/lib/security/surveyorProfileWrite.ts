// The generic browser proxy may edit declared profile details, never account
// authority, professional verification, suspension or earned marketplace metrics.
const EDITABLE_FIELDS = new Set([
  'user_id', 'display_name', 'isk_number', 'firm_name', 'county',
  'specializations', 'years_experience', 'bio', 'profile_public',
  'phone', 'email', 'office_address', 'seal_image_path', 'license_number',
  'registration_number', 'seal_url', 'signature_url',
])

export function isSafeSurveyorProfileWrite(operation: unknown, payload: unknown): boolean {
  if (operation === 'select') return true
  if (!['insert', 'update', 'upsert'].includes(String(operation))) return false
  const rows: unknown[] = Array.isArray(payload) ? payload : [payload]
  return rows.length > 0 && rows.every(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false
    const fields = Object.keys(row)
    return fields.length > 0 && fields.every(field => EDITABLE_FIELDS.has(field))
  })
}
