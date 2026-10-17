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
  elevation: 1684.2,
  timestamp: new Date('2026-10-12T08:00:00.000Z'),
  source: 'nmea' as const,
  quality: 4,
  satellites: 18,
  hdop: 0.8,
}
const PROJECT_CRS = 'EPSG:32737'
const MISMATCHED_PROJECT_CRS = 'EPSG:32637'

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
    expect(result?.fixQuality).toBe('fixed')
    expect(session.getSnapshot().measurements).toHaveLength(1)
    expect(session.getSnapshot().pendingSyncCount).toBe(1)
    const savedObservation = saveObservationMock.mock.calls[0]?.[0]
    expect(savedObservation?.projectId).toBe(projectId)
    expect(savedObservation?.notes).toBe('ROAD_CODE=CL; CHAINAGE_M=0; METARDU_POINT_ID=RD1; INSTRUMENT_READING_ID=instrument-reading-1')
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

  it.each([undefined, 0, Number.NaN])('does not capture an NMEA reading with invalid fix quality (%s)', async quality => {
    const session = getFieldSession(`gnss-no-fix-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      reading: { ...latestPoint, id: `no-fix-reading-${String(quality)}`, quality },
    })

    expect(result).toBeNull()
    expect(saveObservationMock).not.toHaveBeenCalled()
  })

  it('does not store GNSS coordinates when the project CRS is display-only', async () => {
    const session = getFieldSession(`gnss-display-crs-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({ pointId: 'RD1', projectCrs: 'EPSG:3857' })

    expect(result).toBeNull()
    expect(saveObservationMock).not.toHaveBeenCalled()
  })

  it('captures an explicit equator GNSS reading without treating zero as a missing coordinate', async () => {
    saveObservationMock.mockResolvedValueOnce(undefined)
    const projectId = `equator-reading-${Date.now()}`
    const session = getFieldSession(projectId, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })

    const result = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      reading: {
        id: 'equator-reading-001',
        pointName: 'EQ-01',
        source: 'nmea',
        timestamp: new Date('2026-10-13T08:00:00.000Z'),
        latitude: 0,
        longitude: 37,
        elevation: 0,
        quality: 4,
      },
    })

    expect(result?.latitude).toBe(0)
    expect(result?.longitude).toBe(37)
    expect(result?.easting).toBeGreaterThan(250_000)
    expect(result?.easting).toBeLessThan(300_000)
    expect(result?.northing).toBeCloseTo(10_000_000, 1)
    expect(result?.elevation).toBe(0)
    expect(saveObservationMock.mock.calls[0]?.[0]?.easting).toBe(result?.easting)
  })

  it('requires total-station coordinates to match the declared project CRS and preserves a zero elevation', async () => {
    const session = getFieldSession(`station-crs-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })
    const reading = {
      id: 'station-reading-001',
      pointName: 'TS-01',
      source: 'gsi' as const,
      timestamp: new Date('2026-10-13T08:00:00.000Z'),
      easting: 500000,
      northing: 9900000,
      elevation: 0,
    }

    const mismatched = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      coordinateCrs: MISMATCHED_PROJECT_CRS,
      reading,
    })
    expect(mismatched).toBeNull()
    expect(saveObservationMock).not.toHaveBeenCalled()

    saveObservationMock.mockResolvedValueOnce(undefined)
    const accepted = await session.captureMeasurement({
      pointId: 'RD2',
      projectCrs: PROJECT_CRS,
      coordinateCrs: PROJECT_CRS,
      reading,
    })
    expect(accepted?.instrumentType).toBe('total_station')
    expect(accepted?.latitude).toBeUndefined()
    expect(accepted?.longitude).toBeUndefined()
    expect(accepted?.elevation).toBe(0)
  })

  it('does not save the same instrument reading twice under different point IDs', async () => {
    saveObservationMock.mockResolvedValue(undefined)
    const session = getFieldSession(`duplicate-reading-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })
    const reading = {
      id: 'same-reading-id',
      pointName: 'GNSS-01',
      source: 'nmea' as const,
      timestamp: new Date(),
      latitude: -1.2864,
      longitude: 36.8172,
      elevation: 0,
      quality: 4,
    }

    const first = await session.captureMeasurement({ pointId: 'RD1', reading, projectCrs: PROJECT_CRS })
    const second = await session.captureMeasurement({ pointId: 'RD2', reading, projectCrs: PROJECT_CRS })

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(saveObservationMock).toHaveBeenCalledTimes(1)
  })

  it('keeps NMEA RTK float and differential fixes distinct from RTK fixed', async () => {
    saveObservationMock.mockResolvedValue(undefined)
    const session = getFieldSession(`fix-labels-${Date.now()}`, 'engineering')
    session.setupStation({ stationName: 'STN-01', instrumentHeight: 1.5, targetHeight: 2, isControlPoint: true })
    const base = {
      pointName: 'GNSS',
      source: 'nmea' as const,
      timestamp: new Date(),
      latitude: -1.2864,
      longitude: 36.8172,
      elevation: 0,
    }

    const rtkFloat = await session.captureMeasurement({
      pointId: 'RD1',
      projectCrs: PROJECT_CRS,
      reading: { ...base, id: 'float-reading', quality: 5 },
    })
    const dgps = await session.captureMeasurement({
      pointId: 'RD2',
      projectCrs: PROJECT_CRS,
      reading: { ...base, id: 'dgps-reading', quality: 2 },
    })

    expect(rtkFloat?.fixQuality).toBe('float')
    expect(dgps?.fixQuality).toBe('dgps')
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
