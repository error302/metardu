'use client';

import { useState, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';

/* ══════════════════════════════════════════════════════════════════════
 *  TYPES
 * ══════════════════════════════════════════════════════════════════════ */

interface KnownGCP {
  id: number;
  name: string;
  easting: string;
  northing: string;
  elevation: string;
}

interface ResidualRow {
  id: number;
  name: string;
  softwareE: number;
  softwareN: number;
  softwareZ: number;
  errorX?: number;
  errorY?: number;
  errorZ?: number;
  errorXY?: number;
  errorTotal?: number;
  reprojectionError?: number;
  source: 'agisoft' | 'pix4d';
}

interface ValidationResult {
  name: string;
  knownE: number;
  knownN: number;
  knownZ: number;
  softwareE: number;
  softwareN: number;
  softwareZ: number;
  deltaE: number;
  deltaN: number;
  deltaZ: number;
  horizontalError: number;
  error3D: number;
  hPass: boolean;
  vPass: boolean;
  overallPass: boolean;
}

interface ValidationSummary {
  points: ValidationResult[];
  hRMSE: number;
  vRMSE: number;
  maxHorizontal: number;
  maxVertical: number;
  max3D: number;
  hPass: boolean;
  vPass: boolean;
  pass: boolean;
  passCount: number;
  failCount: number;
  totalGCPs: number;
  matchedGCPs: number;
  unmatchedNames: string[];
}

interface AccuracyClass {
  name: string;
  horizontal: number;
  vertical: number;
  scale: string;
}

type ResidualFormat = 'agisoft' | 'pix4d' | 'auto';
type TabId = 'gcp' | 'residuals' | 'results' | 'report';

/* ══════════════════════════════════════════════════════════════════════
 *  CONSTANTS
 * ══════════════════════════════════════════════════════════════════════ */

const accuracyClasses: AccuracyClass[] = [
  { name: 'Class I',   horizontal: 0.075, vertical: 0.15, scale: '1:500' },
  { name: 'Class II',  horizontal: 0.150, vertical: 0.30, scale: '1:1000' },
  { name: 'Class III', horizontal: 0.375, vertical: 0.75, scale: '1:2500' },
];

const SAMPLE_GCPS: KnownGCP[] = [
  { id: 1, name: 'GCP-01', easting: '484500.0000', northing: '9863100.0000', elevation: '120.5000' },
  { id: 2, name: 'GCP-02', easting: '484750.0000', northing: '9863250.0000', elevation: '118.2500' },
  { id: 3, name: 'GCP-03', easting: '485000.0000', northing: '9863400.0000', elevation: '115.8000' },
];

const SAMPLE_AGISOFT = `#point  x(m)    y(m)    z(m)    error(m)
GCP-01   484500.012  9863100.008  120.485  0.023
GCP-02   484750.018  9863249.995  118.235  0.031
GCP-03   485000.025  9863399.990  115.788  0.019`;

const SAMPLE_PIX4D = `GCP_Name,X_photo,Y_photo,Z_photo,X_GCP,Y_GCP,Z_GCP,ErrorX,ErrorY,ErrorZ,ErrorXY,ErrorTotal
GCP-01,1234.5,567.8,120.485,484500.000,9863100.000,120.500,0.012,0.008,0.015,0.014,0.023
GCP-02,2345.6,678.9,118.235,484750.000,9863250.000,118.250,0.018,0.005,0.015,0.019,0.031
GCP-03,3456.7,789.0,115.788,485000.000,9863400.000,115.800,0.025,0.010,0.012,0.027,0.034`;

/* ══════════════════════════════════════════════════════════════════════
 *  HELPERS
 * ══════════════════════════════════════════════════════════════════════ */

function fmt(n: number, d: number = 4): string {
  return n.toFixed(d);
}

function calculateRMSE(errors: number[]): number {
  if (errors.length === 0) return 0;
  const sumSquared = errors.reduce((sum, e) => sum + e * e, 0);
  return Math.sqrt(sumSquared / errors.length);
}

function detectFormat(text: string): ResidualFormat {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.includes('#point') || trimmed.includes('#metashape')) return 'agisoft';
  if (trimmed.includes('gcp_name') && trimmed.includes('errortotal')) return 'pix4d';
  // Fallback: if it has a lot of tab-separated fields, guess Agisoft; if comma, Pix4D
  const lines = trimmed.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  if (lines.length === 0) return 'auto';
  const firstDataLine = lines[0];
  const tabCount = (firstDataLine.match(/\t/g) || []).length;
  const commaCount = (firstDataLine.match(/,/g) || []).length;
  if (tabCount >= 3 && commaCount < 2) return 'agisoft';
  if (commaCount >= 5) return 'pix4d';
  return 'auto';
}

