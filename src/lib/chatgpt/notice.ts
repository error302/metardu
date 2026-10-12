import {createHash} from 'node:crypto'
import {lstatSync,readFileSync} from 'node:fs'
import path from 'node:path'
import content from './noticeContent.json'

export const CHATGPT_NOTICE_CONTENT=content
export const CHATGPT_NOTICE_PERIOD_MS=30*24*60*60*1000
export const CHATGPT_NOTICE_DIGEST=createHash('sha256').update(`${content.version}\n${content.title}\n${content.paragraphs.join('\n\n')}`).digest('hex')
export const CHATGPT_NOTICE_RELATIVE_FILE=path.join('.metardu-system','notices',`${content.version}.json`)
export type ChatGPTNoticeRecord={version:string;contentSha256:string;publishedAt:string;publicationScope:'in-platform'}
export type ChatGPTNoticeStatus={state:'unpublished'|'waiting'|'eligible';version:string;contentSha256:string;publishedAt:string|null;eligibleAt:string|null;remainingDays:number|null;eligible:boolean}

/** Read only owned publication metadata; a request never creates or changes a record. */
export function readChatGPTNoticeRecord(): unknown {
  try {
    const root=process.env.STORAGE_ROOT||path.join(process.cwd(),'upload')
    const file=path.join(root,CHATGPT_NOTICE_RELATIVE_FILE)
    for(const directory of [path.dirname(path.dirname(file)),path.dirname(file)]){
      const stat=lstatSync(directory)
      if(stat.isSymbolicLink()||!stat.isDirectory())return null
    }
    const stat=lstatSync(file)
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096)return null
    const bytes=readFileSync(file)
    if(bytes.length>4096)return null
    return JSON.parse(bytes.toString('utf8')) as unknown
  } catch {return null}
}

export function chatgptNoticeStatus(record:unknown=readChatGPTNoticeRecord(),now=Date.now()):ChatGPTNoticeStatus {
  const unpublished:ChatGPTNoticeStatus={state:'unpublished',version:content.version,contentSha256:CHATGPT_NOTICE_DIGEST,publishedAt:null,eligibleAt:null,remainingDays:null,eligible:false}
  if(!Number.isFinite(now)||!record||typeof record!=='object'||Array.isArray(record))return unpublished
  const value=record as Partial<ChatGPTNoticeRecord>
  if(value.version!==content.version||value.contentSha256!==CHATGPT_NOTICE_DIGEST||value.publicationScope!=='in-platform'||typeof value.publishedAt!=='string')return unpublished
  const published=Date.parse(value.publishedAt)
  if(!Number.isFinite(published)||new Date(published).toISOString()!==value.publishedAt||published>now)return unpublished
  const eligibleAt=published+CHATGPT_NOTICE_PERIOD_MS
  if(!Number.isFinite(eligibleAt))return unpublished
  const eligible=now>=eligibleAt
  return {...unpublished,state:eligible?'eligible':'waiting',publishedAt:value.publishedAt,eligibleAt:new Date(eligibleAt).toISOString(),remainingDays:Math.max(0,Math.ceil((eligibleAt-now)/(24*60*60*1000))),eligible}
}
