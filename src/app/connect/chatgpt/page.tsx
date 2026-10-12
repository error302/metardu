import Link from 'next/link'
import { getAuthUser } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { chatgptConfig } from '@/lib/chatgpt/config'
import { GrantRevokeButton } from '@/components/chatgpt/GrantRevokeButton'
import { chatgptNoticeStatus } from '@/lib/chatgpt/notice'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'ChatGPT connection | METARDU', description: 'Manage your private METARDU survey tools connection for ChatGPT.' }

export default async function ChatGPTConnection() {
  const user = await getAuthUser()
  const notice = chatgptNoticeStatus()
  let configured = false
  try { chatgptConfig(); configured = true } catch { /* Deployment has not enabled OAuth. */ }
  let grants: { id: string; scope: string; created_at: Date; expires_at: Date }[] = []
  let storageAvailable = true
  if (user?.id) {
    try {
      grants = (await db.query<{ id: string; scope: string; created_at: Date; expires_at: Date }>('SELECT id, scope, created_at, expires_at FROM chatgpt_grants WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 50', [user.id])).rows
    } catch { storageAvailable = false }
  }
  return <section className="mx-auto max-w-3xl px-6 py-20">
    <p className="text-sm font-mono uppercase tracking-widest text-[var(--accent)]">METARDU × ChatGPT</p>
    <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Your projects.<br />A new way to explore them.</h1>
    <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)]">Find your survey projects and review their recorded details through a conversation. METARDU controls access; you choose whether to connect.</p>
    <div className="my-10 border-y border-[var(--border-color)] py-6">
      <h2 className="text-xl font-semibold">Private preview</h2>
      <p className="mt-3">The private preview can find your projects, read selected field observations after you approve that permission, compute traverses and level books, calculate grid set-out from control coordinates you provide, and save user-approved report text as an unreviewed draft under a separate permission. Calculations are not saved. It cannot edit project settings or observations, sign, approve, finalize, or submit survey documents.</p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{configured ? 'Start account linking from your configured METARDU connection in ChatGPT. METARDU shows each requested permission before access is granted.' : 'Account linking is not enabled on this deployment.'} Public directory review and publication are separate steps and are not yet confirmed.</p>
      <Link href="/docs/chatgpt-integration" className="mt-4 inline-block text-sm text-[var(--accent)] underline">Read how the connection works</Link>
      <p className="mt-4 text-sm" role="status">{notice.publishedAt?(notice.eligible?'The data-sharing notice period has elapsed.':`Customer linking becomes eligible after ${notice.eligibleAt?.replace('T',' ')}.`):'The data-sharing notice is prepared; its publication timestamp has not been recorded.'} <Link href="/docs/chatgpt-notice" className="text-[var(--accent)] underline">Read the notice and publication record</Link>.</p>
    </div>
    <h2 className="text-2xl font-semibold">Connected accounts</h2>
    {!user ? <Link className="mt-4 inline-block underline" href="/login?next=/connect/chatgpt">Sign in to manage connections</Link> : <>
      <p className="mt-3 text-sm">Signed in as {user.email}</p>
      {!storageAvailable && <p role="alert" className="mt-4">Connections could not be loaded. Please try again later.</p>}
      {storageAvailable && !grants.length && <p className="mt-4 text-[var(--text-secondary)]">No active connections.</p>}
      {grants.map(grant => <div key={grant.id} className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-color)] py-4">
        <div><strong>ChatGPT · METARDU survey tools</strong><p className="mt-1 text-sm">Permissions: {grant.scope.split(' ').map(scope => ({ 'projects:read': 'project summaries', 'survey-data:read': 'field observations', 'survey:compute': 'survey calculations', 'survey-documents:write': 'save report drafts' }[scope] || scope)).join(', ')}</p><p className="mt-1 text-sm">Connected {new Date(grant.created_at).toISOString().slice(0, 10)} · expires {new Date(grant.expires_at).toISOString().slice(0, 10)}</p></div>
        <GrantRevokeButton grantId={grant.id} />
      </div>)}
    </>}
    <p className="mt-10 text-sm text-[var(--text-secondary)]">Revoking access stops future requests. It does not remove information already returned to ChatGPT, which remains subject to your <a className="underline" href="https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt" target="_blank" rel="noreferrer">ChatGPT data controls</a> and the <a className="underline" href="https://openai.com/policies/row-privacy-policy/" target="_blank" rel="noreferrer">OpenAI privacy policy</a>.</p>
    <Link href="/" className="mt-8 inline-block underline">Back to METARDU</Link>
  </section>
}
