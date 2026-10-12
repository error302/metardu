import { createHash, randomBytes, randomUUID } from 'node:crypto'

export const ORGANIZATION_ROLES = ['org_admin', 'project_manager', 'surveyor', 'viewer'] as const
export const INVITABLE_ORGANIZATION_ROLES = ['project_manager', 'surveyor', 'viewer'] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]
export type InvitableOrganizationRole = (typeof INVITABLE_ORGANIZATION_ROLES)[number]

export function canManageOrganizationMembers(role: string | null | undefined): boolean {
  return role === 'org_admin'
}

export function canAssignOrganizationRole(input: {
  actorRole: string | null | undefined
  actorIsOwner: boolean
  targetIsOwner: boolean
  nextRole: OrganizationRole
}): boolean {
  if (!canManageOrganizationMembers(input.actorRole) || input.targetIsOwner) return false
  return input.nextRole !== 'org_admin' || input.actorIsOwner
}

export function hasSeatCapacity(maxSeats: number, occupiedSeats: number): boolean {
  return maxSeats < 0 || occupiedSeats < maxSeats
}

export function makeOrganizationSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'survey-firm'
  return `${base}-${randomUUID().slice(0, 8)}`
}

export function createOrganizationInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashOrganizationInvitationToken(token) }
}

export function hashOrganizationInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
