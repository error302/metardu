import {
  canAssignOrganizationRole,
  canManageOrganizationMembers,
  createOrganizationInvitationToken,
  hasSeatCapacity,
  hashOrganizationInvitationToken,
  makeOrganizationSlug,
} from '../security'

describe('organization access rules', () => {
  it('requires an organization admin and keeps admin promotion with the owner', () => {
    expect(canManageOrganizationMembers('surveyor')).toBe(false)
    expect(canAssignOrganizationRole({ actorRole: 'surveyor', actorIsOwner: false, targetIsOwner: false, nextRole: 'viewer' })).toBe(false)
    expect(canAssignOrganizationRole({ actorRole: 'org_admin', actorIsOwner: false, targetIsOwner: false, nextRole: 'surveyor' })).toBe(true)
    expect(canAssignOrganizationRole({ actorRole: 'org_admin', actorIsOwner: false, targetIsOwner: false, nextRole: 'org_admin' })).toBe(false)
    expect(canAssignOrganizationRole({ actorRole: 'org_admin', actorIsOwner: true, targetIsOwner: false, nextRole: 'org_admin' })).toBe(true)
    expect(canAssignOrganizationRole({ actorRole: 'org_admin', actorIsOwner: true, targetIsOwner: true, nextRole: 'viewer' })).toBe(false)
  })

  it('reserves finite seats and treats negative capacity as unlimited', () => {
    expect(hasSeatCapacity(3, 2)).toBe(true)
    expect(hasSeatCapacity(3, 3)).toBe(false)
    expect(hasSeatCapacity(-1, 1000)).toBe(true)
  })

  it('generates non-guessable invitation tokens and persists only their hash', () => {
    const first = createOrganizationInvitationToken()
    const second = createOrganizationInvitationToken()
    expect(first.token).toHaveLength(43)
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.tokenHash).toBe(hashOrganizationInvitationToken(first.token))
    expect(first.tokenHash).not.toBe(first.token)
    expect(second.tokenHash).not.toBe(first.tokenHash)
  })

  it('creates unique URL-safe slugs and handles names without ASCII letters', () => {
    expect(makeOrganizationSlug('Kijiji & Sons Surveyors')).toMatch(/^kijiji-sons-surveyors-[a-f0-9-]{8}$/)
    expect(makeOrganizationSlug('測量')).toMatch(/^survey-firm-[a-f0-9-]{8}$/)
  })
})
