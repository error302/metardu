import Link from 'next/link'
import {CHATGPT_NOTICE_CONTENT,chatgptNoticeStatus} from '@/lib/chatgpt/notice'
export const dynamic='force-dynamic'
export const metadata={title:'ChatGPT data-sharing notice | METARDU',description:'Optional ChatGPT connection, permissions, publication and notice period.'}
export default function ChatGPTNoticePage(){
  const status=chatgptNoticeStatus()
  return <section className="mx-auto max-w-3xl px-6 py-16" data-chatgpt-notice-version={status.version}>
    <Link href="/docs/privacy" className="inline-flex min-h-11 items-center text-[var(--accent)] underline">Privacy policy</Link>
    <p className="mt-6 text-sm uppercase tracking-widest text-[var(--text-muted)]">Data-sharing notice</p>
    <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">{CHATGPT_NOTICE_CONTENT.title}</h1>
    <div className="my-8 border-y border-[var(--border-color)] py-5" role="status">
      {status.publishedAt?<><p>Published in the platform: <time dateTime={status.publishedAt}>{status.publishedAt}</time></p><p className="mt-2">Notice period ends: <time dateTime={status.eligibleAt??undefined}>{status.eligibleAt}</time>.</p><p className="mt-2">{status.eligible?'The notice period has elapsed. Connecting still requires an enabled deployment, your sign-in and separate consent.':`${status.remainingDays} days remain in the notice period. Customer linking is unavailable during this period.`}</p></>:<p>The publication timestamp has not been recorded. Customer linking remains unavailable.</p>}
    </div>
    <div className="space-y-5 leading-7">{CHATGPT_NOTICE_CONTENT.paragraphs.map(text=><p key={text}>{text}</p>)}</div>
    <p className="mt-8 text-sm leading-6">Review <a className="text-[var(--accent)] underline" href="https://openai.com/policies/row-privacy-policy/" target="_blank" rel="noreferrer">OpenAI's privacy policy</a> and <a className="text-[var(--accent)] underline" href="https://help.openai.com/en/articles/7730893-data-controls-faq" target="_blank" rel="noreferrer">ChatGPT data controls</a> before sharing information.</p>
    <Link href="/connect/chatgpt" className="mt-8 inline-flex min-h-11 items-center text-[var(--accent)] underline">Manage the ChatGPT connection</Link>
  </section>
}
