import { chatgptConfig, SUPPORTED_SCOPES } from '@/lib/chatgpt/config'
export const dynamic = 'force-dynamic'
export function GET() {
  try {
    const { origin, resource } = chatgptConfig()
    return Response.json({ resource, authorization_servers: [origin], scopes_supported: SUPPORTED_SCOPES, bearer_methods_supported: ['header'], resource_name: 'METARDU survey tools', resource_documentation: `${origin}/docs/chatgpt-integration`, resource_policy_uri: `${origin}/docs/privacy`, resource_tos_uri: `${origin}/docs/terms` })
  } catch { return Response.json({ error: 'Integration unavailable' }, { status: 503 }) }
}
