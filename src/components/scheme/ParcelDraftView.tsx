'use client'
import { useMemo, useState } from 'react'
import { Compass, MapPin } from 'lucide-react'
import type { ParcelShareSnapshot } from '@/lib/scheme/parcelShareContract'
export default function ParcelDraftView({
  snapshot,
}: {
  snapshot: ParcelShareSnapshot
}) {
  const [selected, setSelected] = useState(0),
    [ringIndex, setRingIndex] = useState(0),
    [page, setPage] = useState(1)
  const parcel = snapshot.parcels[selected] ?? snapshot.parcels[0],
    ring = parcel.coordinates[ringIndex] ?? parcel.coordinates[0]
  const drawing = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const item of snapshot.parcels)
      for (const points of item.coordinates)
        for (const [x, y] of points) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
    const longitudeScale = Math.max(
        0.001,
        Math.cos((((minY + maxY) / 2) * Math.PI) / 180),
      ),
      scale = Math.min(
        560 / Math.max((maxX - minX) * longitudeScale, 1e-9),
        330 / Math.max(maxY - minY, 1e-9),
      ),
      x = (value: number) => 40 + (value - minX) * longitudeScale * scale,
      y = (value: number) => 375 - (value - minY) * scale
    return snapshot.parcels.map((item) =>
      item.coordinates
        .map(
          (points) =>
            `M${points.map(([e, n]) => `${x(e)},${y(n)}`).join('L')}Z`,
        )
        .join(' '),
    )
  }, [snapshot])
  return (
    <section aria-label="Retained draft geometry" className="space-y-4 min-w-0">
      <figure className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
        <svg
          viewBox="0 0 640 415"
          className="w-full max-h-[28rem]"
          role="img"
          aria-label="Geographic overview of the shared draft boundaries"
        >
          <title>Geographic overview of the shared draft boundaries</title>
          {drawing.map((d, index) => (
            <path
              key={index}
              d={d}
              fill={
                index === selected ? 'var(--accent,#d17b47)' : 'transparent'
              }
              fillOpacity="0.16"
              fillRule="evenodd"
              stroke="var(--accent,#d17b47)"
              strokeWidth={index === selected ? 2.5 : 1.25}
            />
          ))}
        </svg>
        <figcaption className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
          <Compass className="w-4 h-4 shrink-0" aria-hidden="true" />
          North is up. Geographic overview only; use retained project-grid
          geometry for survey measurements.
        </figcaption>
      </figure>
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm min-w-0">
          Shared parcel
          <select
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 max-w-full"
            value={selected}
            onChange={(event) => {
              setSelected(Number(event.target.value))
              setRingIndex(0)
              setPage(1)
            }}
          >
            {snapshot.parcels.map((item, index) => (
              <option key={index} value={index}>
                {item.label || `Parcel ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm">
          Retained grid area:{' '}
          <strong>
            {parcel.gridAreaSqM.toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}{' '}
            m²
          </strong>
        </p>
        <label className="grid gap-1 text-sm">
          Boundary ring
          <select
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2"
            value={ringIndex}
            onChange={(event) => {
              setRingIndex(Number(event.target.value))
              setPage(1)
            }}
          >
            {parcel.coordinates.map((_points, index) => (
              <option key={index} value={index}>
                {index === 0 ? 'Exterior' : `Interior ${index}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        The following coordinates are transformed boundary vertices in WGS 84
        longitude and latitude. They do not establish a recovered monument or a
        point for construction setting out.
      </p>
      <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">Vertex</th>
              <th className="p-3">Longitude (°)</th>
              <th className="p-3">Latitude (°)</th>
            </tr>
          </thead>
          <tbody>
            {ring.slice((page - 1) * 50, page * 50).map(([lon, lat], index) => (
              <tr className="border-t border-[var(--border-color)]" key={index}>
                <td className="p-3">
                  {(page - 1) * 50 + index + 1 === ring.length
                    ? 'Closing vertex'
                    : (page - 1) * 50 + index + 1}
                </td>
                <td className="p-3 font-mono">{lon.toFixed(7)}</td>
                <td className="p-3 font-mono">{lat.toFixed(7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav
        className="flex flex-wrap justify-between items-center gap-3 text-sm"
        aria-label="Shared vertex pages"
      >
        <span>
          {ring.length} vertices · page {page} of {Math.ceil(ring.length / 50)}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            className="underline disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous vertices
          </button>
          <button
            type="button"
            className="underline disabled:opacity-40"
            disabled={page * 50 >= ring.length}
            onClick={() => setPage((value) => value + 1)}
          >
            Next vertices
          </button>
        </div>
      </nav>
      <p className="flex gap-2 items-start text-sm text-[var(--text-secondary)]">
        <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        No observed heights are supplied. Registered datum parameters do not
        establish local transformation accuracy.
      </p>
    </section>
  )
}