function parseAgisoft(text: string): ResidualRow[] {
  const rows: ResidualRow[] = [];
  const lines = text.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Agisoft format: name  x  y  z  error  (whitespace or tab separated)
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 5) {
      const name = parts[0];
      const softwareE = parseFloat(parts[1]);
      const softwareN = parseFloat(parts[2]);
      const softwareZ = parseFloat(parts[3]);
      const reprojError = parseFloat(parts[4]);
      if (!isNaN(softwareE) && !isNaN(softwareN) && !isNaN(softwareZ)) {
        rows.push({
          id: Date.now() + Math.random(),
          name,
          softwareE,
          softwareN,
          softwareZ,
          reprojectionError: isNaN(reprojError) ? undefined : reprojError,
          source: 'agisoft',
        });
      }
    }
  }
  return rows;
}

function parsePix4D(text: string): ResidualRow[] {
  const rows: ResidualRow[] = [];
  const lines = text.trim().split('\n');
  let headerParsed = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip header row
    if (!headerParsed) {
      headerParsed = true;
      if (trimmed.toLowerCase().startsWith('gcp_name')) continue;
    }
    const parts = trimmed.split(',').map(s => s.trim());
    // Minimum expected: GCP_Name, X_photo, Y_photo, Z_photo, X_GCP, Y_GCP, Z_GCP, ErrorX, ErrorY, ErrorZ, ErrorXY, ErrorTotal
    if (parts.length >= 11) {
      const name = parts[0];
      // Pix4D columns: software coords in X_GCP, Y_GCP, Z_GCP (indices 4,5,6)
      // OR in X_photo, Y_photo, Z_photo (indices 1,2,3) - we take the GCP columns
      const softwareE = parseFloat(parts[4]);
      const softwareN = parseFloat(parts[5]);
      const softwareZ = parseFloat(parts[6]);
      const errorX = parseFloat(parts[7]);
      const errorY = parseFloat(parts[8]);
      const errorZ = parseFloat(parts[9]);
      const errorXY = parseFloat(parts[10]);
      const errorTotal = parts.length >= 12 ? parseFloat(parts[11]) : undefined;
      if (!isNaN(softwareE) && !isNaN(softwareN) && !isNaN(softwareZ)) {
        rows.push({
          id: Date.now() + Math.random(),
          name,
          softwareE,
          softwareN,
          softwareZ,
          errorX: isNaN(errorX) ? undefined : errorX,
          errorY: isNaN(errorY) ? undefined : errorY,
          errorZ: isNaN(errorZ) ? undefined : errorZ,
          errorXY: isNaN(errorXY) ? undefined : errorXY,
          errorTotal: errorTotal !== undefined && !isNaN(errorTotal) ? errorTotal : undefined,
          source: 'pix4d',
        });
      }
    }
  }
  return rows;
}

function parseResiduals(text: string, format: ResidualFormat): ResidualRow[] {
  const detected = format === 'auto' ? detectFormat(text) : format;
  if (detected === 'pix4d') return parsePix4D(text);
  if (detected === 'agisoft') return parseAgisoft(text);
  // Try both
  const agisoft = parseAgisoft(text);
  const pix4d = parsePix4D(text);
  return agisoft.length >= pix4d.length ? agisoft : pix4d;
}

