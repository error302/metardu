'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Trash2, Download, CheckCircle, Camera, FileSpreadsheet } from 'lucide-react';
import { VirtualizedTable, type ColumnDef } from '@/components/shared/VirtualizedTable';
import { BulkActionToolbar, type BulkAction } from '@/components/shared/BulkActionToolbar';
import { Badge } from '@/components/ui/badge';

/* ------------------------------------------------------------------ */
/*  Fieldbook observation row type                                     */
/* ------------------------------------------------------------------ */

export type ObservationStatus = 'draft' | 'verified' | 'flagged' | 'deleted';

export interface FieldbookObservation {
  id: string;
  station: string;
  target: string;
  angle: string;
  distance: string;
  height: string;
  remarks: string;
  photos: number;
  status: ObservationStatus;
}

/* ------------------------------------------------------------------ */
/*  Status badge helper                                                */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: ObservationStatus }) {
  const map: Record<ObservationStatus, { label: string; className: string }> = {
    draft: {
      label: 'Draft',
      className: 'bg-zinc-700/50 text-zinc-300 border-zinc-600',
    },
    verified: {
      label: 'Verified',
      className: 'bg-emerald-900/40 text-emerald-400 border-emerald-700',
    },
    flagged: {
      label: 'Flagged',
      className: 'bg-amber-900/40 text-amber-400 border-amber-700',
    },
    deleted: {
      label: 'Deleted',
      className: 'bg-red-900/40 text-red-400 border-red-700',
    },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  CSV export helper                                                  */
/* ------------------------------------------------------------------ */

function exportObservationsAsCSV(obs: FieldbookObservation[], filename = 'fieldbook-export.csv') {
  const header = 'Station,Target,Angle,Distance,Height,Remarks,Photos,Status';
  const rows = obs.map((o) =>
    [
      o.station,
      o.target,
      o.angle,
      o.distance,
      o.height,
      `"${o.remarks.replace(/"/g, '""')}"`,
      o.photos,
      o.status,
    ].join(','),
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

function useFieldbookColumns(): ColumnDef<FieldbookObservation>[] {
  return useMemo(
    () => [
      {
        key: 'station',
        header: 'Station',
        width: 100,
        render: (row) => (
          <span className="font-mono text-[var(--accent)] font-medium">{row.station}</span>
        ),
      },
      {
        key: 'target',
        header: 'Target',
        width: 100,
        render: (row) => <span className="font-mono">{row.target}</span>,
      },
      {
        key: 'angle',
        header: 'Angle',
        width: 120,
        align: 'right',
        render: (row) => <span className="font-mono text-sm">{row.angle}</span>,
      },
      {
        key: 'distance',
        header: 'Distance (m)',
        width: 110,
        align: 'right',
        render: (row) => <span className="font-mono text-sm">{row.distance}</span>,
      },
      {
        key: 'height',
        header: 'Height (m)',
        width: 100,
        align: 'right',
        render: (row) => <span className="font-mono text-sm">{row.height}</span>,
      },
      {
        key: 'remarks',
        header: 'Remarks',
        width: 180,
        render: (row) => (
          <span className="text-[var(--text-muted)] truncate block max-w-[170px]">
            {row.remarks || '—'}
          </span>
        ),
      },
      {
        key: 'photos',
        header: 'Photos',
        width: 70,
        align: 'center',
        render: (row) =>
          row.photos > 0 ? (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <Camera className="h-3 w-3" />
              {row.photos}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          ),
      },
      {
        key: 'status',
        header: 'Status',
        width: 90,
        align: 'center',
        render: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [],
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface FieldbookTableProps {
  /** Array of fieldbook observations */
  observations: FieldbookObservation[];
  /** Callback when observations change (after bulk actions) */
  onObservationsChange: (observations: FieldbookObservation[]) => void;
  /** Height of the table viewport (default 500) */
  tableHeight?: number;
  /** Callback when a row is clicked */
  onRowClick?: (obs: FieldbookObservation, index: number) => void;
  /** Optional class */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FieldbookTable({
  observations,
  onObservationsChange,
  tableHeight = 500,
  onRowClick,
  className,
}: FieldbookTableProps) {
  const columns = useFieldbookColumns();
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  /* ---- Derived ---- */
  const activeObservations = useMemo(
    () => observations.filter((o) => o.status !== 'deleted'),
    [observations],
  );

  const selectedCount = selectedRows.size;
  const totalCount = activeObservations.length;

  /* ---- Bulk actions ---- */
  const handleDeleteSelected = useCallback(async () => {
    const updated = observations.map((obs, idx) =>
      selectedRows.has(idx) ? { ...obs, status: 'deleted' as ObservationStatus } : obs,
    );
    onObservationsChange(updated);
    setSelectedRows(new Set());
  }, [observations, selectedRows, onObservationsChange]);

  const handleExportSelected = useCallback(async () => {
    const selectedObs = activeObservations.filter((_, idx) => selectedRows.has(idx));
    if (selectedObs.length === 0) return;
    exportObservationsAsCSV(selectedObs);
    setSelectedRows(new Set());
  }, [activeObservations, selectedRows]);

  const handleVerifySelected = useCallback(async () => {
    const updated = observations.map((obs, idx) =>
      selectedRows.has(idx) && obs.status !== 'deleted'
        ? { ...obs, status: 'verified' as ObservationStatus }
        : obs,
    );
    onObservationsChange(updated);
    setSelectedRows(new Set());
  }, [observations, selectedRows, onObservationsChange]);

  const bulkActions: BulkAction[] = useMemo(
    () => [
      {
        label: 'Delete',
        icon: Trash2,
        variant: 'danger',
        onClick: handleDeleteSelected,
      },
      {
        label: 'Export CSV',
        icon: Download,
        variant: 'default',
        onClick: handleExportSelected,
      },
      {
        label: 'Mark Verified',
        icon: CheckCircle,
        variant: 'default',
        onClick: handleVerifySelected,
      },
    ],
    [handleDeleteSelected, handleExportSelected, handleVerifySelected],
  );

  /* ---- Summary row above table ---- */
  const statusCounts = useMemo(() => {
    const counts: Record<ObservationStatus, number> = { draft: 0, verified: 0, flagged: 0, deleted: 0 };
    for (const o of observations) counts[o.status]++;
    return counts;
  }, [observations]);

  return (
    <div
      className={`flex flex-col gap-3 ${className ?? ''}`}
      role="table"
      aria-label="Fieldbook observations table"
      aria-rowcount={activeObservations.length}
      aria-colcount={columns.length + (selectedRows.size > 0 ? 1 : 0)}
    >
      {/* Screen reader live region for row count updates */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {activeObservations.length} observations displayed
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]" role="row">
        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="h-4 w-4 text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">
            {activeObservations.length}
          </span>{' '}
          observations
        </div>
        <span className="text-[var(--border-color)]">|</span>
        <span>
          <span className="text-emerald-400">{statusCounts.verified}</span> verified
        </span>
        <span>
          <span className="text-zinc-400">{statusCounts.draft}</span> draft
        </span>
        <span>
          <span className="text-amber-400">{statusCounts.flagged}</span> flagged
        </span>
        {statusCounts.deleted > 0 && (
          <span>
            <span className="text-red-400">{statusCounts.deleted}</span> deleted
          </span>
        )}
      </div>

      {/* Virtualized table */}
      <VirtualizedTable<FieldbookObservation>
        rows={activeObservations}
        columns={columns}
        tableHeight={tableHeight}
        selectable
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        onRowClick={onRowClick}
        rowKey={(row) => row.id}
        emptyMessage="No observations recorded yet"
        aria-label="Observation data rows"
      />

      {/* Bulk action toolbar (appears when rows are selected) */}
      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={totalCount}
        actions={bulkActions}
        onClearSelection={() => setSelectedRows(new Set())}
      />
    </div>
  );
}

export default FieldbookTable;
