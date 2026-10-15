'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Mountain } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { contourElevationAtIndex } from '@/lib/topo/tinContours';
import {
  computeVolumeFromTIN,
  type SpotHeight,
  type ContourLine,
  type TINSurface,
  type Breakline,
} from '@/lib/engine/contours';
import {
  generateContoursAsync,
  buildTINSurfaceAsync,
  isWorkerAvailable,
} from '@/lib/workers/tinWorkerClient';

import type { TabId, Bounds, ImportStats, ParseError, VolumeResult } from './types';
import { MARGIN, SVG_HEIGHT, SVG_WIDTH } from './constants';
import {
  parseXYZText,
  projectXYZText,
  generateDemoData,
  downloadBlob,
} from './helpers';
import {
  generateDXF,
  generateContourPDF,
  generateSVGExport,
  generateContourCSV,
  contourExportReferenceIssue,
  type ContourExportMetadata,
} from './generators';
import type { SvgElements } from './MapTab';

const tabLoading = () => (
  <div aria-busy="true" className="flex min-h-24 items-center justify-center rounded-lg border border-[var(--border-color)]" role="status" aria-live="polite" aria-label="Loading contour panel">
    <MetarduLogo size={32} showWordmark={false} />
    <span className="sr-only">Loading contour panel</span>
  </div>
);
const ImportTab = dynamic(() => import('./ImportTab').then((module) => module.ImportTab), { ssr: false, loading: tabLoading });
const SettingsTab = dynamic(() => import('./SettingsTab').then((module) => module.SettingsTab), { ssr: false, loading: tabLoading });
const MapTab = dynamic(() => import('./MapTab').then((module) => module.MapTab), { ssr: false, loading: tabLoading });
const ExportTab = dynamic(() => import('./ExportTab').then((module) => module.ExportTab), { ssr: false, loading: tabLoading });
const BreaklineTab = dynamic(() => import('./BreaklineTab').then((module) => module.BreaklineTab), { ssr: false, loading: tabLoading });
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { ComputeLimitNotice } from '@/components/tools/ComputeLimitNotice'
import MetarduLogo from '@/components/MetarduLogo'

