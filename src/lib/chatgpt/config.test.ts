import { hasScopes, normalizeScopes, PROJECT_SCOPE, SURVEY_COMPUTE_SCOPE, SURVEY_DATA_SCOPE, SURVEY_DOCUMENTS_SCOPE, validateAuthorization } from './config'
import { createHash } from 'node:crypto'
import { installChatGPTNoticeFixture } from '../../../tests/fixtures/chatgptNotice'

const ORIGIN = 'https://metardu.space'
const CLIENT_ID = 'C'.repeat(43)
const VERIFIER = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

beforeEach(() => {
  installChatGPTNoticeFixture()
  process.env.METARDU_MCP_ENABLED = 'true'
  process.env.METARDU_MCP_ORIGIN = ORIGIN
})

afterAll(() => {
  delete process.env.METARDU_MCP_ENABLED
  delete process.env.METARDU_MCP_ORIGIN
})

function authorizationParams(scope: string) {
  return new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
    response_type: 'code', scope, resource: ORIGIN,
    code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 'state-123',
  })
}

describe('ChatGPT survey tool permissions', () => {
  it('normalizes scopes into stable order and grants only requested permissions', () => {
    expect(normalizeScopes(`${SURVEY_DOCUMENTS_SCOPE} ${SURVEY_COMPUTE_SCOPE} ${PROJECT_SCOPE} ${SURVEY_DATA_SCOPE}`)).toEqual([
      PROJECT_SCOPE, SURVEY_DATA_SCOPE, SURVEY_COMPUTE_SCOPE, SURVEY_DOCUMENTS_SCOPE,
    ])
    expect(normalizeScopes(PROJECT_SCOPE)).toEqual([PROJECT_SCOPE])
    expect(hasScopes([PROJECT_SCOPE], [PROJECT_SCOPE])).toBe(true)
    expect(hasScopes([PROJECT_SCOPE], [SURVEY_COMPUTE_SCOPE])).toBe(false)
    expect(hasScopes([PROJECT_SCOPE], [SURVEY_DOCUMENTS_SCOPE])).toBe(false)
  })

  it('rejects unknown and repeated scopes', () => {
    expect(() => normalizeScopes('projects:read admin:all')).toThrow()
    expect(() => normalizeScopes('projects:read projects:read')).toThrow()
  })

  it('accepts a supported ChatGPT authorization scope combination', () => {
    expect(() => validateAuthorization(authorizationParams('survey-data:read projects:read survey-documents:write'))).not.toThrow()
  })

  it('rejects unsupported authorization permissions before consent', () => {
    expect(() => validateAuthorization(authorizationParams('projects:write'))).toThrow()
  })
})
