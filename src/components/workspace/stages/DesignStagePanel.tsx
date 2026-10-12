'use client'

/**
 * DesignStagePanel — CAD, parcel drafting, alignment, and structural design hub.
 *
 * Blueprint reference:
 *   §5.4 Design / Draft / Set Out
 *   §7.5 Plan generation & parcel drafting
 *   §9 Engineering survey workspace
 *   §11 Construction / building workspace
 *   §13 SurveyCAD
 */

import React, { useMemo } from 'react'
import { PenTool, Split, Compass, Grid, ArrowRight, FileCode, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

interface Props {
  projectId: string
  projectName: string
  /** Project geometry from the stage shell — drafting needs something to draft. */
  boundaryData?: { adjustedStations?: StationLike[] | null; stations?: StationLike[] } | null
  /** Project CRS, when declared. */
  epsg?: string
}

interface StationLike {
  adjustedEasting?: number
  easting?: number
  adjustedNorthing?: number
  northing?: number
}

export default function DesignStagePanel({ projectId, projectName, boundaryData, epsg }: Props) {
  const vertexCount = useMemo(() => {
    const stations = boundaryData?.adjustedStations ?? boundaryData?.stations ?? [];
    return stations.filter(
      (s) =>
        Number.isFinite(Number(s.adjustedEasting ?? s.easting)) &&
        Number.isFinite(Number(s.adjustedNorthing ?? s.northing))
    ).length;
  }, [boundaryData]);

  return (
    <div className="space-y-5">
      {/* Drafting readiness — what design/drafting can actually work from right now */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Drafting readiness
          </h3>
          {vertexCount >= 3 ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {vertexCount} DRAFTABLE VERTICES
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <TriangleAlert className="w-3 h-3" /> NO GEOMETRY YET
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          {vertexCount >= 3
            ? `${projectName} has computed coordinates to draft from${
                epsg ? ` (${epsg})` : '. Declare the project CRS before issuing drawings.'
              }`
            : 'Run the Compute stage so coordinates exist. Drafting, subdivision and set-out need measured geometry — a link list is not a design.'}
        </p>
        {vertexCount >= 3 && !epsg && (
          <p className="text-[11px] text-amber-400">
            Drawings issued before the CRS is declared cannot state their reference system.
          </p>
        )}
      </div>
      {/* CAD Editor Banner */}
      <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Integrated SurveyCAD Surface
            </h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            DXF COMPATIBLE
          </span>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Draft survey linework, boundaries, road reserves, building footprints, and annotations with snap-to-beacons, offset tools, and statutory layer standards.
        </p>
        <div>
          <Link
            href={`/project/${projectId}/cad-editor`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-xs font-semibold hover:bg-[var(--accent-dim)] transition-colors"
          >
            <PenTool className="w-3.5 h-3.5" />
            Open SurveyCAD Studio
          </Link>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Opens this project's drawing surface with its own coordinates and layers.
          </p>
        </div>
      </div>

      {/* Design Workspaces by Survey Discipline */}
      <div className="space-y-3">
        <h4 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Design & Drafting Modules
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {/* Cadastral Subdivision */}
          <Link
            href={`/tools/subdivision-generator?projectId=${projectId}`}
            className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors space-y-1 block"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Split className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-[var(--text-primary)]">Subdivision Generator</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Partition parent parcels into uniform plots with frontage, setbacks, and access roads.
            </p>
          </Link>

          {/* Road Design */}
          <Link
            href={`/project/${projectId}/engineering`}
            className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors space-y-1 block"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-orange-400" />
                <span className="font-semibold text-[var(--text-primary)]">Road Alignment & Profile</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Horizontal clothoid spirals, vertical parabolic curves, cross-sections, and superelevation.
            </p>
          </Link>

          {/* Foundation & Pile Grid */}
          <Link
            href="/tools/pile-grid"
            className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors space-y-1 block"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-[var(--text-primary)]">Building & Pile Grid</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Setting out column centerlines, pile coordinates, rotated structural grids, and offsets.
            </p>
          </Link>

          {/* Machine Control Export */}
          <Link
            href="/tools/machine-control"
            className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors space-y-1 block"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-[var(--text-primary)]">Machine Control Export</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Export 3D LandXML, Leica iCON, and Trimble formats for automated grade guidance.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
