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
  northing: 0,
  easting: 0,
  elevation: 1684.2,
  timestamp: new Date('2026-10-12T08:00:00.000Z'),
  source: 'nmea' as const,
  quality: 4,
  satellites: 18,
  hdop: 0.8,
}
const PROJECT_CRS = 'EPSG:32737'

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

    const result = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1',
    })

    expect(result).toBeNull()
    expect(session.getSnapshot().measurements).toHaveLength(0)
    expect(session.getSnapshot().pendingSyncCount).toBe(0)
  })

  it('accepts a point only after the local observation write succeeds', async () => {
    saveObservationMock.mockResolvedValueOnce(undefined)
    const projectId = `storage-success-${Date.now()}`
    const session = getFieldSession(projectId, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      notes: 'ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1',
    })

    expect(result?.pointId).toBe('RD1')
    expect(session.getSnapshot().measurements).toHaveLength(1)
    expect(session.getSnapshot().pendingSyncCount).toBe(1)
    const savedObservation = saveObservationMock.mock.calls[0]?.[0]
    expect(savedObservation?.projectId).toBe(projectId)
    expect(savedObservation?.notes).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1')
    expect(result?.easting).toBeCloseTo(257110.72, 2)
    expect(result?.northing).toBeCloseTo(9857710.0, 2)
    expect(savedObservation?.easting).toBeCloseTo(257110.72, 2)
    expect(savedObservation?.northing).toBeCloseTo(9857710.0, 2)
  })

  it('keeps GNSS-only coordinates from masquerading as projected easting/northing without a project CRS', async () => {
    saveObservationMock.mockResolvedValueOnce(undefined)
    const session = getFieldSession(`gnss-no-crs-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({ pointId: 'RD1' })

    expect(result?.latitude).toBe(latestPoint.latitude)
    expect(result?.longitude).toBe(latestPoint.longitude)
    expect(result?.easting).toBeUndefined()
    expect(result?.northing).toBeUndefined()
    expect(saveObservationMock.mock.calls[0]?.[0]?.easting).toBeUndefined()
  })

  it('does not store GNSS coordinates when the project CRS is display-only', async () => {
    const session = getFieldSession(`gnss-display-crs-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({ pointId: 'RD1', projectCrs: 'EPSG:3857' })

    expect(result).toBeNull()
    expect(saveObservationMock).not.toHaveBeenCalled()
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
