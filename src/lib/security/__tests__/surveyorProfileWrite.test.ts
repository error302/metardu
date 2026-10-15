import { isSafeSurveyorProfileWrite } from '../surveyorProfileWrite'

describe('surveyor profile proxy writes', () => {
  it.each(['role', 'verified_isk', 'is_suspended', 'suspension_reason', 'average_rating', 'jobs_completed', 'unexpected_column'])('rejects caller-supplied %s on every write path', field => {
    for (const operation of ['insert', 'update', 'upsert']) {
      expect(isSafeSurveyorProfileWrite(operation, { display_name: 'Survey team', [field]: true })).toBe(false)
    }
  })
  it('rejects mixed batches and deletion that could erase account restrictions', () => {
    expect(isSafeSurveyorProfileWrite('upsert', [{ display_name: 'Team' }, { role: 'admin' }])).toBe(false)
    expect(isSafeSurveyorProfileWrite('delete', undefined)).toBe(false)
    for (const payload of [undefined, null, [], [null], 'invalid', {}]) {
      expect(isSafeSurveyorProfileWrite('upsert', payload)).toBe(false)
    }
  })
  it('preserves reads and the existing document/community profile payloads', () => {
    expect(isSafeSurveyorProfileWrite('select', undefined)).toBe(true)
    const profile = { user_id: 'owner', display_name: 'Survey team', isk_number: 'declared, not verified', firm_name: 'Team', county: 'Nairobi', phone: null, email: 'team@example.invalid', office_address: null, seal_image_path: null, profile_public: true }
    expect(isSafeSurveyorProfileWrite('upsert', profile)).toBe(true)
    expect(isSafeSurveyorProfileWrite('update', { bio: 'Field surveyor', specializations: ['engineering'], years_experience: 2 })).toBe(true)
  })
})
