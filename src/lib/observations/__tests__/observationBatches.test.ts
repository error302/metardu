/**
 * Unit tests for Observation Batches & Evidence Events
 *
 * Blueprint reference:
 *   §2.3 Raw observations immutable
 *   §5.2 Observe — observation batches and source metadata
 *   §14.3 Evidence events
 */

import { computeSha256 } from '../observationBatches'

describe('Observation Batches & Evidence Events', () => {
  describe('computeSha256', () => {
    it('computes deterministic 64-character hex hash from string', () => {
      const data = 'STATION,E,N,Z,CODE\nBM1,250000.123,9850000.456,1650.234,BM'
      const hash1 = computeSha256(data)
      const hash2 = computeSha256(data)

      expect(hash1).toHaveLength(64)
      expect(hash1).toBe(hash2)
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('computes deterministic hash from buffer', () => {
      const buf = Buffer.from('RAW_OBSERVATION_DATA')
      const hash = computeSha256(buf)
      expect(hash).toHaveLength(64)
      expect(hash).toBe(computeSha256('RAW_OBSERVATION_DATA'))
    })

    it('produces different hashes for different data', () => {
      const h1 = computeSha256('batch_1')
      const h2 = computeSha256('batch_2')
      expect(h1).not.toBe(h2)
    })
  })
})
