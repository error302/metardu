import {
  buildClientCoverLines,
  buildPhotoIndexCsv,
  buildSha256Manifest,
  hashPackageFile,
  renderClientCoverPdf,
  safePackagePhotoName,
} from '../clientPackageExtras'

describe('client package extras', () => {
  it('hashes package files and emits a verifiable manifest', () => {
    const file = hashPackageFile('deed-plan.pdf', Buffer.from('survey'))
    expect(file.bytes).toBe(6)
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(buildSha256Manifest([file])).toContain(`${file.sha256}  deed-plan.pdf`)
  })

  it('makes photo names safe and unique inside the ZIP', () => {
    const used = new Set<string>()
    expect(safePackagePhotoName('../../Site Photo!!.JPG', used)).toBe('Site_Photo_.JPG')
    expect(safePackagePhotoName('Site Photo!!.JPG', used)).toBe('Site_Photo_-2.JPG')
    expect(safePackagePhotoName('', used)).toBe('field-photo.jpg')
  })

  it('names photos that could not be retrieved instead of omitting them silently', () => {
    const csv = buildPhotoIndexCsv([
      { originalName: 'beacon, north.jpg', included: false, reason: 'The photo file could not be retrieved from storage.' },
      { originalName: 'gate.jpg', packageName: 'gate.jpg', included: true },
    ])
    expect(csv).toContain('"beacon, north.jpg"')
    expect(csv).toContain('not_included')
    expect(csv).toContain('gate.jpg')
  })

  it('builds a client-readable cover inventory and renders a PDF', () => {
    const file = hashPackageFile('06_Beacon_Coordinates.csv', Buffer.from('BP1,1,2'))
    const input = {
      projectName: 'Kamau Boundary Survey',
      clientName: 'Kamau Family',
      lrNumber: 'LR 123',
      parcelNumber: '45',
      county: 'Kiambu',
      locality: 'Ruiru',
      surveyType: 'cadastral',
      surveyorName: 'Mohamed',
      firmName: 'METARDU Surveys',
      iskNumber: 'ISK/001',
      generatedAt: '2026-11-17T00:00:00.000Z',
      files: [file],
      photos: [{ originalName: 'gate.jpg', packageName: 'gate.jpg', included: true }],
      brandingStrategy: 'company_logo' as const,
    }

    expect(buildClientCoverLines(input)).toEqual(expect.arrayContaining([
      'Project: Kamau Boundary Survey',
      'Client: Kamau Family',
      'Field photographs included: 1 of 1 recorded',
      expect.stringContaining('06_Beacon_Coordinates.csv — 7 bytes'),
    ]))
    expect(renderClientCoverPdf(input).subarray(0, 4).toString()).toBe('%PDF')
  })
})
