import {CHATGPT_NOTICE_CONTENT,CHATGPT_NOTICE_DIGEST,CHATGPT_NOTICE_PERIOD_MS,chatgptNoticeStatus} from './notice'
const publishedAt='2026-10-11T16:00:00.000Z',published=Date.parse(publishedAt)
const record={version:CHATGPT_NOTICE_CONTENT.version,contentSha256:CHATGPT_NOTICE_DIGEST,publishedAt,publicationScope:'in-platform'}
test('unknown publication cannot authorize linking',()=>{expect(chatgptNoticeStatus(null,published).eligible).toBe(false)})
test('starts a full 30-day period from the recorded instant',()=>{const state=chatgptNoticeStatus(record,published);expect(state.state).toBe('waiting');expect(state.remainingDays).toBe(30);expect(state.eligibleAt).toBe('2026-11-10T16:00:00.000Z')})
test('one millisecond before eligibility remains blocked',()=>{expect(chatgptNoticeStatus(record,published+CHATGPT_NOTICE_PERIOD_MS-1).eligible).toBe(false)})
test('becomes eligible at exactly 30 days without granting any connection',()=>{expect(chatgptNoticeStatus(record,published+CHATGPT_NOTICE_PERIOD_MS)).toMatchObject({state:'eligible',eligible:true,remainingDays:0})})
test.each(['2026-02-30T00:00:00.000Z','2026-10-11','not-a-date'])('refuses malformed or ambiguous publication dates %s',date=>{expect(chatgptNoticeStatus({...record,publishedAt:date},published).state).toBe('unpublished')})
test('refuses a future publication time',()=>{expect(chatgptNoticeStatus(record,published-1).state).toBe('unpublished')})
test('changed copy or version requires a new publication record',()=>{expect(chatgptNoticeStatus({...record,contentSha256:'a'.repeat(64)},published).eligible).toBe(false);expect(chatgptNoticeStatus({...record,version:'old-version'},published).publishedAt).toBeNull()})
test('a non-publication record or invalid clock cannot enable linking',()=>{expect(chatgptNoticeStatus({...record,publicationScope:'test'},published).eligible).toBe(false);expect(chatgptNoticeStatus(record,Infinity).eligible).toBe(false)})
