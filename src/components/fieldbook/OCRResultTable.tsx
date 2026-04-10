'use client';

/**
 * METARDU — OCR Result Table
 *
 * Editable table showing extracted level book data with:
 * - Color-coded confidence indicators (green / yellow / red)
 * - Flagged cells highlighted with border
 * - Click-to-edit for any cell value
 * - Verify button to re-run leveling computations
 * - Accept button to import verified data
 */

import { useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Shield, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import type { LevelBookRow, LevelBookFormat } from '@/lib/ocr/ocrParser';

// ─── Confidence Colors ──────────────────────────────────────────

const CONF_HIGH = 90;   // >= 90% green
const CONF_MED = 70;    // 70-89% yellow
// < 70% red

function confidenceColor(confidence: number): string {
  if (confidence >= CONF_HIGH) return 'text-green-400';
  if (confidence >= CONF_MED) return 'text-yellow-400';
  return 'text-red-400';
}

function confidenceBg(confidence: number): string {
  if (confidence >= CONF_HIGH) return 'bg-green-500/5';
  if (confidence >= CONF_MED) return 'bg-yellow-500/5';
  return 'bg-red-500/5';
}

function confidenceLabel(confidence: number): string {
  if (confidence >= CONF_HIGH) return 'High';
  if (confidence >= CONF_MED) return 'Medium';
  return 'Low';
}

// ─── Editable Cell ──────────────────────────────────────────────

function EditableCell({
  value,
  confidence,
  flagged,
  onChange,
  placeholder,
  inputMode = 'decimal',
}: {
  value: string;
  confidence?: number;
  flagged?: boolean;
  onChange: (val: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'decimal';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleBlur = () => {
    setEditing(false);
    onChange(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setEditing(false);
      onChange(draft);
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  const displayValue = value || '';

  if (editing) {
    return (
      <input
        autoFocus
        inputMode={inputMode}
        className="input input-sm w-full text-xs"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`
        cursor-pointer px-2 py-1 rounded text-xs font-mono text-right transition-colors
        ${confidence !== undefined ? confidenceBg(confidence) : ''}
        ${flagged ? 'ring-2 ring-red-500/50' : 'hover:bg-white/10'}
      `}
      title={
        confidence !== undefined
          ? `Confidence: ${confidence.toFixed(0)}% (${confidenceLabel(confidence)})${flagged ? ' — Flagged' : ''}`
          : 'Click to edit'
      }
    >
      {displayValue || (
        <span className="text-[var(--text-muted)] italic">{placeholder || '—'}</span>
      )}
    </div>
  );
}

// ─── Main Table Component ───────────────────────────────────────

interface OCRResultTableProps {
  rows: LevelBookRow[];
  format: LevelBookFormat;
  openingRL: number | null;
  onUpdateRow: (rowId: string, updates: Partial<LevelBookRow>) => void;
  onDeleteRow: (rowId: string) => void;
  onAddRow: () => void;
  onVerify: (openingRL: number) => void;
  onAccept: () => void;
}

export function OCRResultTable({
  rows,
  format,
  openingRL,
  onUpdateRow,
  onDeleteRow,
  onAddRow,
  onVerify,
  onAccept,
}: OCRResultTableProps) {
  const [verifyRL, setVerifyRL] = useState(openingRL !== null ? String(openingRL) : '');
  const [showRawText, setShowRawText] = useState(false);
  const [sortField, setSortField] = useState<'index' | 'confidence'>('index');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const flaggedCount = rows.filter((r) => r.flagged).length;
  const avgConfidence =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + r.ocrConfidence, 0) / rows.length
      : 0;

  const handleVerify = () => {
    const rl = parseFloat(verifyRL);
    if (!Number.isFinite(rl)) {
      alert('Please enter a valid opening RL.');
      return;
    }
    onVerify(rl);
  };

  const toggleSort = (field: 'index' | 'confidence') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    if (sortField === 'index') {
      return sortDir === 'asc' ? 0 : 0; // preserve original order
    }
    return sortDir === 'asc'
      ? a.ocrConfidence - b.ocrConfidence
      : b.ocrConfidence - a.ocrConfidence;
  });

  return (
    <div className="card">
      <div className="card-header flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="label">OCR Results</span>
          <span className="text-xs text-[var(--text-muted)]">
            {rows.length} row{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Confidence summary */}
          <div className={`text-xs font-mono px-2 py-1 rounded ${confidenceColor(avgConfidence)}`}>
            Avg: {avgConfidence.toFixed(0)}%
          </div>

          {flaggedCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {flaggedCount} flagged
            </div>
          )}

          {/* Format badge */}
          <span className="text-xs px-2 py-1 rounded bg-[#1B3A5C]/10 text-[#1B3A5C] border border-[#1B3A5C]/20">
            {format === 'rise_and_fall' ? 'Rise & Fall' : format === 'height_of_collimation' ? 'H of C' : 'Unknown'}
          </span>
        </div>
      </div>

      <div className="card-body space-y-4">
        {/* Verify controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 max-w-xs">
            <label className="label text-xs">Opening RL (for verification)</label>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                className="input input-sm flex-1"
                value={verifyRL}
                onChange={(e) => setVerifyRL(e.target.value)}
                placeholder="e.g. 100.0000"
              />
              <button onClick={handleVerify} className="btn btn-secondary text-xs flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" />
                Verify
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={onAddRow} className="btn btn-secondary text-xs flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
            <button onClick={onAccept} className="btn btn-primary text-xs flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accept All
            </button>
          </div>
        </div>

        {/* Confidence legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-500/30" />
            High (&ge;90%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-yellow-500/30" />
            Medium (70–89%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-500/30" />
            Low (&lt;70%)
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            Flagged
          </span>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">Sort by:</span>
          <button
            onClick={() => toggleSort('index')}
            className={`px-2 py-1 rounded transition-colors ${
              sortField === 'index'
                ? 'bg-[#1B3A5C]/10 text-[#1B3A5C] border border-[#1B3A5C]/20'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Original Order
          </button>
          <button
            onClick={() => toggleSort('confidence')}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              sortField === 'confidence'
                ? 'bg-[#1B3A5C]/10 text-[#1B3A5C] border border-[#1B3A5C]/20'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Confidence
            {sortField === 'confidence' && (
              sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Data table */}
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded border border-[var(--border-color)]">
          <table className="table min-w-[850px]">
            <thead className="sticky top-0 z-10 bg-[var(--bg-primary)]">
              <tr>
                <th className="text-left text-xs w-8">#</th>
                <th className="text-left text-xs">Station</th>
                <th className="text-xs">BS</th>
                <th className="text-xs">IS</th>
                <th className="text-xs">FS</th>
                <th className="text-xs">Rise</th>
                <th className="text-xs">Fall</th>
                <th className="text-xs">RL</th>
                <th className="text-xs">Conf.</th>
                <th className="text-left text-xs">Remarks</th>
                <th className="text-xs w-8" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-sm text-[var(--text-muted)] py-8">
                    No data. Upload and scan a level book page first.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`
                      ${row.flagged ? 'bg-red-500/5' : ''}
                      ${idx % 2 === 0 ? 'bg-[var(--bg-primary)]/20' : ''}
                    `}
                  >
                    {/* Row number */}
                    <td className="text-left text-xs text-[var(--text-muted)]">{idx + 1}</td>

                    {/* Station */}
                    <td className="text-left">
                      <EditableCell
                        value={row.station}
                        confidence={undefined}
                        flagged={false}
                        onChange={(val) => onUpdateRow(row.id, { station: val })}
                        placeholder="Station"
                        inputMode="text"
                      />
                    </td>

                    {/* BS */}
                    <td>
                      <EditableCell
                        value={row.bs !== null ? String(row.bs) : ''}
                        confidence={row.bs !== null ? row.ocrConfidence : undefined}
                        flagged={row.flagged}
                        onChange={(val) => {
                          const n = parseFloat(val);
                          onUpdateRow(row.id, { bs: Number.isFinite(n) ? n : null });
                        }}
                        placeholder="—"
                      />
                    </td>

                    {/* IS */}
                    <td>
                      <EditableCell
                        value={row.is !== null ? String(row.is) : ''}
                        confidence={row.is !== null ? row.ocrConfidence : undefined}
                        flagged={row.flagged}
                        onChange={(val) => {
                          const n = parseFloat(val);
                          onUpdateRow(row.id, { is: Number.isFinite(n) ? n : null });
                        }}
                        placeholder="—"
                      />
                    </td>

                    {/* FS */}
                    <td>
                      <EditableCell
                        value={row.fs !== null ? String(row.fs) : ''}
                        confidence={row.fs !== null ? row.ocrConfidence : undefined}
                        flagged={row.flagged}
                        onChange={(val) => {
                          const n = parseFloat(val);
                          onUpdateRow(row.id, { fs: Number.isFinite(n) ? n : null });
                        }}
                        placeholder="—"
                      />
                    </td>

                    {/* Rise */}
                    <td>
                      <div className="px-2 py-1 text-xs font-mono text-right text-[var(--text-secondary)]">
                        {row.rise !== null ? Number(row.rise).toFixed(3) : '—'}
                      </div>
                    </td>

                    {/* Fall */}
                    <td>
                      <div className="px-2 py-1 text-xs font-mono text-right text-[var(--text-secondary)]">
                        {row.fall !== null ? Number(row.fall).toFixed(3) : '—'}
                      </div>
                    </td>

                    {/* RL */}
                    <td>
                      <EditableCell
                        value={row.rl !== null ? String(row.rl) : ''}
                        confidence={row.rl !== null ? row.ocrConfidence : undefined}
                        flagged={row.flagged}
                        onChange={(val) => {
                          const n = parseFloat(val);
                          onUpdateRow(row.id, { rl: Number.isFinite(n) ? n : null });
                        }}
                        placeholder="—"
                      />
                    </td>

                    {/* Confidence */}
                    <td>
                      <div
                        className={`px-2 py-1 text-xs font-mono text-center rounded ${confidenceColor(row.ocrConfidence)}`}
                        title={`${row.ocrConfidence.toFixed(0)}%`}
                      >
                        {row.ocrConfidence.toFixed(0)}%
                      </div>
                    </td>

                    {/* Remarks */}
                    <td className="text-left">
                      <EditableCell
                        value={row.remarks}
                        confidence={undefined}
                        flagged={false}
                        onChange={(val) => onUpdateRow(row.id, { remarks: val })}
                        placeholder=""
                        inputMode="text"
                      />
                    </td>

                    {/* Delete */}
                    <td>
                      <button
                        onClick={() => onDeleteRow(row.id)}
                        className="text-[var(--text-muted)] hover:text-red-400 transition-colors p-1"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Flag details */}
        {flaggedCount > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 select-none">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              View flagged rows details
            </summary>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {rows
                .filter((r) => r.flagged)
                .map((r) => (
                  <div key={r.id} className="flex items-start gap-2 px-2 py-1 bg-red-500/5 rounded">
                    <span className="text-[var(--text-secondary)] font-medium shrink-0">{r.station}:</span>
                    <ul className="text-red-300/80">
                      {r.flags.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
