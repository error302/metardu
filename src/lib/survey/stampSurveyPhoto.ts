/**
 * stampSurveyPhoto.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Creates a visible, user-supplied field-photo annotation for beacon and site photos.
 *
 * The stamp is burned directly into the image bitmap canvas (not an HTML overlay)
 * The annotation is not a digital signature, survey verification, or proof of
 * authenticity. Callers should preserve and store the original photo separately.
 */

export interface SurveyStampMetadata {
  beaconId: string
  monumentType?: string
  easting?: number
  northing?: number
  lat?: number
  lng?: number
  elevation?: number
  accuracy?: number
  datum?: string
  timestamp?: string
  surveyorName?: string
  surveyorLicense?: string
  lrNumber?: string
  notes?: string
}

/**
 * Creates an annotated JPEG preview. This does not authenticate the photo or
 * make its metadata suitable for survey control or statutory submission.
 */
export async function stampSurveyPhoto(
  imageFile: File,
  metadata: SurveyStampMetadata
): Promise<{ stampedFile: File; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read photo file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image data'))
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const width = img.naturalWidth || img.width
          const height = img.naturalHeight || img.height
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Could not obtain canvas 2D context'))
            return
          }

          // 1. Draw Original Image
          ctx.drawImage(img, 0, 0, width, height)

          // Scale font and padding based on image resolution (e.g. 12MP phone camera)
          const scale = Math.max(1, width / 1200)
          const stampLines: string[] = []
          if (metadata.easting != null && metadata.northing != null) {
            const coordinates = `PROJECT E/N (USER-SUPPLIED): ${metadata.easting.toFixed(3)} m, ${metadata.northing.toFixed(3)} m`
            stampLines.push(metadata.datum ? `${coordinates} | CRS: ${metadata.datum}` : `${coordinates} | CRS: NOT RECORDED`)
          }
          if (metadata.lat != null && metadata.lng != null) {
            const accuracy = metadata.accuracy != null ? ` | device accuracy ±${metadata.accuracy.toFixed(1)} m` : ''
            stampLines.push(`DEVICE GPS (EXIF): ${metadata.lat.toFixed(7)}°, ${metadata.lng.toFixed(7)}°${accuracy}`)
          }
          if (metadata.elevation != null) stampLines.push(`LEVEL (USER-SUPPLIED): ${metadata.elevation.toFixed(3)} m`)
          if (stampLines.length === 0) stampLines.push('LOCATION: NOT RECORDED')

          const bannerHeight = Math.round((90 + stampLines.length * 22) * scale)
          const bannerY = height - bannerHeight

          // 2. High-contrast annotation banner (semi-opaque carbon black)
          ctx.fillStyle = 'rgba(15, 15, 20, 0.88)'
          ctx.fillRect(0, bannerY, width, bannerHeight)

          // Border separator
          ctx.fillStyle = '#f59e0b'
          ctx.fillRect(0, bannerY, width, Math.max(3, Math.round(4 * scale)))

          // Left accent bar
          ctx.fillStyle = '#10b981'
          ctx.fillRect(0, bannerY, Math.round(12 * scale), bannerHeight)

          // 3. Render Header Text
          const padX = Math.round(24 * scale)
          let textY = bannerY + Math.round(24 * scale)

          ctx.font = `bold ${Math.round(13 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
          ctx.fillStyle = '#f59e0b'
          const title = `METARDU FIELD PHOTO ANNOTATION${metadata.lrNumber ? ` — ${metadata.lrNumber.toUpperCase()}` : ''}`
          ctx.fillText(title, padX, textY, Math.max(0, width - padX * 3))

          // Timestamp on right of header
          const nowStr = metadata.timestamp || 'NOT RECORDED'
          ctx.font = `bold ${Math.round(11 * scale)}px "JetBrains Mono", monospace`
          ctx.fillStyle = '#9ca3af'
          const timeText = `CAPTURE TIME: ${nowStr}`
          const timeWidth = ctx.measureText(timeText).width
          ctx.fillText(timeText, width - timeWidth - padX, textY, width - padX * 2)

          // 4. Primary Beacon ID & Monument Description
          textY += Math.round(26 * scale)
          ctx.font = `bold ${Math.round(18 * scale)}px "JetBrains Mono", monospace`
          ctx.fillStyle = '#ffffff'
          const beaconStr = `BEACON: ${metadata.beaconId ? metadata.beaconId.toUpperCase() : 'NOT RECORDED'} [${(metadata.monumentType || 'TYPE NOT RECORDED').toUpperCase()}]`
          ctx.fillText(beaconStr, padX, textY)

          // 5. Coordinates and levels retain their source labels.
          ctx.font = `${Math.round(13 * scale)}px "JetBrains Mono", monospace`
          ctx.fillStyle = '#34d399'
          for (const line of stampLines) {
            textY += Math.round(22 * scale)
            ctx.fillText(line, padX, textY, width - padX * 2)
          }

          // 6. Surveyor attribution; this image annotation does not authenticate identity.
          textY += Math.round(22 * scale)
          ctx.font = `${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, sans-serif`
          ctx.fillStyle = '#d1d5db'

          const surveyorStr = `ATTRIBUTION: ${metadata.surveyorName || 'NOT RECORDED'} | REGISTRATION: ${metadata.surveyorLicense || 'NOT RECORDED'} | NOT VERIFIED`
          ctx.fillText(surveyorStr, padX, textY, width - padX * 2)

          // 7. Mini Watermark Badge on Top-Right Corner of Photo
          const topBadgeW = Math.round(220 * scale)
          const topBadgeH = Math.round(36 * scale)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
          ctx.fillRect(width - topBadgeW - 12, 12, topBadgeW, topBadgeH)
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = Math.max(1, Math.round(1.5 * scale))
          ctx.strokeRect(width - topBadgeW - 12, 12, topBadgeW, topBadgeH)

          ctx.font = `bold ${Math.round(10 * scale)}px "JetBrains Mono", monospace`
          ctx.fillStyle = '#f59e0b'
          ctx.fillText('PHOTO NOTE · UNVERIFIED', width - topBadgeW + 4, 12 + Math.round(16 * scale), topBadgeW - 8)
          ctx.font = `${Math.round(9 * scale)}px "JetBrains Mono", monospace`
          ctx.fillStyle = '#e5e7eb'
          ctx.fillText(`BEACON ${metadata.beaconId ? metadata.beaconId.toUpperCase() : 'NOT RECORDED'}`, width - topBadgeW + 4, 12 + Math.round(28 * scale), topBadgeW - 8)

          // 8. Convert to JPEG Blob and File
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas export to blob failed'))
                return
              }
              const stampedFileName = imageFile.name.replace(/\.[^/.]+$/, '') + '_annotated.jpg'
              const stampedFile = new File([blob], stampedFileName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
              resolve({ stampedFile, dataUrl })
            },
            'image/jpeg',
            0.92
          )
        } catch (err) {
          reject(err)
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(imageFile)
  })
}
