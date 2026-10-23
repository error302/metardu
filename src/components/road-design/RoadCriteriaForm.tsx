'use client'

export type RoadField = { key: string; label: string; text?: boolean }
export function CriterionFields({ fields, values, onChange, prefix }: {
  fields: RoadField[]; values: Record<string, string>; onChange: (key: string, value: string) => void; prefix: string
}) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {fields.map(field => <div key={field.key} className="min-w-0">
      <label htmlFor={`${prefix}-${field.key}`} className="block text-xs text-[var(--text-muted)] mb-1">{field.label}</label>
      <input id={`${prefix}-${field.key}`} type={field.text ? 'text' : 'number'} step={field.text ? undefined : 'any'} maxLength={field.text ? 512 : undefined}
        value={values[field.key]} onChange={event => onChange(field.key, event.target.value)}
        className="w-full min-w-0 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[var(--text-primary)] text-sm" />
    </div>)}
  </div>
}
export function roadNumber(value: string, label: string): number {
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`${label} requires a finite number.`)
  return Number(text)
}
export function optionalRoadNumber(value: string, label: string): number | undefined {
  return value.trim() === '' ? undefined : roadNumber(value, label)
}
export function CriterionResult({ rows }: { rows: [string, string][] }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{rows.map(([label, value]) => <div key={label} className="min-w-0 border border-[var(--border-color)] bg-[var(--bg-tertiary)] rounded p-3">
    <dt className="text-xs text-[var(--text-muted)] mb-1">{label}</dt><dd className="break-words font-mono text-[var(--text-primary)]">{value}</dd>
  </div>)}</dl>
}
export function CriterionSteps({ steps }: { steps: { description: string; formula: string; value: string }[] }) {
  return <details className="text-xs break-words"><summary className="cursor-pointer text-[var(--text-muted)]">Show Computation Steps</summary>
    <ol className="mt-3 space-y-3 font-mono">{steps.map(step => <li key={step.description}>{step.description}: {step.value}<br /><span className="text-[var(--text-muted)]">{step.formula}</span></li>)}</ol>
  </details>
}