// ─── Project point row shape (from /api/project/[id]/points) ───────────────
interface SurveyGenerationInputs {
  points: SpotHeight[]
  breaklines: Breakline[]
  contourInterval: number
  indexMultiplier: number
}
interface SurveyGeneration extends SurveyGenerationInputs {
  contours: ContourLine[]
  surface: TINSurface
  volume: VolumeResult
}
const NO_CONTOURS: ContourLine[] = [];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContourGeneratorPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project');
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  return <ContourWorkspace key={`${userId ?? 'anonymous'}:${projectId ?? 'local'}`} projectId={projectId} userId={userId} />;
}
function ContourWorkspace({ projectId, userId }: { projectId: string | null; userId: string | null }) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<TabId>('import');

  // Tab 1: Import state
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [points, setPoints] = useState<SpotHeight[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2: Settings state
  const [contourInterval, setContourInterval] = useState(1.0);
  const [indexMultiplier, setIndexMultiplier] = useState(5);
  const [mapTitle, setMapTitle] = useState('Topographic Contour Plan')
  const [horizontalCrs, setHorizontalCrs] = useState('')
  const [verticalDatum, setVerticalDatum] = useState('')
  const [heightsInMetres, setHeightsInMetres] = useState(false)
  const [exportError, setExportError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateProgress, setGenerateProgress] = useState(0);
  const [usingWorker, setUsingWorker] = useState(false);
  const [executionMode, setExecutionMode] = useState<'worker' | 'main-thread' | null>(null);

  // Breaklines (AUDIT FIX 2026-07-03: expose engine's breakline support in UI)
  const [breaklines, setBreaklines] = useState<Breakline[]>([]);

  // Results
  const [generation, setGeneration] = useState<SurveyGeneration | null>(null);
  const requestVersion = useRef(0);
  const sourceVersion = useRef(0);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectSource, setProjectSource] = useState(false);
  const alive = useRef(true);
  const pdfLock = useRef(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [sourceReference, setSourceReference] = useState<{ horizontalCrs: string | null; verticalDatum: string | null } | null>(null);
  const currentInputs = useRef<SurveyGenerationInputs>({ points, breaklines, contourInterval, indexMultiplier });
  currentInputs.current = { points, breaklines, contourInterval, indexMultiplier };
  const currentGeneration = generation && generation.points === points && generation.breaklines === breaklines &&
    generation.contourInterval === contourInterval && generation.indexMultiplier === indexMultiplier ? generation : null;
  const contours = currentGeneration?.contours ?? NO_CONTOURS;
  const tinSurface = currentGeneration?.surface ?? null;
  const volumeResult = currentGeneration?.volume ?? null;

  useEffect(() => {
    requestVersion.current += 1;
    setGeneration(null);
    setGenerateError('');
    setExportError('');
    setIsGenerating(false);
    setExecutionMode(null);
    setUsingWorker(false);
    setActiveTab(tab => tab === 'map' || tab === 'export' ? 'settings' : tab);
  }, [points, breaklines, contourInterval, indexMultiplier]);
  useEffect(() => {
    const requests = requestVersion, sources = sourceVersion;
    alive.current = true;
    return () => { alive.current = false; requests.current++; sources.current++ };
  }, []);

  // ─── Project integration: auto-load points from project survey data ──────
  useEffect(() => {
    if (!projectId || !userId) return;
    let cancelled = false;
    const version = ++sourceVersion.current;
    const current = () => !cancelled && version === sourceVersion.current;
    setProjectLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/project/${encodeURIComponent(projectId)}/points?includeIncomplete=true`, { cache: 'no-store' });
        const json = await res.json() as { data?: unknown; error?: string; meta?: { project_id?: string } };
        if (!current()) return;
        if (!res.ok) throw new Error(json.error || 'Could not load private project observations.');
        if (json.meta?.project_id !== projectId) throw new Error('The returned point record does not match the requested project. No terrain was loaded.');
        const text = projectXYZText(json.data);
        const parsed = parseXYZText(text);
        if (!current()) return;
        setRawText(text); setPoints(parsed.points); setParseErrors(parsed.errors);
        setSourceReference(parsed.reference ?? null);
        setHorizontalCrs(parsed.reference?.horizontalCrs ?? ''); setVerticalDatum(parsed.reference?.verticalDatum ?? '');
        setImportStats({ delimiter: 'project CSV', hasHeader: true }); setProjectSource(true);
        if (!Array.isArray(json.data) || json.data.length === 0) setProjectError('This project has no available point observations. No terrain was assumed.');
      } catch (error) {
        if (current()) setProjectError(error instanceof Error ? error.message : 'Could not load project observations.');
      } finally {
        if (current()) setProjectLoading(false);
      }
    })()
    return () => { cancelled = true }
  }, [projectId, userId]);

  const replaceSource = useCallback((text: string) => {
    sourceVersion.current++; requestVersion.current++;
    setRawText(text); setPoints([]); setBreaklines([]); setGeneration(null);
    setParseErrors([]); setImportStats(null); setFileName(''); setProjectSource(false);
    setProjectLoading(false); setProjectError(''); setIsParsing(false);
    setSourceReference(null); setHorizontalCrs(''); setVerticalDatum(''); setHeightsInMetres(false);
    setGenerateError(''); setExportError('');
  }, []);

  // ─── Bounding box computation ────────────────────────────────────────────

  const bounds = useMemo<Bounds | null>(() => {
    if (points.length === 0) return null;
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity, minZ = Infinity, maxZ = -Infinity;
    // Include measured breakline endpoints that extend the observation hull.
    for (const p of [...points, ...breaklines.flatMap(line => [line.start, line.end])]) {
      if (p.easting < minE) minE = p.easting;
      if (p.easting > maxE) maxE = p.easting;
      if (p.northing < minN) minN = p.northing;
      if (p.northing > maxN) maxN = p.northing;
      if (p.elevation < minZ) minZ = p.elevation;
      if (p.elevation > maxZ) maxZ = p.elevation;
    }
    return { minE, maxE, minN, maxN, minZ, maxZ };
  }, [points, breaklines]);

  const exportMetadata = useMemo<ContourExportMetadata>(() => ({
    title: mapTitle,
    horizontalCrs,
    verticalDatum,
    contourInterval,
    heightsInMetres,
  }), [mapTitle, horizontalCrs, verticalDatum, contourInterval, heightsInMetres])
  const referenceIssue = useMemo(() => {
    const issue = contourExportReferenceIssue(exportMetadata)
    if (issue) return issue
    if (sourceReference?.horizontalCrs && sourceReference.horizontalCrs.split('/')[0].trim().toUpperCase() !== horizontalCrs.split('/')[0].trim().toUpperCase()) return 'The entered CRS differs from the observation source. Transform the source coordinates before exporting; changing the label does not convert them.'
    if (sourceReference?.verticalDatum && sourceReference.verticalDatum.trim() !== verticalDatum.trim()) return 'The entered height reference differs from the observation source. Review or transform the source levels before exporting.'
    return null
  }, [exportMetadata, sourceReference, horizontalCrs, verticalDatum])
  const exportContext = useRef({ generation: currentGeneration, metadata: exportMetadata });
  exportContext.current = { generation: currentGeneration, metadata: exportMetadata };

  // ─── File upload handler ──────────────────────────────────────────────────

  const processText = useCallback((text: string) => {
    sourceVersion.current++; requestVersion.current++;
    setProjectLoading(false);
    setIsParsing(true);
    setParseErrors([]);
    setGeneration(null);
    setBreaklines([]);

    try {
      const result = parseXYZText(text);
      setSourceReference(result.reference ?? null);
      if (result.reference) { setHorizontalCrs(result.reference.horizontalCrs ?? ''); setVerticalDatum(result.reference.verticalDatum ?? ''); setHeightsInMetres(false); }
      const spotHeights: SpotHeight[] = result.points.map(p => ({
        name: p.name,
        easting: p.easting,
        northing: p.northing,
        elevation: p.elevation,
      }));
      setPoints(spotHeights);
      setParseErrors(result.errors);
      setImportStats({
        delimiter: result.delimiter === '\t' ? 'tab' : result.delimiter === ',' ? 'comma' : result.delimiter === ';' ? 'semicolon' : 'space',
        hasHeader: result.hasHeader,
      });
    } catch (err) {
      setPoints([]);
      setParseErrors([{ row: 0, message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    replaceSource('');
    const version = sourceVersion.current;
    setFileName(file.name);
    setIsParsing(true);
    setParseErrors([]);
    setGeneration(null);
    setBreaklines([]);

    try {
      if (file.size > 2_000_000) throw new RangeError('Import at most 2 MB of measured text; split the survey explicitly.');
      const text = await file.text();
      if (version !== sourceVersion.current) return;
      setRawText(text);
      processText(text);
    } catch (err) {
      if (version === sourceVersion.current) setParseErrors([{ row: 0, message: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}` }]);
    } finally {
      if (version === sourceVersion.current) setIsParsing(false);
    }
  }, [processText, replaceSource]);

  const handleDropZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handlePasteParse = useCallback(() => {
    if (!rawText.trim()) return;
    processText(rawText);
  }, [rawText, processText]);

  const handleLoadDemo = useCallback(() => {
    replaceSource('');
    const demoPoints = generateDemoData();
    setPoints(demoPoints);
    setGeneration(null);
    setBreaklines([]);
    setParseErrors([]);
    setFileName('demo_synthetic_terrain.csv');
    setImportStats({ delimiter: 'comma', hasHeader: true });
    // Keep the editable sample CSV complete so parsing it again cannot turn
    // the synthetic 400-point surface into a partial dataset plus an invalid
    // ellipsis row.
    const csvLines = [
      'Name,Easting,Northing,Elevation',
      ...demoPoints.map(p => `${p.name},${p.easting},${p.northing},${p.elevation}`),
    ];
    setRawText(csvLines.join('\n'));
  }, [replaceSource]);

  // ─── Generate contours ───────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGeneration(null);
    if (parseErrors.length) {
      setGenerateError('Correct all import errors and parse the complete source again before generating a survey surface.');
      return;
    }
    if (points.length < 3) {
      setGenerateError('At least 3 points are required to generate contours.');
      return;
    }
    if (!Number.isFinite(contourInterval) || contourInterval <= 0 || !Number.isInteger(indexMultiplier) || indexMultiplier < 1 || !Number.isFinite(contourInterval * indexMultiplier)) {
      setGenerateError('Enter a finite positive contour interval and a positive whole-number index multiplier.');
      return;
    }

    setIsGenerating(true);
    setGenerateError('');
    setGenerateProgress(0);
    setExecutionMode(null);
    setUsingWorker(isWorkerAvailable());
    const version = ++requestVersion.current;
    const inputs = { points, breaklines, contourInterval, indexMultiplier };
    const isCurrent = () => version === requestVersion.current && currentInputs.current.points === points &&
      currentInputs.current.breaklines === breaklines && currentInputs.current.contourInterval === contourInterval &&
      currentInputs.current.indexMultiplier === indexMultiplier;
    const onProgress = (progress: number) => { if (isCurrent()) setGenerateProgress(progress) };
    const onExecutionMode = (mode: 'worker' | 'main-thread') => {
      if (isCurrent()) setExecutionMode(previous => previous === 'main-thread' ? previous : mode);
    };

    try {
      const indexInterval = contourElevationAtIndex(contourInterval, indexMultiplier);

      // Use the surveyor's supplied observations without automatic classification
      // or silent removal of measured slopes, hilltops and boundary controls.
      const result = await generateContoursAsync(points, contourInterval, {
        indexInterval,
        breaklines: breaklines.length > 0 ? breaklines : undefined,
        onProgress,
        onExecutionMode,
      });
      if (!isCurrent()) return;

      const surface = await buildTINSurfaceAsync(
        points,
        breaklines.length > 0 ? breaklines : undefined,
        {
          onProgress,
          onExecutionMode,
        },
      );
      if (!isCurrent()) return;

      // Compute volume relative to minimum elevation
      const minElev = Math.min(...surface.points.map(p => p.elevation));
      const vol = computeVolumeFromTIN(surface, minElev);
      setGeneration({ ...inputs, contours: result, surface, volume: vol });
    } catch (err) {
      if (isCurrent()) setGenerateError(err instanceof Error ? err.message : 'Contour generation failed.');
    } finally {
      if (isCurrent()) {
        setIsGenerating(false);
        setGenerateProgress(1);
        setUsingWorker(false);
      }
    }
  }, [points, contourInterval, indexMultiplier, breaklines, parseErrors]);

  // ─── Export handlers ─────────────────────────────────────────────────────

  const exportDXF = useCallback(() => {
    if (!contours.length || !bounds) return;
    if (referenceIssue) { setExportError(referenceIssue); return; }
    setExportError('');
    try {
    const dxf = generateDXF(contours, bounds, exportMetadata);
    downloadBlob(dxf, 'contours.dxf', 'application/dxf');
    } catch (error) { setExportError(error instanceof Error ? error.message : 'The contour source could not be exported.'); }
  }, [contours, bounds, exportMetadata, referenceIssue]);

  const exportPDF = useCallback(async () => {
    if (!contours.length || !bounds || pdfLock.current) return;
    if (referenceIssue) { setExportError(referenceIssue); return; }
    const version = requestVersion.current;
    const current = () => alive.current && version === requestVersion.current && exportContext.current.generation === currentGeneration && exportContext.current.metadata === exportMetadata;
    pdfLock.current = true; setPdfExporting(true);
    setExportError('')
    try {
    const pdf = await generateContourPDF(contours, bounds, points, exportMetadata)
    if (current()) downloadBlob(pdf, 'contour-plan-a3.pdf', 'application/pdf')
    } catch (error) { if (current()) setExportError(error instanceof Error ? error.message : 'The contour source could not be exported.') }
    finally { pdfLock.current = false; if (alive.current) setPdfExporting(false); }
  }, [contours, bounds, points, exportMetadata, currentGeneration, referenceIssue])

  const exportSVG = useCallback(() => {
    if (!contours.length || !bounds) return;
    if (referenceIssue) { setExportError(referenceIssue); return; }
    setExportError('');
    try {
    const svg = generateSVGExport(contours, bounds, points, exportMetadata);
    downloadBlob(svg, 'contours.svg', 'image/svg+xml');
    } catch (error) { setExportError(error instanceof Error ? error.message : 'The contour source could not be exported.'); }
  }, [contours, bounds, points, exportMetadata, referenceIssue]);

  const exportCSV = useCallback(() => {
    if (!contours.length) return;
    if (referenceIssue) { setExportError(referenceIssue); return; }
    setExportError('');
    try {
    const csv = generateContourCSV(contours, exportMetadata);
    downloadBlob(csv, 'contours.csv', 'text/csv');
    } catch (error) { setExportError(error instanceof Error ? error.message : 'The contour source could not be exported.'); }
  }, [contours, exportMetadata, referenceIssue]);

  // ─── SVG rendering computations ──────────────────────────────────────────

  const svgElements = useMemo<SvgElements | null>(() => {
    if (!contours.length || !bounds) return null;

    const usableW = SVG_WIDTH - 2 * MARGIN;
    const usableH = SVG_HEIGHT - 2 * MARGIN;
    const minE = bounds.minE;
    const maxE = bounds.maxE;
    const minN = bounds.minN;
    const maxN = bounds.maxN;
    const rangeE = maxE - minE || 1;
    const rangeN = maxN - minN || 1;

    const contourElevations = contours.map(c => c.elevation);
    const minElev = Math.min(...contourElevations);
    const maxElev = Math.max(...contourElevations);

    // A projected metre must occupy the same drawing distance on both axes.
    // Fit the survey extents into the map frame without stretching its geometry.
    const mapScale = Math.min(usableW / rangeE, usableH / rangeN)
    const plottedW = rangeE * mapScale
    const plottedH = rangeN * mapScale
    const offsetX = (usableW - plottedW) / 2
    const offsetY = (usableH - plottedH) / 2
    function toSvgX(e: number) { return MARGIN + offsetX + ((e - minE) / rangeE) * plottedW; }
    function toSvgY(n: number) { return MARGIN + offsetY + ((maxN - n) / rangeN) * plottedH; }

    // Subsample spot height points for rendering if too many
    const spotStep = Math.max(1, Math.floor(points.length / 2000));
    const spotSampled = points.filter((_, i) => i % spotStep === 0);

    return {
      usableW, usableH, rangeE, rangeN, minElev, maxElev, toSvgX, toSvgY, spotSampled,
      viewBox: `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`,
    };
  }, [contours, bounds, points]);

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const tabs: { id: TabId; label: string; disabled?: boolean }[] = [
    { id: 'import', label: 'Import Points' },
    { id: 'breaklines', label: `Breaklines${breaklines.length > 0 ? ` (${breaklines.length})` : ''}`, disabled: points.length < 3 },
    { id: 'settings', label: 'Settings & Generate', disabled: points.length < 3 },
    { id: 'map', label: 'Contour Map', disabled: contours.length === 0 },
    { id: 'export', label: 'Export', disabled: contours.length === 0 },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Custom header (mutation-plan pattern) */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-emerald-500/10 rounded-lg">
          <Mountain className="h-6 w-6 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('tools.contourGenerator')}</h1>
          <p className="text-sm text-zinc-400">
            {t('tools.contourGeneratorDesc')}
          </p>
        </div>
      </div>

      <ComputeLimitNotice
        tool="Contour generation"
        message="Contour generation runs in a browser worker. Large point clouds and dense contours increase processing time and memory use. Review the source points, derived surface and export before field use."
      />
      {projectId && !userId && <p role="status" className="mt-4 text-sm"><a href={`/login?next=${encodeURIComponent(`/tools/contour-generator?project=${projectId}`)}`} className="underline">Sign in</a> to read this project’s private observations. Manual input remains a local draft.</p>}
      {projectLoading && <p role="status" className="mt-4 text-sm">Loading private project observations…</p>}
      {projectError && <p role="alert" className="mt-4 text-sm text-red-400">{projectError}</p>}
      {projectSource && <p className="mt-4 text-sm text-zinc-400">Project observations loaded for review. Missing heights and missing/mixed reference declarations block generation. No automatic datum or unit conversion is applied.</p>}

      {/* Tab bar */}
      <div className="flex gap-2 mt-6 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            disabled={tab.disabled}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              tab.disabled
                ? 'opacity-40 cursor-not-allowed bg-[var(--bg-tertiary)] text-zinc-600'
                : activeTab === tab.id
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB 1: Import Points ═══════════════════ */}
      {activeTab === 'import' && (
        <ImportTab
          rawText={rawText}
          setRawText={replaceSource}
          fileName={fileName}
          points={points}
          parseErrors={parseErrors}
          importStats={importStats}
          isParsing={isParsing}
          bounds={bounds}
          fileInputRef={fileInputRef}
          handleDropZone={handleDropZone}
          handleFileInput={handleFileInput}
          handlePasteParse={handlePasteParse}
          handleLoadDemo={handleLoadDemo}
          metricReference={referenceIssue == null}
        />
      )}

      {/* ═══════════════════ TAB 1.5: Breaklines ═══════════════════ */}
      {activeTab === 'breaklines' && (
        <BreaklineTab
          points={points}
          breaklines={breaklines}
          setBreaklines={setBreaklines}
        />
      )}

      {/* ═══════════════════ TAB 2: Settings & Generate ═══════════════════ */}
      {activeTab === 'settings' && (
        <SettingsTab
          contourInterval={contourInterval}
          setContourInterval={setContourInterval}
          indexMultiplier={indexMultiplier}
          setIndexMultiplier={setIndexMultiplier}
          mapTitle={mapTitle}
          setMapTitle={setMapTitle}
          horizontalCrs={horizontalCrs}
          setHorizontalCrs={setHorizontalCrs}
          verticalDatum={verticalDatum}
          setVerticalDatum={setVerticalDatum}
          heightsInMetres={heightsInMetres}
          setHeightsInMetres={setHeightsInMetres}
          points={points}
          bounds={bounds}
          isGenerating={isGenerating}
          generateError={generateError}
          handleGenerate={handleGenerate}
          contours={contours}
          tinSurface={tinSurface}
          volumeResult={referenceIssue == null ? volumeResult : null}
          generateProgress={generateProgress}
          usingWorker={usingWorker}
          executionMode={executionMode}
          breaklineCount={breaklines.length}
          generationComplete={currentGeneration != null}
        />
      )}

      {/* ═══════════════════ TAB 3: Contour Map ═══════════════════ */}
      {activeTab === 'map' && svgElements && bounds && (
        <MapTab
          contours={contours}
          bounds={bounds}
          points={points}
          contourInterval={contourInterval}
          svgElements={svgElements}
          metricReference={referenceIssue == null}
        />
      )}

      {/* ═══════════════════ TAB 4: Export ═══════════════════ */}
      {activeTab === 'export' && (
        <ExportTab
          exportDXF={exportDXF}
          exportPDF={exportPDF}
          exportSVG={exportSVG}
          exportCSV={exportCSV}
          volumeResult={volumeResult}
          bounds={bounds}
          metadata={exportMetadata}
          referenceIssue={referenceIssue}
          exportError={exportError}
          pdfExporting={pdfExporting}
        />
      )}
    </div>
  );
}
