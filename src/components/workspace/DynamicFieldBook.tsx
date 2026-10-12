'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/api-client/client';
import { usePrint, PrintButton, PrintHeader } from '@/hooks/usePrint';
import { SurveyType } from '@/types/project';
import { FieldBookColumn, FieldBookRow } from '@/types/fieldbook';
import { getFieldBookTemplate } from '@/lib/workflows/fieldBookTemplates';
import { applyAutoCalculations, validateFieldBook, FieldBookWarning } from '@/lib/workflows/autoCalculate';
import { runLevelingComputation, getLevelingClosureStatus } from '@/lib/compute/levelingRunner';
import { runBowditchAdjustment, getTraversePrecisionStatus } from '@/lib/compute/traverseRunner';
import { computeCutFillVolume, getCutFillSummary } from '@/lib/compute/volumeRunner';

interface Props {
  projectId: string;
  surveyType: SurveyType;
  initialRows?: FieldBookRow[];
  openingRL?: number;
  closingRL?: number;
  startPoint?: { name: string; easting: number; northing: number };
}

const FIXED_COLUMNS = new Set([
  'station', 'bs', 'is', 'fs', 'rl', 'instrument_height', 'remark',
]);

function emptyRow(columns: FieldBookColumn[]): FieldBookRow {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

function rowToDbRecord(
  row: FieldBookRow,
  rowIndex: number,
  projectId: string,
  surveyType: string,
  columns: FieldBookColumn[]
) {
  const fixed: Record<string, unknown> = {
    project_id: projectId,
    row_index: rowIndex,
    survey_type: surveyType,
    updated_at: new Date().toISOString(),
  };

  const rawData: Record<string, unknown> = {};

  for (const col of columns) {
    const value = row[col.key] ?? null;
    const targetColumn = col.fixedColumn ?? (FIXED_COLUMNS.has(col.key) ? col.key : null);

    if (targetColumn) {
      if (['bs', 'is', 'fs', 'rl', 'instrument_height'].includes(targetColumn)) {
        fixed[targetColumn] = value !== '' && value !== null ? Number(value) : null;
      } else {
        fixed[targetColumn] = value !== '' ? value : null;
      }
    } else {
      rawData[col.key] = value !== '' ? value : null;
    }
  }

  fixed['raw_data'] = rawData;
  return fixed;
}

export default function DynamicFieldBook({ projectId, surveyType, initialRows = [], openingRL, closingRL, startPoint }: Props) {
  const { print, isPrinting, paperSize, setPaperSize, orientation, setOrientation } = usePrint({ title: 'Field Book' });
  // AUDIT FIX (H-007, 2026-07-27): useMemo prevents infinite loop.
  const dbClient = useMemo(() => createClient(), []);
  const template = getFieldBookTemplate(surveyType);

  const [rows, setRows] = useState<FieldBookRow[]>(
    initialRows.length > 0 ? initialRows : [emptyRow(template.columns)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [computeResult, setComputeResult] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<FieldBookWarning[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [engOpeningRL, setEngOpeningRL] = useState(openingRL !== undefined ? String(openingRL) : '');
  const [engClosingRL, setEngClosingRL] = useState(closingRL !== undefined ? String(closingRL) : '');
  const [engDistanceKm, setEngDistanceKm] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const ROW_HEIGHT = 38;
  const VIEWPORT_HEIGHT = 560;
  const OVERSCAN = 8;
  const isVirtualized = rows.length > 50 && !isPrinting;

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight, visibleRows } = useMemo(() => {
    if (!isVirtualized) {
      return {
        startIndex: 0,
        endIndex: rows.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        visibleRows: rows,
      };
    }
    const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT);
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(rows.length, Math.floor(scrollTop / ROW_HEIGHT) + visibleCount + OVERSCAN);
    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: start * ROW_HEIGHT,
      bottomSpacerHeight: (rows.length - end) * ROW_HEIGHT,
      visibleRows: rows.slice(start, end),
    };
  }, [rows, scrollTop, isVirtualized]);

  useEffect(() => {
    if (surveyType === 'engineering' && !engOpeningRL && rows[0]?.rl !== undefined && rows[0]?.rl !== '' && Number.isFinite(Number(rows[0]?.rl))) {
      setEngOpeningRL(String(rows[0].rl));
    }
  }, [surveyType, rows, engOpeningRL]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(template.columns)]);
    if (rows.length >= 50 && containerRef.current) {
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }, 50);
    }
  };

  const removeRow = (idx: number) => {
    if (deleteConfirm === idx) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(idx);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const updateCell = useCallback((rowIdx: number, key: string, value: string) => {
    setRows((prev) => {
      const updated = prev.map((row, i) => (i === rowIdx ? { ...row, [key]: value } : row));
      const recalculated = applyAutoCalculations(surveyType, updated, rowIdx);
      const newWarnings = validateFieldBook(surveyType, recalculated);
      setWarnings(newWarnings);
      return recalculated;
    });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const records = rowsRef.current.map((row: FieldBookRow, idx: number) =>
        rowToDbRecord(row, idx, projectId, surveyType, template.columns)
      );
      const { error: dbError } = await dbClient
        .from('project_fieldbook_entries')
        .upsert(records, { onConflict: 'project_id,row_index' });
      if (!dbError) setLastSaved(new Date());
      setSaving(false);
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyType, projectId, template.columns, dbClient]);

  const handleCompute = useCallback(() => {
    try {
      if (surveyType === 'engineering') {
        const effectiveOpeningRL = engOpeningRL !== '' && Number.isFinite(Number(engOpeningRL))
          ? Number(engOpeningRL)
          : (openingRL !== undefined && Number.isFinite(openingRL) ? openingRL : (rows[0]?.rl !== undefined && rows[0]?.rl !== '' && Number.isFinite(Number(rows[0]?.rl)) ? Number(rows[0]?.rl) : undefined));

        if (effectiveOpeningRL !== undefined) {
          const effectiveClosingRL = engClosingRL !== '' && Number.isFinite(Number(engClosingRL))
            ? Number(engClosingRL)
            : (closingRL !== undefined && Number.isFinite(Number(closingRL)) ? Number(closingRL) : undefined);
          const effectiveDistKm = engDistanceKm !== '' && Number.isFinite(Number(engDistanceKm)) && Number(engDistanceKm) > 0
            ? Number(engDistanceKm)
            : undefined;

          const result = runLevelingComputation({
            rows,
            openingRL: effectiveOpeningRL,
            closingRL: effectiveClosingRL,
            distanceKm: effectiveDistKm,
            method: 'rise_and_fall',
          });
          const status = getLevelingClosureStatus(result);
          setComputeResult(status.message);
        } else {
          setComputeResult('Please provide Opening Benchmark RL (m) to reduce levels');
        }
      } else if (surveyType === 'cadastral') {
        if (startPoint) {
          const result = runBowditchAdjustment({
            rows,
            startPoint,
          });
          const status = getTraversePrecisionStatus(result);
          setComputeResult(status.message);
        } else {
          setComputeResult('Please provide start point coordinates in project settings');
        }
      } else if (surveyType === 'topographic') {
        const radialRows = rows.filter((r) => r.point_no && (r.hd || r.distance) && r.bearing);
        if (radialRows.length > 0) {
          const count = radialRows.length;
          const withRL = radialRows.filter((r) => r.rl !== '' && r.rl !== undefined && r.rl !== null).length;
          setComputeResult(`Reduced ${count} radial point${count === 1 ? '' : 's'} (${withRL} with elevations).`);
        } else {
          setComputeResult('Need points with Point No., Bearing, and Horizontal Distance (HD)');
        }
      } else if (surveyType === 'geodetic') {
        setComputeResult('Geodetic baseline processing — enter control points and observed baselines to compute adjustments');
      } else if (surveyType === 'drone') {
        setComputeResult('Drone survey processing — import ground control points and process aerial imagery');
      } else if (surveyType === 'deformation') {
        const epochs = new Set(rows.map((r) => r.epoch).filter(Boolean));
        if (epochs.size < 2) {
          setComputeResult('Minimum 2 epochs required for comparison');
        } else {
          setComputeResult('Deformation epoch comparison — enter coordinates for each monitoring epoch');
        }
      }
    } catch (e) {
      setComputeResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [rows, surveyType, openingRL, closingRL, startPoint, engOpeningRL, engClosingRL, engDistanceKm]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const records = rows.map((row: FieldBookRow, idx: number) =>
      rowToDbRecord(row, idx, projectId, surveyType, template.columns)
    );

    const { error: dbError } = await dbClient
      .from('project_fieldbook_entries')
      .upsert(records, { onConflict: 'project_id,row_index' });

    if (dbError) {
      setError('Save failed: ' + dbError.message);
    } else {
      setLastSaved(new Date());
    }
    setSaving(false);
  };

  const renderCell = (col: FieldBookColumn, row: FieldBookRow, rowIdx: number) => {
    const value = String(row[col.key] ?? '');
    const base = 'w-full text-sm outline-none bg-transparent px-1 py-0.5';

    if (col.type === 'select' && col.options) {
      return (
        <select
          value={value}
          onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
          className={base}
        >
          <option value="">—</option>
          {col.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    return (
      <input aria-label={col.label}
        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
        value={value}
        placeholder={col.placeholder ?? ''}
        step={col.type === 'number' ? 'any' : undefined}
        onChange={(e) => updateCell(rowIdx, col.key, e.target.value)}
        className={base}
      />
    );
  };

  const requiredKeys = template.columns.filter((c) => c.required).map((c) => c.key);
  const hasEmptyRequired = rows.some((row) => requiredKeys.some((k) => !row[k]));

  const getComputeButtonLabel = () => {
    switch (surveyType) {
      case 'cadastral': return 'Adjust Traverse (Bowditch)';
      case 'engineering': return 'Reduce Levels';
      case 'topographic': return 'Generate DTM';
      case 'geodetic': return 'Process Baselines';
      case 'drone': return 'Process GCPs';
      case 'deformation': return 'Compare Epochs';
      default: return 'Compute';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <PrintHeader title="Field Book" />
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{template.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 no-print print-hide">
          {lastSaved && <span className="text-xs text-green-600">Saved {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleCompute} disabled={saving} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {getComputeButtonLabel()}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <PrintButton
            print={print}
            isPrinting={isPrinting}
            paperSize={paperSize}
            setPaperSize={setPaperSize}
            orientation={orientation}
            setOrientation={setOrientation}
            printTitle="Field Book"
            compact
          />
        </div>
      </div>
      {surveyType === 'engineering' && (
        <div className="p-3 border-b border-gray-100 bg-gray-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-700">
              Opening Benchmark RL (m)
              <input
                aria-label="Opening Benchmark RL (m)"
                type="number"
                step="any"
                value={engOpeningRL}
                onChange={(e) => setEngOpeningRL(e.target.value)}
                placeholder="e.g. 100.000"
                className="mt-1 w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Closing Benchmark RL (m) <span className="text-gray-400 font-normal">(optional)</span>
              <input
                aria-label="Closing Benchmark RL (m)"
                type="number"
                step="any"
                value={engClosingRL}
                onChange={(e) => setEngClosingRL(e.target.value)}
                placeholder="e.g. 100.064"
                className="mt-1 w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Route Distance (km) <span className="text-gray-400 font-normal">(optional)</span>
              <input
                aria-label="Route Distance (km)"
                type="number"
                step="any"
                value={engDistanceKm}
                onChange={(e) => setEngDistanceKm(e.target.value)}
                placeholder="Auto from chainage"
                className="mt-1 w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm outline-none"
              />
            </label>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">Provide opening benchmark to reduce levels. Allowable misclosure follows 10√K mm per RDM 1.1 Table 5.1.</p>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={(e) => {
          if (isVirtualized) {
            setScrollTop(e.currentTarget.scrollTop);
          }
        }}
        className={`overflow-x-auto ${isVirtualized ? 'overflow-y-auto' : ''}`}
        style={isVirtualized ? { maxHeight: `${VIEWPORT_HEIGHT}px` } : undefined}
      >
        <table className="w-full text-sm border-collapse min-w-max">
          <thead className={isVirtualized ? 'sticky top-0 z-10' : ''}>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-8 px-2 py-1.5 text-left text-xs font-medium text-gray-500">#</th>
              {template.columns.map((col) => (
                <th key={col.key} className={`px-2 py-1.5 text-left text-xs font-medium text-gray-600 w-${col.width ?? '28'}`}>
                  {col.label}{col.required && <span className="text-red-400 ml-0.5">*</span>}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr style={{ height: `${topSpacerHeight}px` }}>
                <td colSpan={template.columns.length + 2} />
              </tr>
            )}
            {visibleRows.map((row, sliceIdx) => {
              const rowIdx = startIndex + sliceIdx;
              return (
                <tr key={rowIdx} style={{ height: `${ROW_HEIGHT}px` }} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-1 text-xs text-gray-400 text-right select-none">{rowIdx + 1}</td>
                  {template.columns.map((col) => (
                    <td key={col.key} className={`border-l border-gray-100 px-1 py-0.5 ${col.required && !row[col.key] ? 'bg-red-50' : ''}`}>
                      {renderCell(col, row, rowIdx)}
                    </td>
                  ))}
                  <td className="border-l border-gray-100 px-1 py-0.5 text-center">
                    <button
                      onClick={() => removeRow(rowIdx)}
                      disabled={rows.length === 1}
                      className={`text-xs ${deleteConfirm === rowIdx ? 'text-red-600 font-medium' : 'text-gray-300 hover:text-red-400'} disabled:opacity-0`}
                      title={deleteConfirm === rowIdx ? 'Click again to confirm' : 'Delete row'}
                    >
                      {deleteConfirm === rowIdx ? '✓' : '×'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {bottomSpacerHeight > 0 && (
              <tr style={{ height: `${bottomSpacerHeight}px` }}>
                <td colSpan={template.columns.length + 2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <button onClick={addRow} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
        <div className="flex items-center gap-3">
          {isVirtualized && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              ⚡ Virtualized ({visibleRows.length}/{rows.length} stations in DOM)
            </span>
          )}
          {hasEmptyRequired && <span className="text-xs text-amber-600">Required fields (*) must be filled.</span>}
          <span className="text-xs text-gray-400">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 flex flex-wrap gap-2">
          {warnings.map((w, idx) => (
            <span
              key={`${w}-${idx}`}
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                w.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {w.rowIndex !== undefined && <span className="mr-1">Row {w.rowIndex + 1}:</span>}
              {w.message}
            </span>
          ))}
        </div>
      )}

      {error && <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">{error}</div>}
      {computeResult && (
        <div className={`px-4 py-2 border-t text-xs ${computeResult.startsWith('Error') ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-100 text-green-700'}`}>
          {computeResult}
        </div>
      )}
    </div>
  );
}