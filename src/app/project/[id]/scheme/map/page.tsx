'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import GeomaticsIcon from '@/components/icons/GeomaticsIcon'
import type { SchemeViewportStatus } from '@/lib/map/schemeLayer'
const SchemeMapCanvas = dynamic(() => import('./SchemeMapCanvas'), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-4 text-sm">
      Opening the geometry map…
    </p>
  ),
})
const action =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm disabled:opacity-40'
export default function SchemeMapPage() {
  const { id } = useParams<{ id: string }>()
  return <StoredGeometryMap key={id} projectId={id} />
}
function StoredGeometryMap({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<SchemeViewportStatus | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const onStatus = useCallback((value: SchemeViewportStatus) => {
    setStatus(value)
    setError(value.error ?? '')
  }, [])
  const onError = useCallback((message: string) => {
    setError(message)
    setStatus(null)
  }, [])
  return (
    <section
      className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-6"
      aria-label="Stored parcel geometry workspace"
    >
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link
          href={`/project/${projectId}/scheme`}
          className="underline underline-offset-4"
        >
          Scheme overview
        </Link>
        <Link
          href={`/project/${projectId}/scheme/blocks`}
          className="underline underline-offset-4"
        >
          Blocks and parcel review
        </Link>
        <Link
          href={`/project/${projectId}/deliver`}
          className="underline underline-offset-4"
        >
          Review registered outputs
        </Link>
      </nav>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <GeomaticsIcon symbol="parcel" className="h-6 w-6" />
            Stored parcel geometry
          </h1>
          <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">
            {status
              ? `${status.extent.projectName} · ${status.extent.crs} · ${status.extent.totalParcels.toLocaleString()} parcel records`
              : error
                ? 'The saved project reference and geometry register are unavailable.'
                : 'Loading the saved project reference and geometry register…'}
          </p>
        </div>
        <button
          type="button"
          className={action}
          onClick={() => {
            setStatus(null)
            setError('')
            setRevision((value) => value + 1)
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reload geometry
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-red-500/30 p-3 text-sm"
        >
          {error} Reload the geometry view to retry.
        </p>
      )}
      {status && (
        <p
          role="status"
          className="break-words rounded-lg border border-[var(--border-color)] p-3 text-sm"
        >
          {status.loading
            ? 'Loading this view. Outlines and snapping are temporarily cleared.'
            : status.message}
        </p>
      )}
      <div className="h-[65vh] min-h-80 max-h-[48rem] min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
        <SchemeMapCanvas
          key={revision}
          projectId={projectId}
          onStatus={onStatus}
          onError={onError}
        />
      </div>
      <div
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Geometry review legend"
      >
        <Legend
          color="#6F8D7A"
          title="Reviewed draft"
          text="Stored geometry and retained source have not changed since review. Independent field approval remains separate."
        />
        <Legend
          color="#C88B54"
          title="Changed since review"
          text="A source, reference, geometry or parcel revision changed. The shape is unavailable for snapping until reviewed again."
        />
        <Legend
          color="#8A8D92"
          title="Unassessed stored geometry"
          text="A stored shape has no accessible matching review receipt. Density groups show record counts and are never survey points."
        />
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Stored polygons use the declared project grid. Missing, incompatible or
        oversized geometry is reported rather than reconstructed from station
        names. Use the parcel register to review boundaries and the deliverables
        stage for registered outputs.
      </p>
    </section>
  )
}
function Legend({
  color,
  title,
  text,
}: {
  color: string
  title: string
  text: string
}) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        {title}
      </p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{text}</p>
    </div>
  )
}
