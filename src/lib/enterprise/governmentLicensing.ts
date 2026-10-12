import { db } from '@/lib/db'

export interface GovernmentLicense {
  id: string
  departmentName: string
  country: string
  licenseKey: string
  licenseType: 'department' | 'agency' | 'municipality' | 'federal'
  seats: number
  seatsUsed: number
  maxSeats: number
  usedSeats: number
  active: boolean
  issuedAt: number
  expiresAt: number | null
  validFrom: number
  validUntil: number | null
  status: 'active' | 'expiring' | 'expired' | 'inactive'
  features: string[]
  contactEmail: string
  contactName: string
  tier: 'basic' | 'professional' | 'enterprise'
}

export interface LicenseSeat {
  id: string
  userId: string
  userName: string
  userEmail: string
  role: 'admin' | 'surveyor' | 'viewer'
  assignedAt: number
}

export interface DepartmentUsage {
  licenseId: string
  period: 'monthly'
  /** Survey jobs are not yet instrumented as license usage. */
  surveyCount: null
  userCount: number
  /** Storage is not yet metered per license. */
  storageUsed: null
}

interface LicenseRow {
  id: string
  department_name: string
  country: string
  license_key: string
  max_seats: number
  used_seats: number
  active: boolean
  issued_at: Date | string
  expires_at: Date | string | null
  features: string[] | null
  contact_email: string | null
  contact_name: string | null
  tier: string
}

interface SeatRow {
  id: string
  assigned_to: string
  assigned_at: Date | string
  role: string | null
  full_name: string | null
  email: string | null
}

