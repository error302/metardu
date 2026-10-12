import { validateAuthorization, chatgptConfig } from '@/lib/chatgpt/config'
import { createHash } from 'node:crypto'
import { installChatGPTNoticeFixture } from '../fixtures/chatgptNotice'
import * as notice from '@/lib/chatgpt/notice'
const original = { ...process.env }
beforeEach(() => {installChatGPTNoticeFixture();Object.assign(process.env, { METARDU_MCP_ENABLED: 'true', METARDU_MCP_ORIGIN: 'https://metardu.example' })})
afterAll(() => { process.env = original })
const valid = () => new URLSearchParams({ client_id: 'x'.repeat(43), redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect', response_type: 'code', scope: 'projects:read', resource: 'https://metardu.example', code_challenge: createHash('sha256').update('x'.repeat(43)).digest('base64url'), code_challenge_method: 'S256', state: 'state' })
test('accepts a ChatGPT client callback with resource binding and S256', () => { expect(validateAuthorization(valid()).resource).toBe('https://metardu.example') })
test.each([
  ['redirect_uri', 'https://chatgpt.com.attacker.example/connector_platform_oauth_redirect'],
  ['redirect_uri', 'https://chatgpt.com/connector_platform_oauth_redirect/extra'],
  ['client_id', 'unknown'], ['scope', 'projects:write'], ['resource', 'https://other.example'],
  ['response_type', 'token'], ['code_challenge_method', 'plain'], ['code_challenge', 'short'], ['state', ''],
])('rejects invalid %s', (key, value) => { const params = valid(); params.set(key, value); expect(() => validateAuthorization(params)).toThrow() })
test('rejects duplicate OAuth parameters', () => { const params = valid(); params.append('redirect_uri', 'https://evil.example'); expect(() => validateAuthorization(params)).toThrow() })
test('fails closed when disabled', () => { process.env.METARDU_MCP_ENABLED = 'false'; expect(() => chatgptConfig()).toThrow() })
test('rejects an origin with a path', () => { process.env.METARDU_MCP_ORIGIN = 'https://metardu.example/path'; expect(() => chatgptConfig()).toThrow() })
test('the enabled flag cannot bypass missing publication evidence',()=>{jest.spyOn(notice,'readChatGPTNoticeRecord').mockReturnValue(null);expect(()=>chatgptConfig()).toThrow(/notice period/)})
test('the enabled flag cannot bypass an unelapsed notice period',()=>{jest.spyOn(notice,'readChatGPTNoticeRecord').mockReturnValue({version:notice.CHATGPT_NOTICE_CONTENT.version,contentSha256:notice.CHATGPT_NOTICE_DIGEST,publishedAt:new Date().toISOString(),publicationScope:'in-platform'});expect(()=>chatgptConfig()).toThrow(/notice period/)})
