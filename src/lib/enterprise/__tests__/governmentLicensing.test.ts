jest.mock('@/lib/db', () => ({
  db: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import {
  assignLicenseSeat,
  createGovernmentLicense,
  getDepartmentUsage,
  listGovernmentLicenses,
  updateGovernmentLicense,
} from '../governmentLicensing'

type QueryCall = [query: string, parameters?: unknown[]]

const licenseRow = {
  id: 'license-id',
  department_name: 'County Survey Office',
  country: 'Kenya',
  license_key: 'COUNTY-001',
  max_seats: 3,
  used_seats: 0,
  active: true,
  issued_at: new Date('2026-01-01T00:00:00Z'),
  expires_at: new Date('2027-01-01T00:00:00Z'),
  features: ['audit_logs'],
  contact_email: 'surveys@example.test',
  contact_name: 'Survey Admin',
  tier: 'professional',
}

describe('government licensing persistence', () => {
  beforeEach(() => jest.clearAllMocks())

  test('creates a license in PostgreSQL and returns the stored record', async () => {
    ;(db.query as jest.Mock).mockResolvedValue({ rows: [licenseRow], rowCount: 1 })

    const created = await createGovernmentLicense({
      departmentName: ' County Survey Office ',
      country: ' Kenya ',
      licenseKey: ' COUNTY-001 ',
      maxSeats: 3,
      usedSeats: 0,
      active: true,
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      features: ['audit_logs'],
      contactEmail: 'surveys@example.test',
      contactName: 'Survey Admin',
      tier: 'professional',
    })

    expect(db.query).toHaveBeenCalledTimes(1)
    const calls = (db.query as jest.Mock).mock.calls as QueryCall[]
    expect(calls[0][0]).toContain('INSERT INTO government_licenses')
    expect(created.id).toBe('license-id')
    expect(created.maxSeats).toBe(3)
    expect(created.licenseKey).toBe('COUNTY-001')
  })

  test('lists persisted licenses with bounded pagination', async () => {
    ;(db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [licenseRow] })

    const result = await listGovernmentLicenses({ page: 0, pageSize: 500, activeOnly: true })

    expect(result.pagination).toEqual({ page: 1, pageSize: 100, total: 1, totalPages: 1 })
    expect(result.data[0].departmentName).toBe('County Survey Office')
    const calls = (db.query as jest.Mock).mock.calls as QueryCall[]
    expect(calls[1][1]).toEqual([100, 0])
  })

  test('reports only observed seat use and marks unmetered usage unknown', async () => {
    ;(db.query as jest.Mock).mockResolvedValue({
      rows: [{ id: 'license-id', active_seats: '2' }],
    })

    await expect(getDepartmentUsage('license-id')).resolves.toEqual({
      licenseId: 'license-id',
      period: 'monthly',
      surveyCount: null,
      userCount: 2,
      storageUsed: null,
    })
  })

  test('assigns a seat in a transaction using actual users and capacity', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [licenseRow] })
      .mockResolvedValueOnce({ rows: [{ id: '123e4567-e89b-12d3-a456-426614174000', full_name: 'Surveyor One', email: 'one@example.test' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'seat-id', assigned_to: '123e4567-e89b-12d3-a456-426614174000', assigned_at: new Date('2026-02-01T00:00:00Z'), role: 'admin',
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    ;(db.transaction as jest.Mock).mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
      callback({ query: clientQuery }),
    )

    const seat = await assignLicenseSeat('license-id', '123e4567-e89b-12d3-a456-426614174000', 'admin')

    expect(seat).toMatchObject({
      id: 'seat-id',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      userName: 'Surveyor One',
      userEmail: 'one@example.test',
      role: 'admin',
    })
    const calls = clientQuery.mock.calls as QueryCall[]
    expect(calls[4][0]).toContain('INSERT INTO license_seats')
    expect(calls[5][1]).toEqual(['license-id', 2])
  })

  test('rejects reducing capacity below assigned seats and does not update the record', async () => {
    const clientQuery = jest.fn().mockResolvedValueOnce({
      rows: [{ ...licenseRow, used_seats: 2 }],
    })
    ;(db.transaction as jest.Mock).mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
      callback({ query: clientQuery }),
    )

    await expect(updateGovernmentLicense('license-id', { maxSeats: 1 }))
      .rejects.toThrow('Maximum seats cannot be lower than the number of assigned seats.')
    expect(clientQuery).toHaveBeenCalledTimes(1)
  })
})
