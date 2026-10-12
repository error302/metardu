import { downloadBlob, parseXYZText } from '../helpers'

describe('contour source measurements', () => {
  it('rejects non-finite and partial numeric tokens without creating points', () => {
    for (const value of ['Infinity', '1e309', '500000m', '0x123']) {
      const result = parseXYZText(`Name,Easting,Northing,Elevation\nP1,${value},9900000,100`)
      expect(result.points).toEqual([])
      expect(result.errors).toHaveLength(1)
    }
  })
  it('preserves missing CSV cells instead of shifting height and quality into coordinates', () => {
    const result = parseXYZText('Name,Easting,Northing,Elevation,Quality\nP1,500000,,100,3')
    expect(result.points).toEqual([])
    expect(result.errors).toHaveLength(1)
  })
  it('retains a genuine zero and scientific notation without rounding source heights', () => {
    const result = parseXYZText('Name,Easting,Northing,Elevation\nP1,5e5,0,100.0054')
    expect(result.errors).toEqual([])
    expect(result.points).toEqual([{ name: 'P1', easting: 500000, northing: 0, elevation: 100.0054 }])
  })
  it('recognizes a reordered header after comments without swapping height and northing', () => {
    const result = parseXYZText('# Survey data\nNorthing,Easting,Height,ID\n9900000,500000,100,42')
    expect(result.errors).toEqual([])
    expect(result.points).toEqual([{ name: '42', easting: 500000, northing: 9900000, elevation: 100 }])
  })
  it('does not misclassify scientific XYZ data as a header and supports quoted CSV fields', () => {
    expect(parseXYZText('5e5,99e5,1e2').points).toEqual([{ name: 'P1', easting: 500000, northing: 9900000, elevation: 100 }])
    expect(parseXYZText('Name,Easting,Northing,Height\n"Control, A","500000.1234",9900000,100.0054').points)
      .toEqual([{ name: 'Control, A', easting: 500000.1234, northing: 9900000, elevation: 100.0054 }])
  })
  it('refuses headers missing a required coordinate instead of substituting another column', () => {
    const result = parseXYZText('Elevation,Northing,ID\n100,9900000,42')
    expect(result.points).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('downloadBlob', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
    } else {
      Reflect.deleteProperty(URL, 'createObjectURL')
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeObjectURL })
    } else {
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('keeps the object URL alive briefly after triggering the download', () => {
    jest.useFakeTimers()
    const createObjectURL = jest.fn().mockReturnValue('blob:contour-export')
    const revokeObjectURL = jest.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    downloadBlob(new Blob(['pdf-bytes'], { type: 'application/pdf' }), 'contour-plan-a3.pdf', 'application/pdf')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download="contour-plan-a3.pdf"]')).toBeNull()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:contour-export')
  })
})
