/** @jest-environment node */
import { AppError } from '../errors'

describe('Error Handling', () => {
  describe('AppError', () => {
    it('should create error with message and status code', () => {
      const err = new AppError('Not found', 404, 'NOT_FOUND')
      expect(err.message).toBe('Not found')
      expect(err.statusCode).toBe(404)
      expect(err.code).toBe('NOT_FOUND')
    })

    it('should default to 500 status code', () => {
      const err = new AppError('Server error')
      expect(err.statusCode).toBe(500)
      expect(err.code).toBe('INTERNAL_ERROR')
    })
  })
})
