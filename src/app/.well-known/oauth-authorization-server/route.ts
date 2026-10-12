import { chatgptConfig, SUPPORTED_SCOPES } from '@/lib/chatgpt/config'
export const dynamic = 'force-dynamic'
export function GET() {
  try {
    const { origin } = chatgptConfig()
    return Response.json({ issuer: origin, authorization_response_iss_parameter_supported: true, authorization_endpoint: `${origin}/connect/chatgpt/authorize`, token_endpoint: `${origin}/api/chatgpt/token`, registration_endpoint: `${origin}/api/chatgpt/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: SUPPORTED_SCOPES })
  } catch { return Response.json({ error: 'Integration unavailable' }, { status: 503 }) }
}
