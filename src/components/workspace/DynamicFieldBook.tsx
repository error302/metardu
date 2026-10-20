'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePrint, PrintButton, PrintHeader } from '@/hooks/usePrint';
import { SurveyType } from '@/types/project';
import { FieldBookColumn, FieldBookRow } from '@/types/fieldbook';
import { getFieldBookTemplate } from '@/lib/workflows/fieldBookTemplates';
import { applyAutoCalculations, validateFieldBook, FieldBookWarning } from '@/lib/workflows/autoCalculate';
import { runLevelingComputation, getLevelingClosureStatus } from '@/lib/compute/levelingRunner';
import { controlDraft, parseControlDraft } from '@/lib/survey/fieldBookControlDraft';

interface Props {
  projectId: string;
  surveyType: SurveyType;
  initialRows?: FieldBookRow[];
  openingRL?: number;
  closingRL?: number;
  startPoint?: { name: string; easting: number; northing: number };
}

function emptyRow(columns: FieldBookColumn[]): FieldBookRow {
  return Object.fromEntries(columns.map((c) => [c.key, '']));
}

export default function DynamicFieldBook({ projectId, surveyType, initialRows = [], openingRL, closingRL, startPoint }: Props) {
  const { print, isPrinting, paperSize, setPaperSize, orientation, setOrientation } = usePrint({ title: 'Field Book' });
  const template = getFieldBookTemplate(surveyType);

  const [rows, setRows] = useState<FieldBookRow[]>(
    initialRows.length > 0 ? initialRows : [emptyRow(template.columns)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [loadedProject, setLoadedProject] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const revisionRef = useRef<string | null>(null);
  const initialRowsRef = useRef(initialRows);
  const initialStartPointRef = useRef(startPoint);
  const saveInFlight = useRef(false);
  const [projectCrs, setProjectCrs] = useState<string | null>(null);
  const [startingDraft, setStartingDraft] = useState(() => controlDraft(startPoint, null));
  const initialControlRef = useRef(JSON.stringify(startingDraft));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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

  const { startIndex, topSpacerHeight, bottomSpacerHeight, visibleRows } = useMemo(() => {
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

  useEffect(() => {
    let cancelled = false;
    setLoadedProject(null);
    setLoadError(null);
    setLastSaved(null);
    revisionRef.current = null;
    async function load() {
      try {
        const response = await fetch(`/api/project/${projectId}/fieldbook`);
        if (!response.ok) throw new Error('Saved field-book rows could not be loaded. Editing is disabled to preserve existing data.');
        const json = await response.json() as { data?: Record<string, unknown>[]; revision?: string; startPoint?: unknown; projectCrs?: string | null };
        if (!Array.isArray(json.data) || typeof json.revision !== 'string' || !/^[a-f0-9]{64}$/.test(json.revision)) throw new Error('Field-book response is incomplete. Editing is disabled.');
        const restored = json.data.map(record => {
          const raw = record.raw_data && typeof record.raw_data === 'object' && !Array.isArray(record.raw_data)
            ? record.raw_data as Record<string, unknown> : {};
          const row: FieldBookRow = { ...raw };
          for (const column of template.columns) {
            row[column.key] = raw[column.key] ?? record[column.fixedColumn ?? column.key] ?? '';
          }
          return row;
        });
        if (cancelled) return;
        const declaredCrs = typeof json.projectCrs === 'string' ? json.projectCrs : null;
        const starting = controlDraft(json.startPoint === undefined ? initialStartPointRef.current : json.startPoint, declaredCrs);
        setProjectCrs(declaredCrs);
        setStartingDraft(starting);
        initialControlRef.current = JSON.stringify(starting);
        setHasUnsavedChanges(false);
        setRows(restored.length ? restored : initialRowsRef.current.length ? initialRowsRef.current : [emptyRow(template.columns)]);
        revisionRef.current = json.revision;
        setLoadedProject(projectId);
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Field book could not be loaded.');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, template, loadAttempt]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(template.columns)]);
    setLastSaved(null);
    setHasUnsavedChanges(true);
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
      setLastSaved(null);
      setHasUnsavedChanges(true);
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

    setLastSaved(null);
    setHasUnsavedChanges(true);
  }, [surveyType]);

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
        const epochs = new Set(rows.map((r) => typeof r.epoch === 'string' || typeof r.epoch === 'number' ? String(r.epoch) : '').filter(Boolean));
        if (epochs.size < 2) {
          setComputeResult('Minimum 2 epochs required for comparison');
        } else {
          setComputeResult('Deformation epoch comparison — enter coordinates for each monitoring epoch');
        }
      }
    } catch (e) {
      setComputeResult(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [rows, surveyType, openingRL, closingRL, engOpeningRL, engClosingRL, engDistanceKm]);

  const handleSave = async () => {
    if (saveInFlight.current || loadedProject !== projectId || !revisionRef.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const controlChanged = JSON.stringify(startingDraft) !== initialControlRef.current;
      const controlChange = controlChanged ? { startPoint: parseControlDraft(startingDraft, projectCrs) } : {};
      const response = await fetch(`/api/project/${projectId}/fieldbook`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, revision: revisionRef.current, ...controlChange }),
      });
      const json = await response.json() as { saved?: boolean; revision?: string; error?: string };
      if (!response.ok || !json.saved || typeof json.revision !== 'string' || !/^[a-f0-9]{64}$/.test(json.revision)) throw new Error(json.error || 'Save was not confirmed. Your edits remain on screen.');
      revisionRef.current = json.revision;
      initialControlRef.current = JSON.stringify(startingDraft);
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed. Your edits remain on screen.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const renderCell = (col: FieldBookColumn, row: FieldBookRow, rowIdx: number) => {
    const value = String(row[col.key] ?? '');
    const base = 'w-full text-sm outline-none bg-transparent px-1 py-0.5';

    if (col.type === 'select' && col.options) {
      return (
        <select aria-label={col.label}
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

  if (loadedProject !== projectId) return (
    <div role={loadError ? 'alert' : 'status'} className="p-4 text-sm text-[var(--text-secondary)]">
      {loadError || 'Loading saved field-book rows…'}
      {loadError && <button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="ml-3 underline">Retry loading</button>}
    </div>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <PrintHeader title="Field Book" />
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{template.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.description} Save records your edits; drafts are not saved automatically.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 no-print print-hide">
          {lastSaved && <span className="text-xs text-green-600">Saved {lastSaved.toLocaleTimeString()}</span>}
          {surveyType === 'cadastral' ? <Link href={`/project/${projectId}/compute`}
            aria-disabled={saving || hasUnsavedChanges}
            onClick={event => { if (saving || hasUnsavedChanges) { event.preventDefault(); setError('Save the field book and starting coordinate before opening Compute.'); } }}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">Compute saved traverse</Link> : <button onClick={handleCompute} disabled={saving} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {getComputeButtonLabel()}
          </button>}
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
      {surveyType === 'cadastral' && <fieldset disabled={saving} className="m-3 min-w-0 rounded border border-gray-200 p-3 text-xs text-gray-800 space-y-2">
        <legend className="px-1 font-semibold">Starting coordinate — project grid, review required</legend>
        <p>Project grid: {projectCrs || 'Declare the project reference in settings first.'} A coordinate entry does not verify a control mark.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(['name', 'easting', 'northing'] as const).map(key => <label key={key} className="block">
            {key === 'name' ? 'Starting station name' : key === 'easting' ? 'Control easting (m)' : 'Control northing (m)'}
            <input aria-label={key === 'name' ? 'Starting station name' : key === 'easting' ? 'Control easting (m)' : 'Control northing (m)'}
              type={key === 'name' ? 'text' : 'number'} step="any" value={startingDraft[key]}
              onChange={event => { setStartingDraft(value => ({ ...value, [key]: event.target.value })); setHasUnsavedChanges(true); setLastSaved(null); }}
              className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm" />
          </label>)}
        </div>
        <label className="block">Starting coordinate source / limitations
          <input aria-label="Starting coordinate source / limitations" value={startingDraft.notes}
            onChange={event => { setStartingDraft(value => ({ ...value, notes: event.target.value })); setHasUnsavedChanges(true); setLastSaved(null); }}
            className="mt-1 w-full rounded border border-gray-300 bg-white p-2" />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={startingDraft.confirmed} disabled={!projectCrs}
            onChange={event => { setStartingDraft(value => ({ ...value, confirmed: event.target.checked })); setHasUnsavedChanges(true); setLastSaved(null); }} />
          I confirm this starting coordinate uses the declared project grid.
        </label>
        <p>Choose each distance basis below. Use grid only for distances already reduced to this grid; slope observations need an explicit reduction workflow.</p>
      </fieldset>}
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

      <fieldset disabled={saving} className="min-w-0 border-0 p-0 m-0">
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
      </fieldset>
      <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
        <button onClick={addRow} disabled={saving} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add Row</button>
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

      {error && <div role="alert" className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-600">{error}</div>}
      {computeResult && (
        <div className={`px-4 py-2 border-t text-xs ${computeResult.startsWith('Error') ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-100 text-green-700'}`}>
          {computeResult}
        </div>
      )}
    </div>
  );
}