function runValidation(
  knownGCPs: KnownGCP[],
  residuals: ResidualRow[],
  accuracyClass: AccuracyClass,
  utmZone: number
): ValidationSummary | null {
  if (knownGCPs.length === 0 || residuals.length === 0) return null;

  const knownMap = new Map<string, KnownGCP>();
  for (const g of knownGCPs) {
    knownMap.set(g.name.trim(), g);
  }

  const results: ValidationResult[] = [];
  const unmatched: string[] = [];

  for (const r of residuals) {
    const known = knownMap.get(r.name.trim());
    if (!known) {
      unmatched.push(r.name);
      continue;
    }

    const knownE = parseFloat(known.easting);
    const knownN = parseFloat(known.northing);
    const knownZ = parseFloat(known.elevation);
    if (isNaN(knownE) || isNaN(knownN) || isNaN(knownZ)) continue;

    const deltaE = r.softwareE - knownE;
    const deltaN = r.softwareN - knownN;
    const deltaZ = r.softwareZ - knownZ;
    const horizontalError = Math.sqrt(deltaE * deltaE + deltaN * deltaN);
    const error3D = Math.sqrt(deltaE * deltaE + deltaN * deltaN + deltaZ * deltaZ);

    const hPass = horizontalError <= accuracyClass.horizontal;
    const vPass = Math.abs(deltaZ) <= accuracyClass.vertical;

    results.push({
      name: r.name,
      knownE, knownN, knownZ,
      softwareE: r.softwareE, softwareN: r.softwareN, softwareZ: r.softwareZ,
      deltaE, deltaN, deltaZ,
      horizontalError, error3D,
      hPass, vPass, overallPass: hPass && vPass,
    });
  }

  if (results.length === 0) return null;

  const hErrors = results.map(r => r.horizontalError);
  const vErrors = results.map(r => Math.abs(r.deltaZ));
  const errors3D = results.map(r => r.error3D);

  const hRMSE = calculateRMSE(hErrors);
  const vRMSE = calculateRMSE(vErrors);
  const maxHorizontal = Math.max(...hErrors);
  const maxVertical = Math.max(...vErrors);
  const max3D = Math.max(...errors3D);

  const passCount = results.filter(r => r.overallPass).length;
  const failCount = results.length - passCount;

  return {
    points: results,
    hRMSE, vRMSE, maxHorizontal, maxVertical, max3D,
    hPass: hRMSE <= accuracyClass.horizontal,
    vPass: vRMSE <= accuracyClass.vertical,
    pass: (hRMSE <= accuracyClass.horizontal) && (vRMSE <= accuracyClass.vertical),
    passCount, failCount,
    totalGCPs: residuals.length,
    matchedGCPs: results.length,
    unmatchedNames: unmatched,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  MAIN COMPONENT
 * ══════════════════════════════════════════════════════════════════════ */

export default function GCPValidationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('gcp');
  const [utmZone, setUtmZone] = useState<number>(36);
  const [selectedClass, setSelectedClass] = useState<AccuracyClass>(accuracyClasses[0]);

  // Tab 1: Known GCPs
  const [knownGCPs, setKnownGCPs] = useState<KnownGCP[]>(SAMPLE_GCPS);

  // Tab 2: Residuals
  const [residualText, setResidualText] = useState('');
  const [residualFormat, setResidualFormat] = useState<ResidualFormat>('auto');
  const [detectedFormat, setDetectedFormat] = useState<ResidualFormat | null>(null);
  const [parsedResiduals, setParsedResiduals] = useState<ResidualRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Tab 3: Validation
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);

  /* ── GCP Helpers ── */

  const addGCP = useCallback(() => {
    const last = knownGCPs[knownGCPs.length - 1];
    const num = last ? parseInt(last.name.replace(/\D/g, '') || '0') + 1 : 1;
    setKnownGCPs(prev => [...prev, {
      id: Date.now(),
      name: `GCP-${String(num).padStart(2, '0')}`,
      easting: '', northing: '', elevation: '',
    }]);
  }, [knownGCPs]);

  const removeGCP = useCallback((id: number) => {
    setKnownGCPs(prev => prev.filter(g => g.id !== id));
  }, []);

  const updateGCP = useCallback((id: number, field: keyof KnownGCP, value: string) => {
    setKnownGCPs(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  }, []);

  const clearGCPs = useCallback(() => {
    setKnownGCPs([]);
  }, []);

  const loadSampleGCPs = useCallback(() => {
    setKnownGCPs(SAMPLE_GCPS.map(g => ({ ...g, id: Date.now() + Math.random() })));
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
  }, []);

  const parseCSVText = useCallback((text: string) => {
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
            id: Date.now() + Math.random(),
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
    }
  }, []);

  const handleGeoJSONUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const features = json.features || [];
        const imported: KnownGCP[] = [];
        for (const f of features) {
          if (f.geometry?.type !== 'Point') continue;
          const coords = f.geometry.coordinates;
          const props = f.properties || {};
          const name = props.name || props.id || `GCP-${imported.length + 1}`;
          // GeoJSON is WGS84, but we just take the UTM props if available
          const easting = props.easting || (coords.length > 0 ? coords[0] : '');
          const northing = props.northing || (coords.length > 1 ? coords[1] : '');
          const elevation = props.elevation || (coords.length > 2 ? coords[2] : '');
          if (typeof easting === 'number' && typeof northing === 'number') {
            imported.push({
              id: Date.now() + Math.random(),
              name: String(name),
              easting: fmt(easting, 4),
              northing: fmt(northing, 4),
              elevation: typeof elevation === 'number' ? fmt(elevation, 4) : '',
            });
          }
        }
        if (imported.length > 0) {
          setKnownGCPs(prev => [...prev, ...imported]);
        }
      } catch {
        /* ignore invalid JSON */
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  /* ── Residual Helpers ── */

  const handleParseResiduals = useCallback(() => {
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
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const loadSampleResiduals = useCallback(() => {
    setResidualText(SAMPLE_AGISOFT);
    setResidualFormat('auto');
  }, []);

  const clearResiduals = useCallback(() => {
    setResidualText('');
    setParsedResiduals([]);
    setDetectedFormat(null);
    setParseError(null);
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
    setResidualText('');
    setParsedResiduals([]);
    setDetectedFormat(null);
    setParseError(null);
    setValidationSummary(null);
  }, []);

  /* ── Report ── */

  const generateReportText = useCallback((): string => {
    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    const lines: string[] = [];
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('           GCP RESIDUAL VALIDATION REPORT');
    lines.push('           METARDU Survey Platform');
    lines.push('════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Date:                 ${now}`);
    lines.push(`UTM Zone:             ${utmZone}S`);
    lines.push(`Accuracy Standard:    ${selectedClass.name} (${selectedClass.scale})`);
    lines.push(`Horizontal Limit:     ≤ ${selectedClass.horizontal} m`);
    lines.push(`Vertical Limit:       ≤ ${selectedClass.vertical} m`);
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
    lines.push(`Horizontal RMSE:               ${fmt(s.hRMSE)} m    ${s.hPass ? '✓ PASS' : '✗ FAIL'}`);
    lines.push(`Vertical RMSE:                 ${fmt(s.vRMSE)} m    ${s.vPass ? '✓ PASS' : '✗ FAIL'}`);
    lines.push(`Max Horizontal Error:          ${fmt(s.maxHorizontal)} m`);
    lines.push(`Max Vertical Error:            ${fmt(s.maxVertical)} m`);
    lines.push(`Max 3D Error:                  ${fmt(s.max3D)} m`);
    lines.push(`Pass Rate:                     ${s.matchedGCPs > 0 ? ((s.passCount / s.matchedGCPs) * 100).toFixed(1) : '0.0'}% (${s.passCount}/${s.matchedGCPs})`);
    lines.push('');
    lines.push(`OVERALL RESULT:                 ${s.pass ? '✓ PASS' : '✗ FAIL'}`);
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
  }, [validationSummary, selectedClass, utmZone]);

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
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gcp_validation_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [validationSummary]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  /* ══════════════════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════════════════ */

  const tabs: { id: TabId; label: string }[] = [
    { id: 'gcp', label: 'Known GCPs' },
    { id: 'residuals', label: 'Import Residuals' },
    { id: 'results', label: 'Validation Results' },
    { id: 'report', label: 'Report' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title="📍 GCP Residual Validation"
        subtitle="Compare photogrammetry software residuals against known GCP coordinates and validate against Kenya ISK accuracy standards"
        reference="ISK Survey Standards | Kenya Accuracy Classes I/II/III | Agisoft Metashape / Pix4D"
        badge="GCP VALIDATION"
      />

      {/* ── Global Settings ── */}
      <div className="card mb-6">
        <div className="card-header flex flex-wrap gap-4 items-center justify-between">
          <span className="label">Settings</span>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">UTM Zone</label>
              <select
                className="input w-24"
                value={utmZone}
                onChange={e => setUtmZone(parseInt(e.target.value))}
              >
                <option value={36}>36S</option>
                <option value={37}>37S</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1">Accuracy Class</label>
              <select
                className="input"
                value={selectedClass.name}
                onChange={e => {
                  const cls = accuracyClasses.find(c => c.name === e.target.value);
                  if (cls) {
                    setSelectedClass(cls);
                    setValidationSummary(null);
                  }
                }}
              >
                {accuracyClasses.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} — {c.scale} (H: ≤{c.horizontal}m, V: ≤{c.vertical}m)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={clearAll} className="btn btn-secondary text-sm">Clear All</button>
              <button
                onClick={() => {
                  loadSampleGCPs();
                  setResidualText(SAMPLE_AGISOFT);
                  setResidualFormat('auto');
                  setParsedResiduals([]);
                  setValidationSummary(null);
                }}
                className="btn btn-secondary text-sm"
              >
                Load Sample Data
              </button>
            </div>
          </div>
        </div>
        <div className="p-3 bg-[var(--bg-tertiary)] rounded text-sm">
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-[var(--text-secondary)]">Horizontal Limit: </span>
              <span className="font-mono text-[var(--accent)]">≤ {selectedClass.horizontal} m</span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Vertical Limit: </span>
              <span className="font-mono text-[var(--accent)]">≤ {selectedClass.vertical} m</span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Map Scale: </span>
              <span className="font-mono">{selectedClass.scale}</span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Known GCPs: </span>
              <span className="font-mono">{knownGCPs.length}</span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Parsed Residuals: </span>
              <span className="font-mono">{parsedResiduals.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
       *  TAB 1: KNOWN GCP COORDINATES
       * ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'gcp' && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header flex justify-between items-center flex-wrap gap-2">
              <span className="label">Known GCP Coordinates ({knownGCPs.length} points)</span>
              <div className="flex gap-2 flex-wrap">
                <button onClick={loadSampleGCPs} className="btn btn-secondary text-sm">Load Sample</button>
                <button onClick={clearGCPs} className="btn btn-secondary text-sm">Clear</button>
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="btn btn-secondary text-sm"
                >
                  Import CSV
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleCSVFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary text-sm"
                >
                  Import GeoJSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,.json"
                  className="hidden"
                  onChange={handleGeoJSONUpload}
                />
                <button onClick={addGCP} className="btn btn-primary text-sm">+ Add GCP</button>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Enter known ground-surveyed GCP coordinates. These will be compared against the photogrammetry
              software output residuals. Names must match between this table and the residual table.
            </p>

            {knownGCPs.length > 0 ? (
              <div className="overflow-x-auto max-h-[500px]">
                <table className="table">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="w-12">#</th>
                      <th>Name</th>
                      <th>Easting (m)</th>
                      <th>Northing (m)</th>
                      <th>Elevation (m)</th>
                      <th className="w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {knownGCPs.map((g, idx) => (
                      <tr key={g.id}>
                        <td className="text-[var(--text-muted)] text-sm">{idx + 1}</td>
                        <td>
                          <input
                            className="input w-28 font-mono"
                            value={g.name}
                            onChange={e => updateGCP(g.id, 'name', e.target.value)}
                            placeholder="GCP-01"
                          />
                        </td>
                        <td>
                          <input
                            className="input w-36 font-mono"
                            value={g.easting}
                            onChange={e => updateGCP(g.id, 'easting', e.target.value)}
                            placeholder="484500.0000"
                          />
                        </td>
                        <td>
                          <input
                            className="input w-36 font-mono"
                            value={g.northing}
                            onChange={e => updateGCP(g.id, 'northing', e.target.value)}
                            placeholder="9863100.0000"
                          />
                        </td>
                        <td>
                          <input
                            className="input w-32 font-mono"
                            value={g.elevation}
                            onChange={e => updateGCP(g.id, 'elevation', e.target.value)}
                            placeholder="120.5000"
                          />
                        </td>
                        <td>
                          <button
                            onClick={() => removeGCP(g.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <p className="text-lg mb-2">No known GCP coordinates entered</p>
                <p className="text-sm">Add GCPs manually, import from CSV/GeoJSON, or load sample data.</p>
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button onClick={addGCP} className="btn btn-secondary text-sm">+ Add Row</button>
            </div>

            {/* CSV format hint */}
            <div className="mt-4 p-3 bg-[var(--bg-tertiary)] rounded text-xs text-[var(--text-muted)]">
              <strong>CSV format:</strong> <code className="font-mono">Name,Easting,Northing,Elevation</code><br />
              <strong>GeoJSON:</strong> FeatureCollection with Point features having properties: name, easting, northing, elevation
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
       *  TAB 2: IMPORT RESIDUALS
       * ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'residuals' && (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header flex justify-between items-center flex-wrap gap-2">
              <span className="label">Import Residual Table</span>
              <div className="flex gap-2">
                <button onClick={loadSampleResiduals} className="btn btn-secondary text-sm">Load Sample</button>
                <button onClick={clearResiduals} className="btn btn-secondary text-sm">Clear</button>
                <label className="btn btn-secondary text-sm cursor-pointer">
                  Upload File
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    className="hidden"
                    onChange={handleResidualFileUpload}
                  />
                </label>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Paste the residual output table from Agisoft Metashape or Pix4D. The tool will auto-detect the format
              and match GCP names against your known coordinates.
            </p>

            {/* Format Selector */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="text-sm text-[var(--text-secondary)]">Format:</label>
              <select
                className="input w-48"
                value={residualFormat}
                onChange={e => setResidualFormat(e.target.value as ResidualFormat)}
              >
                <option value="auto">Auto-detect</option>
                <option value="agisoft">Agisoft Metashape</option>
                <option value="pix4d">Pix4D</option>
              </select>
              {detectedFormat && (
                <span className="text-xs px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                  Detected: {detectedFormat === 'agisoft' ? 'Agisoft Metashape' : 'Pix4D'}
                </span>
              )}
            </div>

            {/* Textarea */}
            <textarea
              className="input font-mono text-sm w-full"
              rows={10}
              placeholder={`Paste residual table here...\n\nAgisoft format example:\n#point  x(m)  y(m)  z(m)  error(m)\nGCP-01  484500.012  9863100.008  120.485  0.023\n\nPix4D format example:\nGCP_Name,...,X_GCP,Y_GCP,Z_GCP,ErrorX,ErrorY,ErrorZ,ErrorXY,ErrorTotal`}
              value={residualText}
              onChange={e => {
                setResidualText(e.target.value);
                setParsedResiduals([]);
                setDetectedFormat(null);
              }}
            />

            <div className="mt-3 flex gap-3">
              <button onClick={handleParseResiduals} className="btn btn-primary">
                Parse Residuals
              </button>
            </div>

            {parseError && (
              <div className="mt-4 p-4 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
                {parseError}
              </div>
            )}
          </div>

          {/* Format Reference */}
          <div className="card">
            <div className="card-header">
              <span className="label">Format Reference</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                <h4 className="font-semibold text-sm mb-2 text-[var(--accent)]">Agisoft Metashape</h4>
                <pre className="text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto">
{`#point  x(m)    y(m)    z(m)    error(m)
GCP-01  484500.012 9863100.008 120.485 0.023
GCP-02  484750.018 9863249.995 118.235 0.031`}
                </pre>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Whitespace/tab separated. Coordinates are the software-computed positions.
                  The &quot;error&quot; column is the reprojection error in pixels.
                  This tool compares software coords against your known GCPs.
                </p>
              </div>
              <div className="p-4 bg-[var(--bg-tertiary)] rounded">
                <h4 className="font-semibold text-sm mb-2 text-[var(--accent)]">Pix4D</h4>
                <pre className="text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap overflow-x-auto">
{`GCP_Name,X_photo,Y_photo,Z_photo,X_GCP,Y_GCP,Z_GCP,
  ErrorX,ErrorY,ErrorZ,ErrorXY,ErrorTotal
GCP-01,1234.5,567.8,120.485,484500,9863100,120.500,
  0.012,0.008,0.015,0.014,0.023`}
                </pre>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  CSV format. The X_GCP/Y_GCP/Z_GCP columns are the software-computed positions.
                  ErrorX/ErrorY/ErrorZ are per-axis residuals. ErrorTotal is the overall error.
                  This tool uses the coordinate columns for comparison.
                </p>
              </div>
            </div>
          </div>

          {/* Parsed Preview */}
          {parsedResiduals.length > 0 && (
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="label">Parsed Residuals ({parsedResiduals.length} rows)</span>
                {detectedFormat && (
                  <span className="text-xs px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)]">
                    {detectedFormat === 'agisoft' ? 'Agisoft Metashape' : 'Pix4D'} format
                  </span>
                )}
              </div>

              {/* Match Status */}
              <div className="mb-4 p-3 bg-[var(--bg-tertiary)] rounded text-sm">
                {(() => {
                  const knownNames = new Set(knownGCPs.map(g => g.name.trim()));
                  const matched = parsedResiduals.filter(r => knownNames.has(r.name.trim())).length;
                  const unmatched = parsedResiduals.filter(r => !knownNames.has(r.name.trim()));
                  return (
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <span className="text-[var(--text-secondary)]">Matched: </span>
                        <span className={`font-semibold ${matched === parsedResiduals.length ? 'text-green-400' : 'text-amber-400'}`}>
                          {matched}/{parsedResiduals.length}
                        </span>
                      </div>
                      {unmatched.length > 0 && (
                        <div>
                          <span className="text-[var(--text-secondary)]">Unmatched: </span>
                          <span className="text-red-400">{unmatched.map(r => r.name).join(', ')}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="overflow-x-auto max-h-[400px]">
                <table className="table">
                  <thead className="sticky top-0">
                    <tr>
                      <th>Name</th>
                      <th>Source</th>
                      <th>Software E (m)</th>
                      <th>Software N (m)</th>
                      <th>Software Z (m)</th>
                      {detectedFormat === 'pix4d' && (
                        <>
                          <th>ErrorX</th>
                          <th>ErrorY</th>
                          <th>ErrorZ</th>
                          <th>ErrorTotal</th>
                        </>
                      )}
                      {detectedFormat === 'agisoft' && (
                        <th>Reproj. Error</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedResiduals.map(r => {
                      const knownNames = new Set(knownGCPs.map(g => g.name.trim()));
                      const isMatched = knownNames.has(r.name.trim());
                      return (
                        <tr key={r.id} className={isMatched ? '' : 'opacity-50'}>
                          <td className="font-semibold">
                            {r.name}
                            {!isMatched && <span className="ml-2 text-xs text-red-400">⚠ no match</span>}
                          </td>
                          <td className="text-xs text-[var(--text-muted)]">{r.source === 'pix4d' ? 'Pix4D' : 'Agisoft'}</td>
                          <td className="font-mono">{fmt(r.softwareE)}</td>
                          <td className="font-mono">{fmt(r.softwareN)}</td>
                          <td className="font-mono">{fmt(r.softwareZ)}</td>
                          {detectedFormat === 'pix4d' && (
                            <>
                              <td className="font-mono">{r.errorX !== undefined ? fmt(r.errorX) : '—'}</td>
                              <td className="font-mono">{r.errorY !== undefined ? fmt(r.errorY) : '—'}</td>
                              <td className="font-mono">{r.errorZ !== undefined ? fmt(r.errorZ) : '—'}</td>
                              <td className="font-mono">{r.errorTotal !== undefined ? fmt(r.errorTotal) : '—'}</td>
                            </>
                          )}
                          {detectedFormat === 'agisoft' && (
                            <td className="font-mono">{r.reprojectionError !== undefined ? fmt(r.reprojectionError) : '—'}</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4">
                <button onClick={handleRunValidation} className="btn btn-primary py-3 px-8 text-base">
                  ▶ Run Validation
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
       *  TAB 3: VALIDATION RESULTS
       * ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {!validationSummary ? (
            <div className="card">
              <div className="text-center py-16 text-[var(--text-muted)]">
                <p className="text-lg mb-2">No validation results yet</p>
                <p className="text-sm mb-6">
                  Import known GCPs and residual data, then run the validation.
                </p>
                <button
                  onClick={() => {
                    if (knownGCPs.length === 0) setActiveTab('gcp');
                    else if (parsedResiduals.length === 0) setActiveTab('residuals');
                    else handleRunValidation();
                  }}
                  className="btn btn-primary"
                >
                  {knownGCPs.length === 0
                    ? 'Go to Known GCPs Tab'
                    : parsedResiduals.length === 0
                      ? 'Go to Import Residuals Tab'
                      : 'Run Validation Now'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Overall Banner */}
              <div className={`p-4 rounded text-center text-lg font-semibold ${
                validationSummary.pass
                  ? 'bg-green-900/30 border border-green-600 text-green-400'
                  : 'bg-red-900/30 border border-red-600 text-red-400'
              }`}>
                {validationSummary.pass ? '✓ OVERALL PASS' : '✗ OVERALL FAIL'} — {selectedClass.name} ({selectedClass.scale})
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
                  <span className="text-[var(--text-secondary)] text-sm block">Horizontal RMSE</span>
                  <div className={`font-mono text-xl ${validationSummary.hPass ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(validationSummary.hRMSE)} m
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Limit: ≤ {selectedClass.horizontal} m</div>
                </div>
                <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
                  <span className="text-[var(--text-secondary)] text-sm block">Vertical RMSE</span>
                  <div className={`font-mono text-xl ${validationSummary.vPass ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(validationSummary.vRMSE)} m
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">Limit: ≤ {selectedClass.vertical} m</div>
                </div>
                <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
                  <span className="text-[var(--text-secondary)] text-sm block">Max Error</span>
                  <div className="font-mono text-xl">{fmt(validationSummary.max3D)} m</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    H: {fmt(validationSummary.maxHorizontal)} | V: {fmt(validationSummary.maxVertical)}
                  </div>
                </div>
                <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg">
                  <span className="text-[var(--text-secondary)] text-sm block">Pass Rate</span>
                  <div className={`font-mono text-xl ${
                    validationSummary.passCount === validationSummary.matchedGCPs
                      ? 'text-green-400'
                      : validationSummary.passCount > 0
                        ? 'text-amber-400'
                        : 'text-red-400'
                  }`}>
                    {validationSummary.matchedGCPs > 0
                      ? ((validationSummary.passCount / validationSummary.matchedGCPs) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {validationSummary.passCount}/{validationSummary.matchedGCPs} GCPs
                  </div>
                </div>
              </div>

              {/* Unmatched warning */}
              {validationSummary.unmatchedNames.length > 0 && (
                <div className="p-4 bg-amber-900/30 border border-amber-600 rounded text-sm">
                  <span className="text-amber-400 font-semibold">⚠ Unmatched GCPs: </span>
                  <span className="text-[var(--text-secondary)]">
                    {validationSummary.unmatchedNames.join(', ')} — not found in known coordinates table.
                    Check that names match exactly (case-sensitive).
                  </span>
                </div>
              )}

              {/* Detailed Results Table */}
              <div className="card">
                <div className="card-header">
                  <span className="label">Per-GCP Validation Details</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th rowSpan={2}>GCP</th>
                        <th colSpan={3} className="text-center">Known Coordinates</th>
                        <th colSpan={3} className="text-center">Software Coordinates</th>
                        <th colSpan={3} className="text-center">Residual (Δ)</th>
                        <th colSpan={2} className="text-center">Error</th>
                        <th rowSpan={2}>Status</th>
                      </tr>
                      <tr>
                        <th>E (m)</th>
                        <th>N (m)</th>
                        <th>Z (m)</th>
                        <th>E (m)</th>
                        <th>N (m)</th>
                        <th>Z (m)</th>
                        <th>ΔE (m)</th>
                        <th>ΔN (m)</th>
                        <th>ΔZ (m)</th>
                        <th>Horiz (m)</th>
                        <th>3D (m)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationSummary.points.map((p, i) => (
                        <tr
                          key={i}
                          className={p.overallPass
                            ? 'border-l-2 border-l-green-600'
                            : 'border-l-2 border-l-red-600'}
                        >
                          <td className="font-semibold">{p.name}</td>
                          <td className="font-mono text-sm">{fmt(p.knownE)}</td>
                          <td className="font-mono text-sm">{fmt(p.knownN)}</td>
                          <td className="font-mono text-sm">{fmt(p.knownZ)}</td>
                          <td className="font-mono text-sm">{fmt(p.softwareE)}</td>
                          <td className="font-mono text-sm">{fmt(p.softwareN)}</td>
                          <td className="font-mono text-sm">{fmt(p.softwareZ)}</td>
                          <td className={`font-mono text-sm ${Math.abs(p.deltaE) > selectedClass.horizontal ? 'text-red-400' : 'text-green-400'}`}>
                            {fmt(p.deltaE)}
                          </td>
                          <td className={`font-mono text-sm ${Math.abs(p.deltaN) > selectedClass.horizontal ? 'text-red-400' : 'text-green-400'}`}>
                            {fmt(p.deltaN)}
                          </td>
                          <td className={`font-mono text-sm ${Math.abs(p.deltaZ) > selectedClass.vertical ? 'text-red-400' : 'text-green-400'}`}>
                            {fmt(p.deltaZ)}
                          </td>
                          <td className={`font-mono text-sm font-semibold ${p.horizontalError > selectedClass.horizontal ? 'text-red-400' : 'text-green-400'}`}>
                            {fmt(p.horizontalError)}
                          </td>
                          <td className="font-mono text-sm">{fmt(p.error3D)}</td>
                          <td>
                            {p.overallPass ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-900/50 text-green-400 border border-green-600">
                                ✓ PASS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-900/50 text-red-400 border border-red-600">
                                ✗ FAIL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button onClick={handleRunValidation} className="btn btn-primary">Re-run Validation</button>
                <button onClick={() => setActiveTab('report')} className="btn btn-secondary">View Report →</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
       *  TAB 4: REPORT
       * ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          {/* Report Preview */}
          <div className="card">
            <div className="card-header flex justify-between items-center flex-wrap gap-2">
              <span className="label">Validation Report</span>
              <div className="flex gap-2">
                <button onClick={handleCopyReport} className="btn btn-secondary text-sm">
                  Copy to Clipboard
                </button>
                <button onClick={handleExportCSV} className="btn btn-secondary text-sm" disabled={!validationSummary}>
                  Export CSV
                </button>
                <button onClick={handlePrint} className="btn btn-primary text-sm">
                  Print / PDF
                </button>
              </div>
            </div>

            <div className="print-area p-6 bg-[var(--bg-tertiary)] rounded border border-[var(--border-color)]">
              <pre className="font-mono text-sm whitespace-pre-wrap overflow-x-auto leading-relaxed text-[var(--text-secondary)]">
                {generateReportText()}
              </pre>
            </div>
          </div>

          {/* Print-only full table */}
          {validationSummary && (
            <div className="card print:block">
              <div className="card-header">
                <span className="label">Detailed Table (Print View)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="table print:table-auto print:text-xs">
                  <thead>
                    <tr>
                      <th>GCP</th>
                      <th>Known E</th>
                      <th>Software E</th>
                      <th>ΔE</th>
                      <th>Known N</th>
                      <th>Software N</th>
                      <th>ΔN</th>
                      <th>ΔZ</th>
                      <th>Horiz Error</th>
                      <th>3D Error</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationSummary.points.map((p, i) => (
                      <tr key={i}>
                        <td>{p.name}</td>
                        <td className="font-mono">{fmt(p.knownE)}</td>
                        <td className="font-mono">{fmt(p.softwareE)}</td>
                        <td className="font-mono">{fmt(p.deltaE)}</td>
                        <td className="font-mono">{fmt(p.knownN)}</td>
                        <td className="font-mono">{fmt(p.softwareN)}</td>
                        <td className="font-mono">{fmt(p.deltaN)}</td>
                        <td className="font-mono">{fmt(p.deltaZ)}</td>
                        <td className="font-mono">{fmt(p.horizontalError)}</td>
                        <td className="font-mono">{fmt(p.error3D)}</td>
                        <td className={p.overallPass ? 'text-green-400' : 'text-red-400'}>
                          {p.overallPass ? 'PASS' : 'FAIL'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Accuracy Class Reference */}
          <div className="card">
            <div className="card-header">
              <span className="label">Kenya ISK Accuracy Classes Reference</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Map Scale</th>
                    <th>Horizontal Limit (m)</th>
                    <th>Vertical Limit (m)</th>
                    <th>Typical Application</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className={selectedClass.name === 'Class I' ? 'bg-[var(--accent)]/10' : ''}>
                    <td className="font-semibold">Class I</td>
                    <td>1:500</td>
                    <td className="font-mono">≤ 0.075</td>
                    <td className="font-mono">≤ 0.150</td>
                    <td className="text-[var(--text-muted)] text-sm">Engineering surveys, as-built, high-precision topographic</td>
                  </tr>
                  <tr className={selectedClass.name === 'Class II' ? 'bg-[var(--accent)]/10' : ''}>
                    <td className="font-semibold">Class II</td>
                    <td>1:1000</td>
                    <td className="font-mono">≤ 0.150</td>
                    <td className="font-mono">≤ 0.300</td>
                    <td className="text-[var(--text-muted)] text-sm">General topographic, cadastral, planning surveys</td>
                  </tr>
                  <tr className={selectedClass.name === 'Class III' ? 'bg-[var(--accent)]/10' : ''}>
                    <td className="font-semibold">Class III</td>
                    <td>1:2500</td>
                    <td className="font-mono">≤ 0.375</td>
                    <td className="font-mono">≤ 0.750</td>
                    <td className="text-[var(--text-muted)] text-sm">Reconnaissance, route surveys, feasibility studies</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Styles ── */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area *,
          .print-area *::before,
          .print-area *::after {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 2cm;
            background: white !important;
            color: black !important;
          }
          .print-area pre {
            color: black !important;
          }
          .card-header,
          nav,
          button {
            display: none !important;
          }
          .print-area ~ * {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
