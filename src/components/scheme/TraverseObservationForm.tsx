'use client'
import { useEffect, useRef, useState } from 'react'
import type {
  TraverseCommand,
  TraverseContext,
} from '@/lib/scheme/traverseContract'
import { TRAVERSE_OBSERVATION_LIMIT } from '@/lib/scheme/traverseContract'

export const traverseAction =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40'
export type TraverseEntry = Pick<
  TraverseCommand,
  | 'name'
  | 'control'
  | 'observations'
  | 'reduction'
  | 'criterion'
  | 'source'
  | 'provenance'
  | 'derivedFromRevisionId'
>
const emptyObservation = (): TraverseCommand['observations'][number] => ({
  station: '',
  bs: '',
  fs: '',
  hclDeg: '',
  hclMin: '',
  hclSec: '',
  hcrDeg: '',
  hcrMin: '',
  hcrSec: '',
  slopeDist: '',
  vaDeg: '',
  vaMin: '',
  vaSec: '',
  ih: '',
  th: '',
  remarks: '',
})
export const emptyTraverseEntry = (): TraverseEntry => ({
  name: '',
  control: {
    openingStation: '',
    openingEasting: '',
    openingNorthing: '',
    openingRL: '',
    closing: null,
    backsightDegrees: '',
    backsightMinutes: '',
    backsightSeconds: '',
  },
  observations: [emptyObservation()],
  reduction: { combinedScaleFactor: '', reference: '' },
  criterion: null,
  source: { kind: 'manual', note: '' },
  provenance: { observer: null, instrument: null, observedAt: null },
  derivedFromRevisionId: null,
})
function Input({
  label,
  value,
  change,
  numeric = false,
  max = 64,
}: {
  label: string
  value: string
  change: (value: string) => void
  numeric?: boolean
  max?: number
}) {
  return (
    <label className="min-w-0 space-y-1 text-xs">
      <span>{label}</span>
      <input
        className="block w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 font-mono text-sm tabular-nums focus-visible:outline focus-visible:outline-2"
        value={value}
        inputMode={numeric ? 'decimal' : undefined}
        maxLength={max}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  )
}
export default function TraverseObservationForm({
  entry,
  change,
  context,
  disabled,
  reviewed,
  setReviewed,
  onSave,
  onFileError,
}: {
  entry: TraverseEntry
  change: (value: TraverseEntry) => void
  context: TraverseContext | null
  disabled: boolean
  reviewed: boolean
  setReviewed: (value: boolean) => void
  onSave: () => void
  onFileError: (message: string) => void
}) {
  const [page, setPage] = useState(0),
    [fileBusy, setFileBusy] = useState(false)
  const alive = useRef(true),
    fileRead = useRef(0)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const action = traverseAction,
    c = entry.control
  const closing = c.closing,
    criterion = entry.criterion
  function update(patch: Partial<TraverseEntry>) {
    change({ ...entry, ...patch })
    setReviewed(false)
  }
  const controlField = (
    label: string,
    key: Exclude<keyof TraverseCommand['control'], 'closing'>,
    numeric = true,
  ) => (
    <Input
      label={label}
      value={c[key]}
      change={(value) => update({ control: { ...c, [key]: value } })}
      numeric={numeric}
      max={numeric ? 64 : 50}
    />
  )
  async function attach(file: File | undefined) {
    if (!file) return
    const generation = ++fileRead.current
    setFileBusy(true)
    setReviewed(false)
    try {
      if (!file.size || file.size > 2097152)
        throw Error('Choose an original file between 1 byte and 2 MiB.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!alive.current || generation !== fileRead.current) return
      let binary = ''
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      // The schema admits only reviewed mappings. This checkbox is deliberately
      // required again after attachment; never imply a file was parsed.
      change({
        ...entry,
        source: {
          kind: 'attachment',
          filename: file.name,
          bytesBase64: btoa(binary),
          mappingReviewed: true,
        },
      })
      setMappingReviewed(false)
    } catch (failure) {
      if (alive.current && generation === fileRead.current)
        onFileError(
          failure instanceof Error
            ? failure.message
            : 'The original file could not be read.',
        )
    } finally {
      if (alive.current && generation === fileRead.current) setFileBusy(false)
    }
  }
  const [mappingReviewed, setMappingReviewed] = useState(false)
  return (
    <form
      className="min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (entry.source.kind === 'attachment' && !mappingReviewed) {
          onFileError(
            'Check the entered observations against the original file before retaining.',
          )
          return
        }
        onSave()
      }}
    >
      <fieldset
        disabled={disabled || fileBusy || !context}
        className="min-w-0 space-y-5"
      >
        <legend className="mb-3 font-medium">
          {entry.derivedFromRevisionId
            ? 'New revision from original inputs'
            : 'New observation set'}
        </legend>
        <Input
          label="Revision name"
          value={entry.name}
          change={(name) => update({ name })}
          max={200}
        />
        <section className="space-y-3">
          <h4 className="text-sm font-medium">
            Opening control and grid backsight
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {controlField('Opening station', 'openingStation', false)}
            {controlField('Opening easting (m)', 'openingEasting')}
            {controlField('Opening northing (m)', 'openingNorthing')}
            {controlField('Opening level (m), if known', 'openingRL')}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {controlField('Backsight degrees', 'backsightDegrees')}
            {controlField('Backsight minutes', 'backsightMinutes')}
            {controlField('Backsight seconds', 'backsightSeconds')}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Metres and grid bearings clockwise from north. Leave unknown levels
            and instrument or target heights blank. Enter zero only when
            observed or explicitly known.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={c.closing !== null}
              onChange={(e) =>
                update({
                  control: {
                    ...c,
                    closing: e.target.checked
                      ? { station: '', easting: '', northing: '' }
                      : null,
                  },
                })
              }
            />
            Independent closing control available
          </label>
          {closing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['station', 'easting', 'northing'] as const).map((key) => (
                <Input
                  key={key}
                  label={`Closing ${key}${key === 'station' ? '' : ' (m)'}`}
                  value={closing[key]}
                  change={(value) =>
                    update({
                      control: {
                        ...c,
                        closing: { ...closing, [key]: value },
                      },
                    })
                  }
                  numeric={key !== 'station'}
                  max={key === 'station' ? 50 : 64}
                />
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <h4 className="text-sm font-medium">
            Reduction and optional acceptance criterion
          </h4>
          <Input
            label="Distance reduction reference"
            value={entry.reduction.reference}
            change={(reference) =>
              update({ reduction: { ...entry.reduction, reference } })
            }
            max={200}
          />
          <p className="text-xs text-[var(--text-secondary)]">
            Slope distances reduce through the zenith angle, then use the
            adopted project ground-to-grid factor. Face entries must be paired
            clockwise backsight-to-foresight angles. Raw circle readings need
            prior reviewed reduction.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={entry.criterion !== null}
              onChange={(e) =>
                update({
                  criterion: e.target.checked
                    ? { allowableMisclosureMm: '', reference: '' }
                    : null,
                })
              }
            />
            Use a stated linear misclosure criterion
          </label>
          {criterion && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Allowable linear misclosure (mm)"
                value={criterion.allowableMisclosureMm}
                change={(value) =>
                  update({
                    criterion: {
                      ...criterion,
                      allowableMisclosureMm: value,
                    },
                  })
                }
                numeric
              />
              <Input
                label="Criterion reference"
                value={criterion.reference}
                change={(reference) =>
                  update({ criterion: { ...criterion, reference } })
                }
                max={200}
              />
            </div>
          )}
        </section>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">
              Observation path · {entry.observations.length.toLocaleString()}{' '}
              targets
            </h4>
            <button
              type="button"
              disabled={entry.observations.length >= TRAVERSE_OBSERVATION_LIMIT}
              className={action}
              onClick={() => {
                update({
                  observations: [...entry.observations, emptyObservation()],
                })
                setPage(Math.floor(entry.observations.length / 50))
              }}
            >
              Add observation
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Each target follows the previous target, starting at the opening
            station. Preserve the field order. Up to 2,000 observations per
            revision, displayed 50 at a time.
          </p>
          {entry.observations
            .slice(page * 50, page * 50 + 50)
            .map((row, offset) => {
              const index = page * 50 + offset,
                n = index + 1
              const updateRow = (key: keyof typeof row, value: string) =>
                update({
                  observations: entry.observations.map((r, i) =>
                    i === index ? { ...r, [key]: value } : r,
                  ),
                })
              return (
                <fieldset
                  key={index}
                  className="min-w-0 space-y-3 rounded-lg border border-[var(--border-color)] p-3"
                >
                  <legend className="px-1 text-sm">Observation {n}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ['Target station', 'station'],
                        ['Backsight field label', 'bs'],
                        ['Foresight field label', 'fs'],
                      ] as const
                    ).map(([label, key]) => (
                      <Input
                        key={key}
                        label={`${label} ${n}`}
                        value={row[key]}
                        change={(value) => updateRow(key, value)}
                        max={50}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ['Face left degrees', 'hclDeg'],
                        ['Face left minutes', 'hclMin'],
                        ['Face left seconds', 'hclSec'],
                        ['Face right degrees', 'hcrDeg'],
                        ['Face right minutes', 'hcrMin'],
                        ['Face right seconds', 'hcrSec'],
                        ['Zenith degrees', 'vaDeg'],
                        ['Zenith minutes', 'vaMin'],
                        ['Zenith seconds', 'vaSec'],
                        ['Slope distance', 'slopeDist'],
                        ['Instrument height', 'ih'],
                        ['Target height', 'th'],
                      ] as const
                    ).map(([label, key]) => (
                      <Input
                        key={key}
                        label={`${label} ${n}`}
                        value={row[key]}
                        change={(value) => updateRow(key, value)}
                        numeric
                      />
                    ))}
                  </div>
                  <Input
                    label={`Remarks ${n}`}
                    value={row.remarks ?? ''}
                    change={(value) => updateRow('remarks', value)}
                    max={500}
                  />
                  <button
                    type="button"
                    disabled={entry.observations.length === 1}
                    className={action}
                    onClick={() => {
                      update({
                        observations: entry.observations.filter(
                          (_, i) => i !== index,
                        ),
                      })
                      setPage(
                        Math.min(
                          page,
                          Math.floor((entry.observations.length - 2) / 50),
                        ),
                      )
                    }}
                  >
                    Remove observation {n}
                  </button>
                </fieldset>
              )
            })}
          {entry.observations.length > 50 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={action}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous observations
              </button>
              <span className="text-xs">
                Page {page + 1} of {Math.ceil(entry.observations.length / 50)}
              </span>
              <button
                type="button"
                className={action}
                disabled={(page + 1) * 50 >= entry.observations.length}
                onClick={() => setPage(page + 1)}
              >
                Next observations
              </button>
            </div>
          )}
        </section>
        <details className="space-y-3 rounded-lg border border-[var(--border-color)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Source file and provenance
          </summary>
          <p className="text-xs text-[var(--text-secondary)]">
            Attach the original field file (up to 2 MiB) for traceability. Enter
            its observations in the stated convention above. Attachment does not
            parse or validate an instrument format.
          </p>
          <label className="block space-y-1 text-xs">
            <span>Original field file</span>
            <input
              type="file"
              className="block w-full min-w-0 text-sm"
              onChange={(e) => void attach(e.target.files?.[0])}
            />
          </label>
          {entry.source.kind === 'attachment' ? (
            <div className="space-y-2">
              <p className="break-all text-sm">{entry.source.filename}</p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mappingReviewed}
                  onChange={(e) => {
                    setMappingReviewed(e.target.checked)
                    setReviewed(false)
                  }}
                />
                I checked the entered observation mapping against this original
                file.
              </label>
              <button
                type="button"
                className={action}
                onClick={() => update({ source: { kind: 'manual', note: '' } })}
              >
                Remove attachment
              </button>
            </div>
          ) : (
            <Input
              label="Manual source note"
              value={entry.source.note}
              change={(note) => update({ source: { kind: 'manual', note } })}
              max={500}
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                ['Observer, if known', 'observer'],
                ['Instrument and serial, if known', 'instrument'],
                ['Observation date and time, if known', 'observedAt'],
              ] as const
            ).map(([label, key]) => (
              <Input
                key={key}
                label={label}
                value={entry.provenance[key] ?? ''}
                change={(value) =>
                  update({
                    provenance: { ...entry.provenance, [key]: value || null },
                  })
                }
                max={key === 'observedAt' ? 100 : 200}
              />
            ))}
          </div>
        </details>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          I reviewed original observations, the face-pair and zenith convention,
          opening control, and the current project grid and reduction factor.
        </label>
      </fieldset>
      <button
        type="submit"
        className={action}
        disabled={
          disabled ||
          fileBusy ||
          !context ||
          !reviewed ||
          !!context.prerequisites.length
        }
      >
        Retain computation
      </button>
    </form>
  )
}
