import Link from 'next/link'

export const metadata = {
  title: 'METARDU Survey Tools for ChatGPT',
  description: 'Find METARDU projects, review approved field observations, calculate control-based set-out, and run traverse and level-book computations in ChatGPT.',
}

const tools = [
  ['Find projects', 'Search projects owned by your connected METARDU account.'],
  ['Review a project', 'Read saved project details and coordinate-reference provenance.'],
  ['Read field observations', 'With separate approval, review selected recorded coordinates, readings, GNSS quality values, and observation times. Photos, free-text notes, and client identifiers are excluded.'],
  ['Set out design points', 'Calculate grid bearing, horizontal distance, coordinate differences, and clockwise turn from a backsight for design points you provide. The coordinate-reference label is not validated and grid convergence is not applied.'],
  ['Compute a traverse', 'Run METARDU’s traverse reduction and Bowditch adjustment on readings you provide in ChatGPT. The accuracy class uses Kenya RDM 1.1 Table 2.4 and may not govern your job.'],
  ['Compute a level book', 'Compute reduced levels and closing misclosure from readings you provide. A tolerance comparison is made only when you also provide the job specification limit and its reference.'],
  ['Save a report draft', 'With separate permission, save plain text you provide or approve as a new unreviewed draft in a project you own. Open it in METARDU to review and export.'],
]

export default function ChatGPTIntegrationGuide() {
  return <main className="min-h-screen px-6 py-16 text-[var(--text-primary)]">
    <article className="mx-auto max-w-3xl">
      <Link href="/docs" className="inline-block text-[var(--accent)] hover:underline">Back to documentation</Link>
      <p className="mt-10 text-sm font-mono uppercase tracking-widest text-[var(--accent)]">METARDU / ChatGPT connection</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Survey work, with METARDU in ChatGPT</h1>
      <p className="mt-6 text-lg leading-relaxed text-[var(--text-secondary)]">The private preview connects ChatGPT to your METARDU account so you can find projects, inspect recorded field observations you separately approve, calculate grid set-out from control, and use METARDU’s traverse and level-book calculation engines.</p>

      <section className="mt-12 border-t border-[var(--border-color)] pt-8">
        <h2 className="text-2xl font-semibold">Available tools</h2>
        <ul className="mt-5 space-y-4">{tools.map(([title, description]) => <li key={title} className="rounded-xl border border-[var(--border-color)] p-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 leading-relaxed text-[var(--text-secondary)]">{description}</p></li>)}</ul>
      </section>

      <section className="mt-10 border-t border-[var(--border-color)] pt-8">
        <h2 className="text-2xl font-semibold">You approve the data access</h2>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">METARDU separates project summaries, field observations, and survey calculations into OAuth permissions. Before you connect, the consent screen lists what ChatGPT is requesting. Observation tools only read projects owned by your account and do not return field photos, arbitrary notes, or client identifiers. Calculation inputs and results are not saved to a METARDU project.</p>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">Information returned to ChatGPT is sent to OpenAI when you use a tool. Revoking access stops future requests but cannot remove content already returned to ChatGPT. Your connection expires after 30 days and can be revoked at any time.</p>
        <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/connect/chatgpt" className="text-[var(--accent)] underline">Connection status and revocation</Link>
          <Link href="/docs/privacy" className="text-[var(--accent)] underline">METARDU privacy policy</Link>
          <Link href="/support" className="text-[var(--accent)] underline">METARDU support</Link>
          <a href="https://openai.com/policies/row-privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">OpenAI privacy policy</a>
          <a href="https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">ChatGPT data controls</a>
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--border-color)] pt-8">
        <h2 className="text-2xl font-semibold">Important limits</h2>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">With separate approval, ChatGPT can save plain text you provide or approve as a new report draft. It cannot edit project settings or observations, change an existing report, finalize, sign, approve, or submit survey documents. Set-out and traverse inputs require metre coordinates in a shared projected or local grid; their coordinate-reference labels are not validated and grid convergence is not applied. The traverse accuracy label uses the Kenyan RDM 1.1 Table 2.4 coefficients; it is not a universal or project-specific acceptance decision. Level-book tolerance checks use only a limit and reference you provide. Check the source observations, coordinate reference system, control, units, and applicable project rules. Neither ChatGPT nor this connector certifies survey work or guarantees authority acceptance.</p>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">This is a private preview. The deployed HTTPS connection and public directory listing must be reviewed and published separately before it is described as publicly available.</p>
      </section>
    </article>
  </main>
}
