import {CHATGPT_NOTICE_CONTENT,chatgptNoticeStatus} from '@/lib/chatgpt/notice'
import {chatgptConfig} from '@/lib/chatgpt/config'
export const dynamic='force-dynamic'
export const runtime='nodejs'
export function GET(){
  let linkingConfigured=false
  try{chatgptConfig();linkingConfigured=true}catch{/* New linking remains unavailable. */}
  return Response.json({...chatgptNoticeStatus(),title:CHATGPT_NOTICE_CONTENT.title,noticeUrl:'/docs/chatgpt-notice',linkingConfigured},{headers:{'Cache-Control':'no-store'}})
}