function toTimestamp(value: Date | string | null): number | null {
  if (value === null) return null
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function toLicense(row: LicenseRow): GovernmentLicense {
  const now = Date.now()
  const validFrom = toTimestamp(row.issued_at) ?? now
  const validUntil = toTimestamp(row.expires_at)
  const activeByDate = validUntil === null || validUntil > now
  const status: GovernmentLicense['status'] = !activeByDate
    ? 'expired'
    : !row.active
      ? 'inactive'
      : validUntil !== null && validUntil - now <= 30 * 24 * 60 * 60 * 1000
        ? 'expiring'
        : 'active'

  return {
    id: row.id,
    departmentName: row.department_name,
    country: row.country,
    licenseKey: row.license_key,
    licenseType: 'department',
    seats: row.max_seats,
    seatsUsed: row.used_seats,
    maxSeats: row.max_seats,
    usedSeats: row.used_seats,
    active: row.active,
    issuedAt: validFrom,
    expiresAt: validUntil,
    validFrom,
    validUntil,
    status,
    features: Array.isArray(row.features) ? row.features : [],
    contactEmail: row.contact_email ?? '',
    contactName: row.contact_name ?? '',
    tier: row.tier === 'basic' || row.tier === 'enterprise' ? row.tier : 'professional',
  }
}

function parseSeatRole(value: string | null): LicenseSeat['role'] {
  return value === 'admin' || value === 'viewer' ? value : 'surveyor'
}

function toSeat(row: SeatRow): LicenseSeat {
  return {
    id: row.id,
    userId: row.assigned_to,
    userName: row.full_name ?? '',
    userEmail: row.email ?? '',
    role: parseSeatRole(row.role),
    assignedAt: toTimestamp(row.assigned_at) ?? 0,
  }
}

export async function getGovernmentDepartments(country?: string) {
  const result = await db.query<{ department_name: string; country: string }>(
    `SELECT DISTINCT department_name, country
       FROM government_licenses
      WHERE ($1::text IS NULL OR lower(country) = lower($1))
      ORDER BY country, department_name`,
    [country ?? null],
  )
  return result.rows.map((row) => ({
    name: row.department_name,
    country: row.country,
  }))
}

export async function getDepartmentLicense(licenseId: string): Promise<GovernmentLicense | undefined> {
  const result = await db.query<LicenseRow>(
    'SELECT * FROM government_licenses WHERE id = $1 LIMIT 1',
    [licenseId],
  )
  return result.rows[0] ? toLicense(result.rows[0]) : undefined
}

export const getGovernmentLicense = getDepartmentLicense

export async function addLicenseSeat(
  licenseId: string,
  userId: string,
  _userName: string,
  _userEmail: string,
  role: LicenseSeat['role'],
): Promise<LicenseSeat | null> {
  try {
    return await assignLicenseSeat(licenseId, userId, role)
  } catch (error) {
    if (error instanceof Error && error.message === 'License not found') return null
    throw error
  }
}

export async function getDepartmentUsage(licenseId: string): Promise<DepartmentUsage> {
  const result = await db.query<{ id: string; active_seats: string }>(
    `SELECT l.id,
            (SELECT count(*)::text FROM license_seats s
              WHERE s.license_id = l.id AND s.assigned_to IS NOT NULL) AS active_seats
       FROM government_licenses l
      WHERE l.id = $1`,
    [licenseId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('License not found')
  return {
    licenseId: row.id,
    period: 'monthly',
    surveyCount: null,
    userCount: Number(row.active_seats),
    storageUsed: null,
  }
}

export async function getLicenseFeatures() {
  return [
    { id: 'nlims_integration', name: 'Kenya cadastral draft export (manual; no registry connection)' },
    { id: 'nlis_integration', name: 'Uganda registry integration (not configured)' },
    { id: 'tanzania_integration', name: 'Tanzania registry integration (not configured)' },
    { id: 'digital_signature', name: 'Digital Signature' },
    { id: 'audit_logs', name: 'Audit Logs' },
    { id: 'parcel_search', name: 'Parcel Search' },
    { id: 'boundary_validation', name: 'Boundary Validation' },
    { id: 'cadastral_reports', name: 'Cadastral Reports' },
    { id: 'mining_surveys', name: 'Mining Survey Tools' },
    { id: 'underground', name: 'Underground Survey' },
  ]
}

export async function renewLicense(licenseId: string, newExpiry: Date): Promise<GovernmentLicense> {
  if (!(newExpiry instanceof Date) || !Number.isFinite(newExpiry.getTime())) {
    throw new Error('A valid license expiry date is required.')
  }
  const result = await db.query<LicenseRow>(
    `UPDATE government_licenses
        SET expires_at = $2, active = TRUE, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [licenseId, newExpiry],
  )
  if (!result.rows[0]) throw new Error('License not found')
  return toLicense(result.rows[0])
}

export async function updateGovernmentLicense(
  licenseId: string,
  input: {
    departmentName?: string
    country?: string
    maxSeats?: number
    active?: boolean
    expiresAt?: Date
    features?: string[]
    contactEmail?: string
    contactName?: string
    tier?: 'basic' | 'professional' | 'enterprise'
  },
): Promise<GovernmentLicense | undefined> {
  if (input.maxSeats !== undefined && (!Number.isInteger(input.maxSeats) || input.maxSeats <= 0)) {
    throw new Error('Maximum seats must be a positive integer.')
  }
  if (input.expiresAt !== undefined && !(input.expiresAt instanceof Date && Number.isFinite(input.expiresAt.getTime()))) {
    throw new Error('A valid license expiry date is required.')
  }

  return db.transaction(async (client) => {
    const currentResult = await client.query<LicenseRow>(
      'SELECT * FROM government_licenses WHERE id = $1 FOR UPDATE',
      [licenseId],
    )
    const current = currentResult.rows[0]
    if (!current) return undefined
    if (input.maxSeats !== undefined && input.maxSeats < current.used_seats) {
      throw new Error('Maximum seats cannot be lower than the number of assigned seats.')
    }

    const columns: Array<[keyof typeof input, string]> = [
      ['departmentName', 'department_name'],
      ['country', 'country'],
      ['maxSeats', 'max_seats'],
      ['active', 'active'],
      ['expiresAt', 'expires_at'],
      ['contactEmail', 'contact_email'],
      ['contactName', 'contact_name'],
      ['tier', 'tier'],
    ]
    const assignments: string[] = []
    const values: unknown[] = []
    for (const [key, column] of columns) {
      const value = input[key]
      if (value === undefined) continue
      assignments.push(`${column} = $${values.length + 1}`)
      values.push(typeof value === 'string' ? value.trim() : value)
    }
    if (input.features !== undefined) {
      assignments.push(`features = $${values.length + 1}::jsonb`)
      values.push(JSON.stringify(input.features))
    }
    if (assignments.length === 0) return toLicense(current)

    values.push(licenseId)
    const result = await client.query<LicenseRow>(
      `UPDATE government_licenses
          SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *`,
      values,
    )
    return result.rows[0] ? toLicense(result.rows[0]) : undefined
  })
}

export async function deactivateLicense(licenseId: string): Promise<void> {
  const result = await db.query(
    'UPDATE government_licenses SET active = FALSE, updated_at = NOW() WHERE id = $1',
    [licenseId],
  )
  if (result.rowCount === 0) throw new Error('License not found')
}

export async function assignLicenseSeat(
  licenseId: string,
  userId: string,
  role: string = 'surveyor',
): Promise<LicenseSeat> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('A valid user UUID is required.')
  }
  const validRole = parseSeatRole(role)

  return db.transaction(async (client) => {
    const licenseResult = await client.query<LicenseRow>(
      'SELECT * FROM government_licenses WHERE id = $1 FOR UPDATE',
      [licenseId],
    )
    const license = licenseResult.rows[0]
    if (!license) throw new Error('License not found')
    const expiresAt = toTimestamp(license.expires_at)
    if (!license.active || (expiresAt !== null && expiresAt <= Date.now())) {
      throw new Error('License is inactive or expired.')
    }

    const userResult = await client.query<{ id: string; full_name: string | null; email: string }>(
      'SELECT id, full_name, email FROM users WHERE id = $1',
      [userId],
    )
    const user = userResult.rows[0]
    if (!user) throw new Error('User not found')

    const existingSeat = await client.query(
      'SELECT 1 FROM license_seats WHERE license_id = $1 AND assigned_to = $2 LIMIT 1',
      [licenseId, userId],
    )
    if (existingSeat.rowCount) throw new Error('User already has a seat on this license.')

    const seatCountResult = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM license_seats
        WHERE license_id = $1 AND assigned_to IS NOT NULL`,
      [licenseId],
    )
    const seatsUsed = Number(seatCountResult.rows[0]?.count ?? 0)
    if (seatsUsed >= license.max_seats) throw new Error('License seat limit reached')

    const inserted = await client.query<SeatRow>(
      `INSERT INTO license_seats (license_id, assigned_to, metadata)
       VALUES ($1, $2, jsonb_build_object('role', $3::text))
       RETURNING id, assigned_to, created_at AS assigned_at,
                 metadata->>'role' AS role,
                 NULL::text AS full_name, NULL::text AS email`,
      [licenseId, userId, validRole],
    )
    await client.query(
      'UPDATE government_licenses SET used_seats = $2, updated_at = NOW() WHERE id = $1',
      [licenseId, seatsUsed + 1],
    )
    return toSeat({ ...inserted.rows[0], full_name: user.full_name, email: user.email })
  })
}

export async function revokeLicenseSeat(seatId: string): Promise<void> {
  await db.transaction(async (client) => {
    const seatResult = await client.query<{ license_id: string }>(
      'SELECT license_id FROM license_seats WHERE id = $1 FOR UPDATE',
      [seatId],
    )
    const licenseId = seatResult.rows[0]?.license_id
    if (!licenseId) throw new Error('License seat not found')
    await client.query('SELECT id FROM government_licenses WHERE id = $1 FOR UPDATE', [licenseId])
    await client.query('DELETE FROM license_seats WHERE id = $1', [seatId])
    await client.query(
      `UPDATE government_licenses
          SET used_seats = (SELECT count(*) FROM license_seats
                            WHERE license_id = $1 AND assigned_to IS NOT NULL),
              updated_at = NOW()
        WHERE id = $1`,
      [licenseId],
    )
  })
}

export async function getLicenseSeats(licenseId: string): Promise<LicenseSeat[]> {
  const result = await db.query<SeatRow>(
    `SELECT s.id, s.assigned_to, s.created_at AS assigned_at,
            s.metadata->>'role' AS role, u.full_name, u.email
       FROM license_seats s
       JOIN users u ON u.id = s.assigned_to
      WHERE s.license_id = $1
      ORDER BY s.created_at, s.id`,
    [licenseId],
  )
  return result.rows.map(toSeat)
}

export async function listGovernmentLicenses(options: {
  page: number
  pageSize: number
  activeOnly: boolean
}) {
  const page = Number.isInteger(options.page) && options.page > 0 ? options.page : 1
  const pageSize = Number.isInteger(options.pageSize)
    ? Math.min(100, Math.max(1, options.pageSize))
    : 20
  const activeClause = options.activeOnly
    ? 'WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW())'
    : ''
  const [countResult, rowsResult] = await Promise.all([
    db.query<{ count: string }>(`SELECT count(*)::text AS count FROM government_licenses ${activeClause}`),
    db.query<LicenseRow>(
      `SELECT * FROM government_licenses ${activeClause}
        ORDER BY created_at DESC, id
        LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    ),
  ])
  const total = Number(countResult.rows[0]?.count ?? 0)
  return {
    data: rowsResult.rows.map(toLicense),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function createGovernmentLicense(input: {
  departmentName: string
  country: string
  licenseKey: string
  maxSeats: number
  usedSeats: number
  active: boolean
  issuedAt: Date
  expiresAt: Date
  features: string[]
  contactEmail: string
  contactName: string
  tier: 'basic' | 'professional' | 'enterprise'
}): Promise<GovernmentLicense> {
  if (!Number.isInteger(input.maxSeats) || input.maxSeats <= 0) {
    throw new Error('Maximum seats must be a positive integer.')
  }
  if (!Number.isInteger(input.usedSeats) || input.usedSeats < 0 || input.usedSeats > input.maxSeats) {
    throw new Error('Used seats must be between zero and the maximum seat count.')
  }
  if (!(input.issuedAt instanceof Date) || !Number.isFinite(input.issuedAt.getTime())) {
    throw new Error('A valid issue date is required.')
  }
  if (!(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime())) {
    throw new Error('A valid expiry date is required.')
  }
  const result = await db.query<LicenseRow>(
    `INSERT INTO government_licenses
       (department_name, country, license_key, max_seats, used_seats, active,
        issued_at, expires_at, features, contact_email, contact_name, tier)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     RETURNING *`,
    [
      input.departmentName.trim(),
      input.country.trim(),
      input.licenseKey.trim(),
      input.maxSeats,
      input.usedSeats,
      input.active,
      input.issuedAt,
      input.expiresAt,
      JSON.stringify(input.features),
      input.contactEmail || null,
      input.contactName || null,
      input.tier,
    ],
  )
  return toLicense(result.rows[0])
}
