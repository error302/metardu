import { getFieldSession } from '../fieldSession'
import { useInstrumentStore } from '@/stores/instrumentStore'
import { getObservations, saveObservation } from '@/lib/offline/fieldBookDB'

jest.mock('@/lib/offline/fieldBookDB', () => ({
  saveObservation: jest.fn(),
  getObservations: jest.fn().mockResolvedValue([]),
  syncObservations: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
}))

const saveObservationMock = jest.mocked(saveObservation)
const getObservationsMock = jest.mocked(getObservations)

const latestPoint = {
  id: 'instrument-reading-1',
  pointName: 'GNSS-01',
  latitude: -1.2864,
  longitude: 36.8172,
  northing: 9857660.12,
  easting: 258144.33,
  elevation: 1684.2,
  timestamp: new Date('2026-10-12T08:00:00.000Z'),
  source: 'nmea' as const,
  quality: 4,
  satellites: 18,
  hdop: 0.8,
}

describe('field session point capture persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getObservationsMock.mockResolvedValue([])
    useInstrumentStore.getState().clearPoints()
    useInstrumentStore.getState().addPoint(latestPoint)
  })

  it('does not report a point as captured when offline storage rejects the write', async () => {
    saveObservationMock.mockRejectedValueOnce(new Error('IndexedDB write failed'))
    const session = getFieldSession(`storage-failure-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({ pointId: 'RD1', notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1' })

    expect(result).toBeNull()
    expect(session.getSnapshot().measurements).toHaveLength(0)
    expect(session.getSnapshot().pendingSyncCount).toBe(0)
  })

  it('accepts a point only after the local observation write succeeds', async () => {
    saveObservationMock.mockResolvedValueOnce(undefined)
    const projectId = `storage-success-${Date.now()}`
    const session = getFieldSession(projectId, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({ pointId: 'RD1', notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1' })

    expect(result?.pointId).toBe('RD1')
    expect(session.getSnapshot().measurements).toHaveLength(1)
    expect(session.getSnapshot().pendingSyncCount).toBe(1)
    const savedObservation = saveObservationMock.mock.calls[0]?.[0]
    expect(savedObservation?.projectId).toBe(projectId)
    expect(savedObservation?.notes).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1')
    expect(savedObservation?.easting).toBe(latestPoint.easting)
    expect(savedObservation?.northing).toBe(latestPoint.northing)
  })

  it('restores a captured point ID from the offline observation after reload', async () => {
    getObservationsMock.mockResolvedValueOnce([{
      id: 'offline-observation-1',
      projectId: 'resume-project',
      surveyType: 'traverse',
      station: 'STN-01',
      notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD7',
      createdAt: '2026-10-12T08:00:00.000Z',
      syncedAt: null,
    }])
    const session = getFieldSession('resume-project', 'engineering')

    const loaded = await session.loadMeasurements()

    expect(loaded).toBe(true)
    expect(session.getSnapshot().measurements[0]?.pointId).toBe('RD7')
    expect(session.getSnapshot().pendingSyncCount).toBe(1)
  })

  it('reports a failed local load so the collector can pause capture', async () => {
    getObservationsMock.mockRejectedValueOnce(new Error('IndexedDB read failed'))
    const session = getFieldSession(`load-failure-${Date.now()}`, 'engineering')

    await expect(session.loadMeasurements()).resolves.toBe(false)
  })
})
