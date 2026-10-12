import type { CapturedBeaconPhoto } from '@/components/fieldbook/BeaconPhotoCapture'
import type { PhotoData } from './offlineStorage'

const MAX_FIELD_PHOTO_BYTES = 50 * 1024 * 1024

function inferContentType(file: File): string {
  if (file.type) return file.type.toLowerCase()
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'heic') return 'image/heic'
  if (extension === 'heif') return 'image/heif'
  return 'application/octet-stream'
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

/**
 * Prepare the untouched original image for durable offline storage. EXIF is
 * retained as descriptive device metadata only; no CRS conversion or survey
 * control interpretation is performed here.
 */
export async function prepareCapturedPhotoData(
  photos: CapturedBeaconPhoto[],
  projectId: string,
  options: { pointId?: string; pointName?: string; observationClientId?: string } = {},
): Promise<PhotoData[]> {
  return Promise.all(photos.map(async photo => {
    if (photo.file.size <= 0 || photo.file.size > MAX_FIELD_PHOTO_BYTES) {
      throw new Error(`${photo.file.name || 'Photo'} exceeds the 50 MB field-photo limit or is empty.`)
    }

    const contentType = inferContentType(photo.file)
    if (!['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(contentType)) {
      throw new Error(`${photo.file.name || 'Photo'} has an unsupported image type.`)
    }

    const bytes = new Uint8Array(await photo.file.arrayBuffer())
    const exif = photo.exif
    const capturedAt = exif?.timestampRecorded ? exif.timestamp.toISOString() : undefined
    const metadata: Record<string, unknown> = {
      source: 'original field image',
      fileName: photo.file.name,
      contentType,
      sizeBytes: photo.file.size,
      gpsMetadataStatus: exif ? 'device EXIF; unverified' : photo.missingGps ? 'no GPS tag found' : 'not read',
      coordinatesAreSurveyControl: false,
      crsTransformApplied: false,
      verticalDatum: exif?.altitudeRecorded ? 'unknown' : null,
      exif: exif ? {
        latitude: exif.latitude,
        longitude: exif.longitude,
        datumLabel: exif.gpsDatum,
        accuracyM: exif.accuracy >= 0 ? exif.accuracy : null,
        altitudeM: exif.altitudeRecorded ? exif.altitude : null,
        altitudeReference: exif.altitudeRecorded ? exif.altitudeRef : null,
        captureTime: capturedAt ?? null,
        cameraMake: exif.cameraMake || null,
        cameraModel: exif.cameraModel || null,
        headingDeg: exif.heading >= 0 ? exif.heading : null,
      } : null,
    }

    return {
      id: crypto.randomUUID(),
      projectId,
      pointId: options.pointId,
      pointName: options.pointName,
      observationClientId: options.observationClientId,
      data: `data:${contentType};base64,${toBase64(bytes)}`,
      contentType,
      fileName: photo.file.name || `field-photo.${contentType.split('/')[1]}`,
      caption: photo.caption.trim() || undefined,
      capturedAt,
      metadata,
    }
  }))
}
