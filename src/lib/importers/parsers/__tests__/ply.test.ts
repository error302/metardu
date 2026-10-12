import { parsePly } from '../ply'

function asFile(contents: string): File {
  const bytes = new TextEncoder().encode(contents)
  return {
    size: bytes.byteLength,
    slice: (start?: number, end?: number) => ({
      arrayBuffer: async () => bytes.slice(start ?? 0, end ?? bytes.byteLength).buffer,
    }),
  } as unknown as File
}

describe('parsePly', () => {
  it('reads ASCII PLY by named coordinate properties, not column order', async () => {
    const file = asFile([
      'ply',
      'format ascii 1.0',
      'element vertex 2',
      'property float z',
      'property uchar red',
      'property double x',
      'property float y',
      'end_header',
      '1200.5 255 500100.25 9800100.5',
      '1201.5 0 500101.25 9800101.5',
      '',
    ].join('\n'))

    const result = await parsePly(file)

    expect(result.points).toHaveLength(2)
    expect(result.points[0]).toMatchObject({ easting: 500100.25, northing: 9800100.5, rl: 1200.5 })
    expect(result.metadata).toMatchObject({ totalPoints: 2, processedPoints: 2, truncated: false })
  })

  it('rejects binary PLY instead of parsing bytes as zero coordinates', async () => {
    const file = asFile('ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n')
    await expect(parsePly(file)).rejects.toThrow('ASCII PLY 1.0 only')
  })

  it('rejects non-numeric coordinates', async () => {
    const file = asFile('ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\na 2 3\n')
    await expect(parsePly(file)).rejects.toThrow('non-numeric coordinate')
  })

  it('marks a capped preview as truncated and preserves the file point count', async () => {
    const vertices = Array.from({ length: 100_001 }, (_, index) => `${index} ${index + 1} ${index + 2}`).join('\n')
    const file = asFile(`ply\nformat ascii 1.0\nelement vertex 100001\nproperty float x\nproperty float y\nproperty float z\nend_header\n${vertices}\n`)

    const result = await parsePly(file)

    expect(result.points).toHaveLength(100_000)
    expect(result.metadata.totalPoints).toBe(100_001)
    expect(result.metadata.processedPoints).toBe(100_000)
    expect(result.metadata.truncated).toBe(true)
  })
})
