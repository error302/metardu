import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth/session'
import { normalizeScopes, PROJECT_SCOPE, SURVEY_COMPUTE_SCOPE, SURVEY_DATA_SCOPE, SURVEY_DOCUMENTS_SCOPE, validateAuthorization } from '@/lib/chatgpt/config'
import { ConsentDecisionForm } from '@/components/chatgpt/ConsentDecisionForm'
export const dynamic = 'force-dynamic'

export default async function Authorize({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item))
    else if (value !== undefined) params.set(key, value)
  }
  let scopes: ReturnType<typeof normalizeScopes>
  try { validateAuthorization(params); scopes = normalizeScopes(params.get('scope') ?? '') } catch {
    return <section className="mx-auto max-w-xl px-6 py-24"><h1 className="text-3xl font-semibold">Connection unavailable</h1><p className="mt-4">This connection request is invalid or the integration is not enabled. Start a new connection from ChatGPT.</p><Link className="mt-6 inline-block underline" href="/connect/chatgpt">About the connection</Link></section>
  }
  const user = await getAuthUser()
  if (!user?.id) redirect(`/login?next=${encodeURIComponent(`/connect/chatgpt/authorize?${params}`)}`)
  const serialized = params.toString()
  return <section className="mx-auto max-w-xl px-6 py-20">
    <p className="text-sm font-mono uppercase tracking-widest text-[var(--accent)]">METARDU / Account connection</p>
    <h1 className="mt-5 text-4xl font-semibold tracking-tight">Connect METARDU to ChatGPT</h1>
    <p className="mt-5">Signed in as <strong>{user.email}</strong>.</p>
    <p className="mt-5 leading-relaxed">Choose whether to allow ChatGPT to use the requested METARDU survey tools. Data returned by a tool is sent to OpenAI when you call it.</p>
    <ul className="mt-5 list-disc space-y-2 pl-6 leading-relaxed">
      {scopes.includes(PROJECT_SCOPE) && <li><strong>Project summaries:</strong> names, survey types, saved location text, project links, and recorded coordinate-reference details for projects you own.</li>}
      {scopes.includes(SURVEY_DATA_SCOPE) && <li><strong>Field observations:</strong> recorded point names, coordinates and their recorded horizontal and vertical references, GNSS quality values, capture and accuracy sources, instrument readings, numeric environmental values where recorded, and observation times. Photos, free-text notes, and client identifiers are excluded.</li>}
      {scopes.includes(SURVEY_COMPUTE_SCOPE) && <li><strong>Survey calculations:</strong> process traverse and level-book readings or projected-grid set-out coordinates you provide in ChatGPT with METARDU’s calculation engines. These inputs and results are not saved to your METARDU projects. Any coordinate-reference label is returned as supplied and is not validated.</li>}
      {scopes.includes(SURVEY_DOCUMENTS_SCOPE) && <li><strong>Save report drafts:</strong> create a new, clearly labelled draft report in a project you own from plain text you provide or approve. The draft is not checked, signed, approved, finalized, or submitted; review and export it in METARDU.</li>}
    </ul>
    <p className="mt-4 leading-relaxed">METARDU does not edit project settings or observations, sign, approve, finalize, or submit survey documents through this connection. The traverse accuracy class uses a Kenya-specific standard; level-book tolerance checks use only a limit and reference you provide; grid set-out does not apply grid convergence. Calculations are aids, not approvals. A surveyor must verify readings, coordinate reference, control, and job requirements. The connection expires after 30 days. You can revoke it at any time from the connection page.</p>
    <ConsentDecisionForm serializedRequest={serialized} />
    <p className="mt-8 text-sm"><Link className="underline" href="/docs/privacy">Privacy policy</Link> · <a className="underline" href="https://openai.com/policies/row-privacy-policy/" target="_blank" rel="noreferrer">OpenAI privacy policy</a> · <a className="underline" href="https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt" target="_blank" rel="noreferrer">ChatGPT data controls</a></p>
  </section>
}
