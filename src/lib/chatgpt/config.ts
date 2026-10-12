import { chatgptNoticeStatus, readChatGPTNoticeRecord } from './notice'
export const PROJECT_SCOPE = 'projects:read'
export const SURVEY_DATA_SCOPE = 'survey-data:read'
export const SURVEY_COMPUTE_SCOPE = 'survey:compute'
export const SURVEY_DOCUMENTS_SCOPE = 'survey-documents:write'
export const SUPPORTED_SCOPES = [PROJECT_SCOPE, SURVEY_DATA_SCOPE, SURVEY_COMPUTE_SCOPE, SURVEY_DOCUMENTS_SCOPE] as const

export type ChatGPTScope = typeof SUPPORTED_SCOPES[number]

/** Parse and normalize a space-separated OAuth scope request. */
export function normalizeScopes(value: string): ChatGPTScope[] {
  const requested = value.trim().split(/\s+/).filter(Boolean)
  if (requested.length === 0 || new Set(requested).size !== requested.length) throw new Error('Invalid OAuth scope')
  if (requested.some(scope => !SUPPORTED_SCOPES.includes(scope as ChatGPTScope))) throw new Error('Unsupported OAuth scope')
  return SUPPORTED_SCOPES.filter(scope => requested.includes(scope))
}

export function hasScopes(granted: readonly string[], required: readonly ChatGPTScope[]) {
  return required.every(scope => granted.includes(scope))
}

export function chatgptConfig() {
  const base = process.env.METARDU_MCP_ORIGIN
  if (process.env.METARDU_MCP_ENABLED !== 'true' || !base) {
    throw new Error('ChatGPT integration is not configured')
  }
  if (!chatgptNoticeStatus(readChatGPTNoticeRecord()).eligible) throw new Error('The ChatGPT data-sharing notice period has not elapsed')
  const origin = new URL(base)
  if (origin.origin !== base || (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && origin.hostname === 'localhost'))) {
    throw new Error('METARDU_MCP_ORIGIN must be an HTTPS origin')
  }
  return { origin: base, resource: base }
}

/** ChatGPT connection callback URLs documented by OpenAI. */
export function isChatGPTRedirectUri(value: string) {
  return value === 'https://chatgpt.com/connector_platform_oauth_redirect'
    || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,200}$/.test(value)
}

export function validateAuthorization(params: URLSearchParams) {
  const config = chatgptConfig()
  for (const key of ['client_id', 'redirect_uri', 'response_type', 'scope', 'resource', 'code_challenge', 'code_challenge_method', 'state']) {
    if (params.getAll(key).length !== 1) throw new Error(`Invalid ${key}`)
  }
  const clientId = params.get('client_id')
  const redirectUri = params.get('redirect_uri')
  const scope = params.get('scope')
  const responseType = params.get('response_type')
  const resource = params.get('resource')
  const challengeMethod = params.get('code_challenge_method')
  const challenge = params.get('code_challenge')
  const state = params.get('state')
  if (!clientId || !/^[A-Za-z0-9_-]{43}$/.test(clientId)) throw new Error('Unregistered OAuth client')
  if (!redirectUri || !isChatGPTRedirectUri(redirectUri)) throw new Error('Unregistered OAuth callback')
  if (!scope) throw new Error('Invalid scope')
  normalizeScopes(scope)
  if (responseType !== 'code' || resource !== config.resource) throw new Error('Unsupported OAuth request')
  if (challengeMethod !== 'S256' || !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) throw new Error('S256 PKCE is required')
  if (!state || state.length > 1024) throw new Error('Invalid OAuth state')
  return config
}
