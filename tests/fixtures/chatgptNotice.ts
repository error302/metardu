import * as notice from '@/lib/chatgpt/notice'
/** Unit-test metadata only. Never creates a production/source publication record. */
export function installChatGPTNoticeFixture(){return jest.spyOn(notice,'readChatGPTNoticeRecord').mockReturnValue({version:notice.CHATGPT_NOTICE_CONTENT.version,contentSha256:notice.CHATGPT_NOTICE_DIGEST,publishedAt:'2000-01-01T00:00:00.000Z',publicationScope:'in-platform'})}
