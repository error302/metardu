'use client';

// State + handlers for the GCP residual validation tool.
//
// Extracted from src/app/tools/gcp-validation/page.tsx as a custom hook so
// the page component stays a thin orchestrator. All React state, refs and
// event handlers live here.

import { useState, useRef, useCallback } from 'react';
import type {
  AccuracyClass,
  KnownGCP,
  ResidualFormat,
  ResidualRow,
  TabId,
  ValidationSummary,
} from './types';
import {
  SAMPLE_AGISOFT,
  SAMPLE_GCPS,
  accuracyClasses,
} from './constants';
import {
  detectFormat,
  fmt,
  parseResiduals,
  runValidation,
} from './helpers';

let nextGcpId = 0;
const allocateGcpId = () => ++nextGcpId;

export function useGCPValidation() {
  const [activeTab, setActiveTab] = useState<TabId>('gcp');
  const [utmZone, setUtmZone] = useState<number>(36);
  const [selectedClass, setSelectedClass] = useState<AccuracyClass>(accuracyClasses[0]);

  // Tab 1: Known GCPs
  const [knownGCPs, setKnownGCPs] = useState<KnownGCP[]>([]);
  const [sampleGCPsLoaded, setSampleGCPsLoaded] = useState(false);
  const [sampleResidualsLoaded, setSampleResidualsLoaded] = useState(false);
  const sampleDataLoaded = sampleGCPsLoaded || sampleResidualsLoaded;

  // Tab 2: Residuals
  const [residualText, setResidualText] = useState('');
  const [residualFormat, setResidualFormat] = useState<ResidualFormat>('auto');
  const [detectedFormat, setDetectedFormat] = useState<ResidualFormat | null>(null);
  const [parsedResiduals, setParsedResiduals] = useState<ResidualRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [gcpImportError, setGcpImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Tab 3: Validation
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);

  /* ── GCP Helpers ── */

  const addGCP = useCallback(() => {
    const last = knownGCPs[knownGCPs.length - 1];
    const num = last ? parseInt(last.name.replace(/\D/g, '') || '0') + 1 : 1;
    setKnownGCPs(prev => [...prev, {
      id: allocateGcpId(),
      name: `GCP-${String(num).padStart(2, '0')}`,
      easting: '', northing: '', elevation: '',
    }]);
    setValidationSummary(null);
  }, [knownGCPs]);

  const removeGCP = useCallback((id: number) => {
    setKnownGCPs(prev => prev.filter(g => g.id !== id));
    setValidationSummary(null);
  }, []);

  const updateGCP = useCallback((id: number, field: keyof KnownGCP, value: string) => {
    setKnownGCPs(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
    setValidationSummary(null);
  }, []);

  const clearGCPs = useCallback(() => {
    setKnownGCPs([]);
    setSampleGCPsLoaded(false);
    setGcpImportError(null);
    setValidationSummary(null);
  }, []);

  const loadSampleGCPs = useCallback(() => {
    setKnownGCPs(SAMPLE_GCPS.map(g => ({ ...g, id: allocateGcpId() })));
    setSampleGCPsLoaded(true);
    setValidationSummary(null);
  }, []);

  const parseCSVText = useCallback((text: string) => {
    setGcpImportError(null);
    const lines = text.trim().split('\n');
    const imported: KnownGCP[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase().startsWith('name')) continue;
      const parts = trimmed.split(',').map(s => s.trim());
      if (parts.length >= 4) {
        const name = parts[0];
        const easting = parseFloat(parts[1]);
        const northing = parseFloat(parts[2]);
        const elevation = parseFloat(parts[3]);
        if (!isNaN(easting) && !isNaN(northing)) {
          imported.push({
            id: allocateGcpId(),
            name,
            easting: fmt(easting, 4),
            northing: fmt(northing, 4),
            elevation: isNaN(elevation) ? '' : fmt(elevation, 4),
          });
        }
      }
    }
    if (imported.length > 0) {
      setKnownGCPs(prev => [...prev, ...imported]);
      setValidationSummary(null);
    } else {
      setGcpImportError('No valid rows found. Expected Name,Easting,Northing,Elevation with projected coordinates in the same CRS as the residual data.');
    }
  }, []);

  const handleCSVFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseCSVText(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [parseCSVText]);

  const handleGeoJSONUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        setGcpImportError(null);
        const json = JSON.parse(evt.target?.result as string) as {
          type?: string;
          features?: Array<{
            geometry?: { type?: string; coordinates?: number[] };
            properties?: Record<string, unknown>;
          }>;
        };
        if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
          setGcpImportError('Expected a GeoJSON FeatureCollection. Geographic geometry coordinates are not accepted as projected survey coordinates.');
          return;
        }
        const features = json.features || [];
        const imported: KnownGCP[] = [];
        let skippedGeographic = false;
        for (const f of features) {
          if (f.geometry?.type !== 'Point') continue;
          const props = f.properties || {};
          const name = props.name || props.id || `GCP-${imported.length + 1}`;
          const parseCoordinate = (value: unknown) => {
            if (typeof value === 'number') return value;
            if (typeof value === 'string' && value.trim()) return Number(value);
            return Number.NaN;
          };
          const easting = parseCoordinate(props.easting);
          const northing = parseCoordinate(props.northing);
          const elevation = parseCoordinate(props.elevation);
          if (Number.isFinite(easting) && Number.isFinite(northing)) {
            imported.push({
              id: allocateGcpId(),
              name: String(name),
              easting: fmt(easting, 4),
              northing: fmt(northing, 4),
              elevation: Number.isFinite(elevation) ? fmt(elevation, 4) : '',
            });
          } else if (f.geometry.coordinates?.length) {
            skippedGeographic = true;
          }
        }
        if (imported.length > 0) {
          setKnownGCPs(prev => [...prev, ...imported]);
          setValidationSummary(null);
          if (skippedGeographic) setGcpImportError('Some points were skipped because they contained longitude/latitude only. Accepted points must include numeric easting and northing properties already in the same projected CRS as the residual data.');
        } else {
          setGcpImportError(skippedGeographic
            ? 'No projected GCPs imported. GeoJSON longitude/latitude coordinates are not transformed; provide numeric easting and northing properties in the same projected CRS as the residual data.'
            : 'No Point features with numeric easting and northing properties were found.');
        }
      } catch {
        setGcpImportError('Could not read valid GeoJSON. Check that the file contains a valid FeatureCollection.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  /* ── Residual Helpers ── */

  const handleParseResiduals = useCallback(() => {
    setValidationSummary(null);
    setParseError(null);
    setParsedResiduals([]);
    if (!residualText.trim()) {
      setParseError('No residual data to parse. Paste a residual table from Agisoft Metashape or Pix4D.');
      return;
    }
    try {
      const rows = parseResiduals(residualText, residualFormat);
      if (rows.length === 0) {
        setParseError('Could not parse any valid rows. Check the format and try again.');
        return;
      }
      const detected = residualFormat === 'auto' ? detectFormat(residualText) : residualFormat;
      setDetectedFormat(detected === 'auto' ? 'agisoft' : detected);
      setParsedResiduals(rows);
    } catch (err) {
      setParseError(`Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [residualText, residualFormat]);

  const handleResidualFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setResidualText(text);
      setValidationSummary(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const loadSampleResiduals = useCallback(() => {
    setResidualText(SAMPLE_AGISOFT);
    setResidualFormat('auto');
    setSampleResidualsLoaded(true);
    setValidationSummary(null);
  }, []);

  const clearResiduals = useCallback(() => {
    setResidualText('');
    setParsedResiduals([]);
    setDetectedFormat(null);
    setParseError(null);
    setSampleResidualsLoaded(false);
    setValidationSummary(null);
  }, []);

  /* ── Validation ── */

  const handleRunValidation = useCallback(() => {
    const validKnown = knownGCPs.filter(g =>
      g.name.trim() && !isNaN(parseFloat(g.easting)) && !isNaN(parseFloat(g.northing))
    );
    if (validKnown.length === 0) return;
    if (parsedResiduals.length === 0) return;
    const result = runValidation(validKnown, parsedResiduals, selectedClass, utmZone);
    setValidationSummary(result);
    setActiveTab('results');
  }, [knownGCPs, parsedResiduals, selectedClass, utmZone]);

  const clearAll = useCallback(() => {
    setKnownGCPs([]);
    setSampleGCPsLoaded(false);
    setGcpImportError(null);
    setResidualText('');
    setParsedResiduals([]);
    setDetectedFormat(null);
    setParseError(null);
    setValidationSummary(null);
    setSampleResidualsLoaded(false);
  }, []);

  const invalidateValidation = useCallback(() => setValidationSummary(null), []);

  /* ── Report ── */

  const generateReportText = useCallback((): string => {
    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const lines: string[] = [];
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('           GCP RESIDUAL VALIDATION REPORT');
    lines.push('           METARDU Survey Platform');
    if (sampleDataLoaded) lines.push('           EXAMPLE ONLY — NOT SURVEY EVIDENCE');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Date:                 ${now}`);
    lines.push(`UTM Zone:             ${utmZone}S`);
    lines.push(`Accuracy Standard:    ${selectedClass.name} (${selectedClass.scale})`);
    lines.push(`Horizontal Limit:     ≤ ${selectedClass.horizontal} m`);
    lines.push(`Vertical Limit:       ≤ ${selectedClass.vertical} m`);
    lines.push('Interpretation:       Numerical comparison only; no CRS, datum, geoid, unit, epoch, or standard verification.');
    lines.push('');

    if (!validationSummary) {
      lines.push('No validation has been run yet.');
      return lines.join('\n');
    }

    const s = validationSummary;
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('SUMMARY');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push(`Total GCPs in residual file:   ${s.totalGCPs}`);
    lines.push(`Matched against known GCPs:    ${s.matchedGCPs}`);
    if (s.unmatchedNames.length > 0) {
      lines.push(`Unmatched GCP names:           ${s.unmatchedNames.join(', ')}`);
    }
    lines.push('');
    lines.push(`Horizontal RMSE:               ${fmt(s.hRMSE)} m    ${s.hPass ? ' PASS' : '[x] FAIL'}`);
    lines.push(`Vertical RMSE:                 ${fmt(s.vRMSE)} m    ${s.vPass ? ' PASS' : '[x] FAIL'}`);
    lines.push(`Max Horizontal Error:          ${fmt(s.maxHorizontal)} m`);
    lines.push(`Max Vertical Error:            ${fmt(s.maxVertical)} m`);
    lines.push(`Max 3D Error:                  ${fmt(s.max3D)} m`);
    lines.push(`Pass Rate:                     ${s.matchedGCPs > 0 ? ((s.passCount / s.matchedGCPs) * 100).toFixed(1) : '0.0'}% (${s.passCount}/${s.matchedGCPs})`);
    lines.push('');
    lines.push(`OVERALL PRESET RESULT:          ${s.pass ? ' PASS' : '[x] FAIL'} (not an acceptance approval)`);
    lines.push('');

    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('PER-GCP DETAILS');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push(
      'Point'.padEnd(12) +
      'Known E'.padStart(15) +
      'Software E'.padStart(15) +
      'ΔE(m)'.padStart(12) +
      'Known N'.padStart(15) +
      'Software N'.padStart(15) +
      'ΔN(m)'.padStart(12) +
      'ΔZ(m)'.padStart(12) +
      'Horiz Err'.padStart(12) +
      '3D Err'.padStart(12) +
      'Status'.padStart(10)
    );
    lines.push('─'.repeat(140));

    for (const p of s.points) {
      lines.push(
        p.name.padEnd(12) +
        fmt(p.knownE).padStart(15) +
        fmt(p.softwareE).padStart(15) +
        fmt(p.deltaE).padStart(12) +
        fmt(p.knownN).padStart(15) +
        fmt(p.softwareN).padStart(15) +
        fmt(p.deltaN).padStart(12) +
        fmt(p.deltaZ).padStart(12) +
        fmt(p.horizontalError).padStart(12) +
        fmt(p.error3D).padStart(12) +
        (p.overallPass ? 'PASS'.padStart(10) : 'FAIL'.padStart(10))
      );
    }

    lines.push('');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('  End of Report');
    lines.push('════════════════════════════════════════════════════════════════');
    return lines.join('\n');
  }, [validationSummary, selectedClass, utmZone, sampleDataLoaded]);

  const handleCopyReport = useCallback(() => {
    const text = generateReportText();
    navigator.clipboard.writeText(text).catch(() => {
      /* fallback */
    });
  }, [generateReportText]);

  const handleExportCSV = useCallback(() => {
    if (!validationSummary) return;
    const header = 'Name,Known_E,Known_N,Known_Z,Software_E,Software_N,Software_Z,Delta_E,Delta_N,Delta_Z,Horizontal_Error,Error_3D,Status';
    const rows = validationSummary.points.map(p =>
      `${p.name},${fmt(p.knownE)},${fmt(p.knownN)},${fmt(p.knownZ)},${fmt(p.softwareE)},${fmt(p.softwareN)},${fmt(p.softwareZ)},${fmt(p.deltaE)},${fmt(p.deltaN)},${fmt(p.deltaZ)},${fmt(p.horizontalError)},${fmt(p.error3D)},${p.overallPass ? 'PASS' : 'FAIL'}`
    );
    const csv = [sampleDataLoaded ? '# EXAMPLE ONLY - NOT SURVEY EVIDENCE' : '', header, ...rows].filter(Boolean).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gcp_validation_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [validationSummary, sampleDataLoaded]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return {
    // state
    activeTab,
    setActiveTab,
    utmZone,
    setUtmZone,
    selectedClass,
    setSelectedClass,
    knownGCPs,
    sampleDataLoaded,
    setKnownGCPs,
    residualText,
    setResidualText,
    residualFormat,
    setResidualFormat,
    detectedFormat,
    setDetectedFormat,
    parsedResiduals,
    setParsedResiduals,
    parseError,
    gcpImportError,
    validationSummary,
    setValidationSummary,
    invalidateValidation,
    // refs
    fileInputRef,
    csvInputRef,
    // GCP handlers
    addGCP,
    removeGCP,
    updateGCP,
    clearGCPs,
    loadSampleGCPs,
    handleCSVFileUpload,
    handleGeoJSONUpload,
    // Residual handlers
    handleParseResiduals,
    handleResidualFileUpload,
    loadSampleResiduals,
    clearResiduals,
    // Validation handlers
    handleRunValidation,
    clearAll,
    // Report handlers
    generateReportText,
    handleCopyReport,
    handleExportCSV,
    handlePrint,
  };
}

export type UseGCPValidationReturn = ReturnType<typeof useGCPValidation>;
