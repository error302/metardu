import { extractEXIFGPS } from '@/lib/engineering/exifPhoto'
import type { ParsedInput } from './types'

/** Extract GPS and camera metadata from JPEG EXIF without interpreting pixels. */
export async function parseImageFile(file: File, base: ParsedInput): Promise<ParsedInput> {
  if (!/\.(jpe?g)$/i.test(file.name)) {
    return {
      ...base,
      warnings: [
        'Photo OCR is not available. EXIF location metadata extraction is supported for JPEG files only.',
      ],
    }
  }

  try {
    const exif = await extractEXIFGPS(file)
    const extractedText = [
      'JPEG EXIF location metadata',
      `File: ${exif.filename}`,
      `EXIF GPS latitude: ${exif.latitude}`,
      `EXIF GPS longitude: ${exif.longitude}`,
      `EXIF GPS datum: ${exif.gpsDatum ?? 'not recorded'}`,
      `EXIF GPS altitude: ${exif.altitudeRecorded ? `${exif.altitude} m (${exif.altitudeRef} reference; vertical datum unknown)` : 'not recorded'}`,
      `Capture time: ${exif.timestampRecorded ? exif.timestamp.toISOString() : 'not recorded'}`,
      `Camera: ${[exif.cameraMake, exif.cameraModel].filter(Boolean).join(' ') || 'not recorded'}`,
      `GPS accuracy: ${exif.accuracy >= 0 ? `${exif.accuracy} m` : 'not recorded'}`,
      `Heading: ${exif.heading >= 0 ? `${exif.heading}°` : 'not recorded'}`,
    ].join('\n')

    return {
      ...base,
      extractedText,
      confidence: exif.accuracy >= 0 ? 0.5 : 0.25,
      warnings: [
        'These are device-reported EXIF metadata, not survey observations. The coordinate datum, horizontal accuracy, and height datum may be unknown; do not use as control, design levels, or set-out.',
        'Image OCR and drawing interpretation are not performed.',
      ],
    }
  } catch (error) {
    return {
      ...base,
      warnings: [
        error instanceof Error ? error.message : 'JPEG EXIF metadata could not be read.',
        'Image OCR and drawing interpretation are not performed.',
      ],
    }
  }
}
