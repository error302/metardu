import { inflateSync } from 'node:zlib'
import { horizontalCrsFor } from '@/lib/spatial/projectReferenceSystem'
import { generateBeaconCertificate, type BeaconCertificateData } from '../templates/beacon-certificate'

function pdfTextStreams(pdf: Buffer): string {
  const binary = pdf.toString('latin1')
  const streams: string[] = []
  for (const match of binary.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
      for (const operator of content.matchAll(/\[([^\]]*)\]\s*TJ/gi)) {
        const glyphRuns: string[] = []
        for (const glyphs of operator[1].matchAll(/<([\da-f]+)>/gi)) {
          glyphRuns.push(Buffer.from(glyphs[1].length % 2 ? `${glyphs[1]}0` : glyphs[1], 'hex').toString('latin1'))
        }
        streams.push(glyphRuns.join(''))
      }
    } catch {
      // Ignore non-page streams such as metadata and fonts.
    }
  }
  return streams.join('\n')
}

const baseData: BeaconCertificateData = {
  beaconName: 'B-01',
  beaconType: 'Concrete Beacon',
  beaconCondition: 'Found intact',
  easting: 500_000,
  northing: 9_900_000,
  elevation: 1_625.125,
  country: 'kenya',
  horizontalCrs: 'EPSG:21037',
  description: 'Concrete beacon found flush with the ground.',
  dateOfEstablishment: '2026-11-25',
  surveyorName: 'Surveyor Example',
  surveyorLicense: 'LIC-123',
  date: '2026-11-25',
  projectReference: 'Project Example',
}

describe('beacon preservation certificate PDF', () => {
  it('prints the selected jurisdiction, registry CRS, and jurisdictional beacon rule as an uncertified draft', async () => {
    const pdf = await generateBeaconCertificate(baseData)
    const text = pdfTextStreams(pdf)

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(text).toContain('KENYA')
    expect(text).toContain('Arc 1960 / UTM Zone 37S (EPSG:21037)')
    expect(text).toContain('Kenya Survey Reg 39-50')
    expect(text).toContain('DRAFT')
    expect(text).toContain('NOT CERTIFIED')
    expect(text).not.toContain('REPUBLIC OF KENYA')
    expect(text).not.toContain('FOR DIRECTOR OF SURVEYS')
  })

  it('derives the statutory beacon rule from the selected jurisdiction rather than Kenya', async () => {
    const pdf = await generateBeaconCertificate({
      ...baseData,
      country: 'bahrain',
      horizontalCrs: horizontalCrsFor('WGS84', 39, 'N'),
    })
    const text = pdfTextStreams(pdf)

    expect(text).toContain('BAHRAIN')
    expect(text).toContain('Bahrain CSD 2nd Ed 2024')
    expect(text).not.toContain('Kenya Survey Reg 39-50')
    expect(text).not.toContain('REPUBLIC OF KENYA')
  })

  it('refuses to issue a certificate without a registered projected CRS in metres', async () => {
    await expect(generateBeaconCertificate({ ...baseData, horizontalCrs: '' }))
      .rejects.toThrow(/coordinate reference|CRS registry/i)
    await expect(generateBeaconCertificate({ ...baseData, horizontalCrs: 'EPSG:4326' }))
      .rejects.toThrow(/geographic/i)
  })

  it('refuses an unrecognised jurisdiction instead of falling back to a default country', async () => {
    await expect(generateBeaconCertificate({
      ...baseData,
      country: 'not-a-jurisdiction' as BeaconCertificateData['country'],
    })).rejects.toThrow(/jurisdiction|country/i)
  })
})
