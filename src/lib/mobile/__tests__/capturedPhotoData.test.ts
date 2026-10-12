import { prepareCapturedPhotoData } from '../capturedPhotoData'
import type { EXIFGPSData } from '@/lib/engineering/exifPhoto'
import type { CapturedBeaconPhoto } from '@/components/fieldbook/BeaconPhotoCapture'

function makePhoto(exif: EXIFGPSData | null, capturedAt = false): CapturedBeaconPhoto {
  const bytes = Uint8Array.from([1, 2, 3])
  const file = {
    name: 'site.png',
    size: bytes.byteLength,
    type: 'image/png',
    arrayBuffer: async () => bytes.buffer,
  } as File
  const gps = exif ? { ...exif, timestampRecorded: capturedAt } : null
  return {
    previewUrl: 'blob:preview',
    file,
    exif: gps,
    missingGps: !gps,
    caption: 'Outlet headwall',
  }
}

describe('prepareCapturedPhotoData', () => {
  it('retains original image bytes and treats device EXIF as descriptive only', async () => {
    const exif = {
      latitude: -1.2921,
      longitude: 36.8219,
      gpsDatum: null,
      altitude: 0,
      altitudeRef: 'unknown',
      altitudeRecorded: false,
      timestamp: new Date('2026-10-05T08:30:00.000Z'),
      timestampRecorded: false,
      cameraMake: 'Example',
      cameraModel: 'Field Phone',
      heading: -1,
      accuracy: -1,
      filename: 'site.png',
      thumbnail: null,
    } as unknown as EXIFGPSData

    const [photo] = await prepareCapturedPhotoData([makePhoto(exif)], 'project-1', {
      pointId: 'MH-02',
      observationClientId: 'observation-1',
    })

    expect(photo.data).toBe('data:image/png;base64,AQID')
    expect(photo.contentType).toBe('image/png')
    expect(photo.fileName).toBe('site.png')
    expect(photo.capturedAt).toBeUndefined()
    expect(photo.observationClientId).toBe('observation-1')
    expect(photo.metadata?.coordinatesAreSurveyControl).toBe(false)
    expect(photo.metadata?.crsTransformApplied).toBe(false)
    expect(photo.metadata?.verticalDatum).toBeNull()
    expect(photo.metadata?.gpsMetadataStatus).toBe('device EXIF; unverified')
  })

  it('does not invent EXIF time or coordinates when no GPS metadata exists', async () => {
    const [photo] = await prepareCapturedPhotoData([makePhoto(null)], 'project-2')
    expect(photo.capturedAt).toBeUndefined()
    expect(photo.metadata?.gpsMetadataStatus).toBe('no GPS tag found')
    expect(photo.metadata?.exif).toBeNull()
  })

  it('records capture time only when the file explicitly contains one', async () => {
    const exif = {
      latitude: 1,
      longitude: 2,
      gpsDatum: 'GPS datum label',
      altitude: 12,
      altitudeRef: 'above',
      altitudeRecorded: true,
      timestamp: new Date('2026-10-05T08:30:00.000Z'),
      timestampRecorded: true,
      cameraMake: '',
      cameraModel: '',
      heading: -1,
      accuracy: 4,
      filename: 'site.png',
      thumbnail: null,
    } as unknown as EXIFGPSData
    const [photo] = await prepareCapturedPhotoData([makePhoto(exif, true)], 'project-2')
    expect(photo.capturedAt).toBe('2026-10-05T08:30:00.000Z')
    expect((photo.metadata?.exif as Record<string, unknown>).datumLabel).toBe('GPS datum label')
    expect(photo.metadata?.verticalDatum).toBe('unknown')
  })
})
