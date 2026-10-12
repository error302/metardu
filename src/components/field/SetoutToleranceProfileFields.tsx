'use client'

import type { SetoutToleranceProfileDraft } from '@/lib/engineering/setoutToleranceProfile'

interface SetoutToleranceProfileFieldsProps {
  value: SetoutToleranceProfileDraft
  onChange: (next: SetoutToleranceProfileDraft) => void
  disabled?: boolean
}

const controlClass = 'w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-white'

export function SetoutToleranceProfileFields({ value, onChange, disabled = false }: SetoutToleranceProfileFieldsProps) {
  const update = (field: keyof SetoutToleranceProfileDraft, next: string | boolean) => {
    onChange({ ...value, [field]: next })
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/60 p-4" aria-labelledby="setout-tolerance-heading">
      <div>
        <h4 id="setout-tolerance-heading" className="text-sm font-semibold text-white">Project-approved set-out tolerances</h4>
        <p className="mt-1 text-xs text-zinc-400">
          Enter the issued project criteria; METARDU supplies no construction tolerance and does not independently verify approval. The criteria, source, version, and transcriber are retained with each shot.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field id="setout-profile-name" label="Profile name">
          <input id="setout-profile-name" className={controlClass} value={value.name} onChange={(event) => update('name', event.target.value)} disabled={disabled} placeholder="e.g. Main drainage works" />
        </Field>
        <Field id="setout-profile-jurisdiction" label="Client / contract / jurisdiction">
          <input id="setout-profile-jurisdiction" className={controlClass} value={value.jurisdiction} onChange={(event) => update('jurisdiction', event.target.value)} disabled={disabled} placeholder="Project or contract" />
        </Field>
        <Field id="setout-profile-version" label="Issued version">
          <input id="setout-profile-version" className={controlClass} value={value.version} onChange={(event) => update('version', event.target.value)} disabled={disabled} placeholder="Revision" />
        </Field>
        <Field id="setout-profile-effective-date" label="Effective date">
          <input id="setout-profile-effective-date" type="date" className={controlClass} value={value.effectiveDate} onChange={(event) => update('effectiveDate', event.target.value)} disabled={disabled} />
        </Field>
        <Field id="setout-profile-horizontal-mm" label="Horizontal tolerance (mm)">
          <input id="setout-profile-horizontal-mm" type="number" min="0" step="any" className={controlClass} value={value.horizontalMm} onChange={(event) => update('horizontalMm', event.target.value)} disabled={disabled} placeholder="Required" />
        </Field>
        <Field id="setout-profile-vertical-mm" label="Vertical tolerance (mm)">
          <input id="setout-profile-vertical-mm" type="number" min="0" step="any" className={controlClass} value={value.verticalMm} onChange={(event) => update('verticalMm', event.target.value)} disabled={disabled} placeholder="Required" />
        </Field>
        <Field id="setout-profile-source" label="Source reference">
          <input id="setout-profile-source" className={controlClass} value={value.source} onChange={(event) => update('source', event.target.value)} disabled={disabled} placeholder="Drawing / specification clause" />
        </Field>
        <Field id="setout-profile-approved-by" label="Approved by (as documented)">
          <input id="setout-profile-approved-by" className={controlClass} value={value.approvedBy} onChange={(event) => update('approvedBy', event.target.value)} disabled={disabled} placeholder="Name and role" />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-xs text-amber-200">
        <input
          type="checkbox"
          checked={value.acknowledged}
          onChange={(event) => update('acknowledged', event.target.checked)}
          disabled={disabled}
          className="mt-0.5 accent-amber-400"
          aria-label="Confirm tolerance source"
        />
        <span>I transcribed these values from the approved project requirement. METARDU records this confirmation; it is not an approval or certification.</span>
      </label>
    </section>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
