import { photosToLocationNotes, type EXIFGPSData } from '../exifPhoto'

const photoResult = (altitudeRecorded: boolean) => ({
  file: {} as File,
  hasEXIF: true,
  exif: {
    latitude: -1.286389,
    longitude: 36.817223,
    gpsDatum: null,
    altitude: 1795.2,
    altitudeRef: 'above',
    timestamp: new Date('2026-01-02T03:04:05Z'),
    timestampRecorded: true,
    altitudeRecorded,
    cameraMake: 'Example',
    cameraModel: 'Camera',
    heading: -1,
    accuracy: -1,
    filename: 'site.jpg',
    thumbnail: null,
  } satisfies EXIFGPSData,
})

describe('photo location metadata', () => {
  test('does not invent a height when the EXIF file contains no altitude value', () => {
    const [note] = photosToLocationNotes([photoResult(false)])
    expect(note.exifGpsAltitudeM).toBeNull()
    expect(note.verticalDatum).toBeNull()
    expect(note.description).toMatch(/altitude: not recorded/i)
  })

  test('returns location notes instead of pretending camera GPS is project survey control', () => {
    const [note] = photosToLocationNotes([photoResult(true)])
    expect(note).toMatchObject({ latitude: -1.286389, longitude: 36.817223, gpsDatum: null, exifGpsAltitudeM: 1795.2, verticalDatum: null })
    expect(note).not.toHaveProperty('easting')
    expect(note).not.toHaveProperty('northing')
    expect(note).not.toHaveProperty('elevation')
    expect(note.description).toMatch(/unverified device metadata/i)
    expect(note.description).toMatch(/vertical datum unknown/i)
  })
})
