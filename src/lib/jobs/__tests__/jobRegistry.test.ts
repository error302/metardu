/**
 * Unit tests for Background Jobs Registry
 *
 * Blueprint reference:
 *   §21.5 Background jobs
 *   §31 P0 Background jobs
 */

import { db } from '@/lib/db'
import {
  SURVEY_JOB_TYPES,
  PROCESSABLE_JOB_TYPES,
  enqueueJob,
  isProcessableJobType,
  type ProcessableJobType,
} from '../jobRegistry'

jest.mock('@/lib/db', () => ({ db: { query: jest.fn() } }))

describe('Background Jobs Registry', () => {
  it('registers planned survey job types per Blueprint §21.5', () => {
    const requiredTypes = [
      'large_import',
      'topology_full_project',
      'surface_build',
      'contour_generation',
      'bulk_plan_generation',
      'submission_assembly',
      'large_dxf',
      'large_landxml',
      'report_batch',
    ]

    for (const t of requiredTypes) {
      expect(SURVEY_JOB_TYPES).toContain(t)
    }
  })

  it('includes standard export and submission types', () => {
    expect(SURVEY_JOB_TYPES).toContain('pdf_generation')
    expect(SURVEY_JOB_TYPES).toContain('dxf_generation')
    expect(SURVEY_JOB_TYPES).toContain('shapefile_generation')
    expect(SURVEY_JOB_TYPES).toContain('traverse_compute')
  })

  it('admits only types with deployed worker handlers', () => {
    expect(PROCESSABLE_JOB_TYPES).toEqual([
      'pdf_generation',
      'dxf_generation',
      'assemble_submission',
      'traverse_compute',
      'earthworks_boq',
    ])
    expect(isProcessableJobType('report_processing')).toBe(false)
    expect(isProcessableJobType('large_import')).toBe(false)
    expect(isProcessableJobType('topology_full_project')).toBe(false)
    expect(isProcessableJobType('bulk_plan_generation')).toBe(false)
  })

  it.each(['report_processing', 'large_import', 'topology_full_project', 'bulk_plan_generation'])(
    'rejects %s before touching the queue',
    async (jobType) => {
      await expect(enqueueJob({
        jobType: jobType as ProcessableJobType,
        payload: { project_id: 'project-1' },
      })).rejects.toThrow(/has no worker handler and cannot be enqueued/)
      expect(db.query).not.toHaveBeenCalled()
    },
  )
})
