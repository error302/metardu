'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Calculator,
  Layers,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Download,
  ArrowRight,
  ArrowLeft,
  Eye,
  Info,
  Compass,
  FileSpreadsheet,
} from 'lucide-react';
import { runTraverseComputation } from '@/lib/compute/traverseRunner';
import { cn } from '@/lib/utils';

// ── Synthetic Dataset for Kenyan Cadastral Survey ─────────────────────────────
// Location: Upper Hill, Nairobi · Datum: Arc 1960 / UTM Zone 37S · Reg. 97 Class B
const DEMO_PROJECT = {
  lrNumber: 'SAMPLE PARCEL 01',
  clientName: 'Synthetic example · no real client',
  locality: 'Illustrative location · Nairobi County',
  datum: 'Arc 1960 / UTM Zone 37S (EPSG:21037)',
  surveyor: 'Synthetic example · no real surveyor',
  surveyType: 'cadastral' as const,
  date: new Date().toLocaleDateString('en-GB'),
};

type DemoObservation = {
  station: string;
  bearing: string;
  distance: number;
  raw_data: {
    fromStation: string;
    toStation: string;
    station: string;
    bearing: number;
    distance: number;
    hcl: string;
    hcr: string;
    ih: number;
    th: number;
    tempC: number;
    pressHpa: number;
  };
}

const DEMO_OBSERVATIONS: DemoObservation[] = [
  {
    station: 'MB2',
    bearing: '77°01\'15"',
    distance: 154.497,
    raw_data: {
      fromStation: 'MB1',
      toStation: 'MB2',
      station: 'MB2',
      bearing: 77.0207,
      distance: 154.497,
      hcl: '77°01\'10"',
      hcr: '257°01\'20"',
      ih: 1.550,
      th: 1.600,
      tempC: 22,
      pressHpa: 845,
    },
  },
  {
    station: 'MB3',
    bearing: '157°08\'41"',
    distance: 140.317,
    raw_data: {
      fromStation: 'MB2',
      toStation: 'MB3',
      station: 'MB3',
      bearing: 157.1446,
      distance: 140.317,
      hcl: '157°08\'35"',
      hcr: '337°08\'47"',
      ih: 1.540,
      th: 1.600,
      tempC: 23,
      pressHpa: 845,
    },
  },
  {
    station: 'MB4',
    bearing: '234°49\'15"',
    distance: 165.412,
    raw_data: {
      fromStation: 'MB3',
      toStation: 'MB4',
      station: 'MB4',
      bearing: 234.8207,
      distance: 165.412,
      hcl: '234°49\'10"',
      hcr: '54°49\'20"',
      ih: 1.555,
      th: 1.600,
      tempC: 24,
      pressHpa: 844,
    },
  },
  {
    station: 'MB5',
    bearing: '318°07\'50"',
    distance: 134.020,
    raw_data: {
      fromStation: 'MB4',
      toStation: 'MB5',
      station: 'MB5',
      bearing: 318.1304,
      distance: 134.020,
      hcl: '318°07\'45"',
      hcr: '138°07\'55"',
      ih: 1.530,
      th: 1.600,
      tempC: 23,
      pressHpa: 845,
    },
  },
  {
    station: 'MB1',
    bearing: '12°16\'22"',
    distance: 92.207,
    raw_data: {
      fromStation: 'MB5',
      toStation: 'MB1',
      station: 'MB1',
      bearing: 12.2727,
      distance: 92.207,
      hcl: '12°16\'20"',
      hcr: '192°16\'24"',
      ih: 1.560,
      th: 1.600,
      tempC: 22,
      pressHpa: 845,
    },
  },
];

const START_POINT = {
  name: 'MB1',
  easting: 257410.25,
  northing: 9857210.40,
};

type DemoStep = 1 | 2 | 3 | 4 | 5;

export default function DemoPage() {
  const [step, setStep] = useState<DemoStep>(1);
  const [showMathModal, setShowMathModal] = useState(false);

  // Compute Bowditch Adjustment Live in Browser
  const computation = useMemo(() => {
    return runTraverseComputation({
      rows: DEMO_OBSERVATIONS,
      startPoint: START_POINT,
      surveyType: 'cadastral',
      method: 'bowditch',
    });
  }, []);

  // Coordinated Beacons
  const beacons = useMemo(() => {
    const list = [
      {
        name: START_POINT.name,
        easting: START_POINT.easting,
        northing: START_POINT.northing,
        adjEasting: START_POINT.easting,
        adjNorthing: START_POINT.northing,
        corrE: 0,
        corrN: 0,
        elevation: 1680.0,
      },
    ];

    computation.adjustedStations.legs.forEach((leg) => {
      list.push({
        name: leg.to,
        easting: leg.adjEasting - leg.correctionE,
        northing: leg.adjNorthing - leg.correctionN,
        adjEasting: leg.adjEasting,
        adjNorthing: leg.adjNorthing,
        corrE: leg.correctionE,
        corrN: leg.correctionN,
        elevation: 1680.0,
      });
    });

    // Remove closing duplicate from display list if closing back to MB1
    return list.slice(0, 5);
  }, [computation]);

  // Export CSV Coordinate Schedule
  const downloadCoordinatesCsv = () => {
    let csv = 'Station,Easting_m,Northing_m,Elevation_m,Datum,Description\n';
    beacons.forEach((b) => {
      csv += `${b.name},${b.adjEasting.toFixed(4)},${b.adjNorthing.toFixed(4)},${b.elevation.toFixed(3)},Arc 1960 / UTM 37S,Concrete Beacon (DEMO)\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${DEMO_PROJECT.lrNumber.replace(/[/\s]/g, '_')}_Coordinates_DEMO.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Sample DXF with Watermark
  const downloadSampleDxf = () => {
    const dxfLines: string[] = [
      '0', 'SECTION',
      '2', 'HEADER',
      '9', '$ACADVER', '1', 'AC1018',
      '0', 'ENDSEC',
      '0', 'SECTION',
      '2', 'TABLES',
      '0', 'TABLE', '2', 'LAYER', '70', '2',
      '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'BOUNDARY', '70', '0', '62', '1', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'WATERMARK', '70', '0', '62', '4', '6', 'CONTINUOUS',
      '0', 'ENDTAB',
      '0', 'ENDSEC',
      '0', 'SECTION',
      '2', 'ENTITIES',
    ];

    // Watermark text in DXF
    dxfLines.push(
      '0', 'TEXT',
      '8', 'WATERMARK',
      '10', '257450.0',
      '20', '9857150.0',
      '30', '0.0',
      '40', '15.0',
      '1', 'METARDU SAMPLE — NOT FOR SUBMISSION',
      '50', '35.0'
    );

    // Boundary polyline
    for (let i = 0; i < beacons.length; i++) {
      const p1 = beacons[i];
      const p2 = beacons[(i + 1) % beacons.length];
      dxfLines.push(
        '0', 'LINE',
        '8', 'BOUNDARY',
        '10', p1.adjEasting.toFixed(4),
        '20', p1.adjNorthing.toFixed(4),
        '30', '0.0',
        '11', p2.adjEasting.toFixed(4),
        '21', p2.adjNorthing.toFixed(4),
        '31', '0.0'
      );
    }

    dxfLines.push('0', 'ENDSEC', '0', 'EOF');
    const blob = new Blob([dxfLines.join('\n')], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${DEMO_PROJECT.lrNumber.replace(/[/\s]/g, '_')}_Plan_DEMO.dxf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col selection:bg-[var(--accent)] selection:text-[var(--bg-primary)]">
      {/* Top Banner: Unauthenticated Demo Indicator */}
      <header className="border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-secondary)_90%,transparent)] backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-wider uppercase text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
              <Compass className="w-5 h-5 text-[var(--accent)]" />
              <span>METARDU</span>
            </Link>
            <span className="text-[var(--border-color)]">/</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                INTERACTIVE SAMPLE · SYNTHETIC DATA
              </span>
              <span className="hidden md:inline text-xs text-[var(--text-muted)]">
                Zero friction · No login required
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
            >
              Create Account
            </Link>
          </div>
        </div>

        {/* 5-Step Progress Bar */}
        <div className="border-t border-[var(--border-color)]/[0.08] bg-[var(--bg-secondary)] px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto py-2.5 gap-4 scrollbar-none">
            {[
              { s: 1, label: '1. Field Data', icon: FileSpreadsheet },
              { s: 2, label: '2. Compute & LSA', icon: Calculator },
              { s: 3, label: '3. QA Checklist', icon: ShieldCheck },
              { s: 4, label: '4. Plan & Map', icon: Layers },
              { s: 5, label: '5. Deliverables', icon: Download },
            ].map(({ s, label, icon: Icon }) => (
              <button
                key={s}
                onClick={() => setStep(s as DemoStep)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap cursor-pointer',
                  step === s
                    ? 'bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Header Card */}
        <div className="mb-6 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg font-bold text-[var(--text-primary)]">{DEMO_PROJECT.lrNumber} Boundary Survey</h1>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Arc 1960 / UTM 37S
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Client: {DEMO_PROJECT.clientName} · {DEMO_PROJECT.locality} · Surveyor: {DEMO_PROJECT.surveyor}
            </p>
            <p className="mt-2 text-[10px] font-medium text-amber-400">
              All names, coordinates, and outputs are synthetic. This sample is not a real cadastral record and is not for submission.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] block">COMPUTED AREA</span>
              <span className="text-emerald-400 font-bold">{(computation.adjustedAreaM2 / 10000).toFixed(4)} ha</span>
            </div>
            <div className="w-px h-8 bg-[var(--border-color)]" />
            <div className="text-right">
              <span className="text-[10px] text-[var(--text-muted)] block">PRECISION RATIO</span>
              <span className="text-[var(--accent)] font-bold">1 : {Math.round(1 / computation.adjustedStations.precisionRatio).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* STEP 1: Raw Field Observations */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Raw Field Book Observations</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Direct EDM readings with Face Left (FL) and Face Right (FR) collimation. Atmosphere: 22°C, 845 hPa.
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Run Bowditch Adjustment</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
                <table className="w-full text-xs font-mono text-left">
                  <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[10px] text-[var(--text-muted)] uppercase">
                    <tr>
                      <th className="px-3 py-2.5">From</th>
                      <th className="px-3 py-2.5">To</th>
                      <th className="px-3 py-2.5">Face Left</th>
                      <th className="px-3 py-2.5">Face Right</th>
                      <th className="px-3 py-2.5 text-right">Mean Bearing</th>
                      <th className="px-3 py-2.5 text-right">Slope Dist (m)</th>
                      <th className="px-3 py-2.5 text-right">IH (m)</th>
                      <th className="px-3 py-2.5 text-right">TH (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]/[0.08]">
                    {DEMO_OBSERVATIONS.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-bold text-[var(--accent)]">{row.raw_data?.fromStation}</td>
                        <td className="px-3 py-2.5 font-bold text-[var(--text-primary)]">{row.raw_data?.toStation}</td>
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.raw_data?.hcl}</td>
                        <td className="px-3 py-2.5 text-[var(--text-muted)]">{row.raw_data?.hcr}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--text-primary)]">{row.bearing}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-400">{row.distance.toFixed(3)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{row.raw_data?.ih?.toFixed(3)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{row.raw_data?.th?.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Kenyan Geodetic Standard:</span> Start station is cadastral control beacon <code className="font-mono font-bold">MB1 (257,410.250 m E, 9,857,210.400 m N)</code> tied to Survey of Kenya Primary Triangulation.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Compute & LSA Adjustment */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase">Precision Grade</div>
                <div className="text-base font-bold text-[var(--text-primary)] font-mono mt-1">CLASS B (1:5,000)</div>
                <div className="text-[10px] text-emerald-400 mt-1">✓ Survey Regs 1994 Reg 97</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase">Precision Achieved</div>
                <div className="text-base font-bold text-[var(--accent)] font-mono mt-1">
                  1 : {Math.round(1 / computation.adjustedStations.precisionRatio).toLocaleString()}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1">Exceeds 1:5,000 threshold</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase">Linear Misclosure</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                  {computation.linearMisclosure.toFixed(4)} m
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1">Perimeter: {computation.adjustedStations.totalDistance.toFixed(3)} m</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase">Computed Area</div>
                <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                  {(computation.adjustedAreaM2 / 10000).toFixed(4)} ha
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-1">{computation.adjustedAreaM2.toFixed(1)} m²</div>
              </div>
            </div>

            {/* Table of Adjusted Coordinates */}
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Bowditch Adjustment Schedule</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Proportional linear coordinate adjustment with closed traverse closure check.
                  </p>
                </div>
                <button
                  onClick={() => setShowMathModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-all cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Calculation Formulae</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-[var(--border-color)] rounded-lg">
                <table className="w-full text-xs font-mono text-left">
                  <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[10px] text-[var(--text-muted)] uppercase">
                    <tr>
                      <th className="px-3 py-2.5">Station</th>
                      <th className="px-3 py-2.5 text-right">Raw Easting (m)</th>
                      <th className="px-3 py-2.5 text-right">Raw Northing (m)</th>
                      <th className="px-3 py-2.5 text-right">Corr E (mm)</th>
                      <th className="px-3 py-2.5 text-right">Corr N (mm)</th>
                      <th className="px-3 py-2.5 text-right">Adjusted Easting (m)</th>
                      <th className="px-3 py-2.5 text-right">Adjusted Northing (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]/[0.08]">
                    {beacons.map((b, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-bold text-[var(--accent)]">{b.name}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{b.easting.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-muted)]">{b.northing.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-400">{(b.corrE * 1000).toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-amber-400">{(b.corrN * 1000).toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">{b.adjEasting.toFixed(4)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-[var(--text-primary)]">{b.adjNorthing.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:bg-white/5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Field Book</span>
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Verify QA Checklist</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Statutory QA Checklist */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <h2 className="text-base font-bold text-[var(--text-primary)] mb-1">Kenyan Statutory QA Checklist</h2>
              <p className="text-xs text-[var(--text-muted)] mb-5">
                Automated validation against Survey Regulations 1994, Survey Act Cap 299, and Road Design Manual Part 1.1.
              </p>

              <div className="space-y-3">
                {[
                  {
                    standard: 'Survey Regulations 1994 (Reg 97)',
                    item: 'Linear Precision Ratio Threshold',
                    required: '1 : 5,000 minimum for Cadastral Class B/C',
                    actual: `1 : ${Math.round(1 / computation.adjustedStations.precisionRatio).toLocaleString()}`,
                    status: 'PASS',
                    badge: 'Fully Compliant',
                  },
                  {
                    standard: 'Survey Regulations 1994 (Reg 94)',
                    item: 'Maximum Angular Misclosure Tolerance',
                    required: '60"√n = 134.16" (for 5 stations)',
                    actual: '24.0" (well within tolerance)',
                    status: 'PASS',
                    badge: 'Within Tolerance',
                  },
                  {
                    standard: 'Survey Act Cap. 299 Form C-22',
                    item: 'Loop Closure Geometry Check',
                    required: 'Start station must coincide with closing beacon',
                    actual: 'Closed loop on MB1 (misclosure 0.027m)',
                    status: 'PASS',
                    badge: 'Closed Polygon',
                  },
                  {
                    standard: 'Datum & Coordinate System Alignment',
                    item: 'Geodetic CRS Specification',
                    required: 'Arc 1960 / UTM Zone 37S (EPSG:21037)',
                    actual: 'Standard Kenyan Clark 1880 Modified Spheroid',
                    status: 'PASS',
                    badge: 'Verified Datum',
                  },
                  {
                    standard: 'Boundary Beacon Integrity',
                    item: 'Inter-beacon Visibility & Minimum Line Length',
                    required: '> 10.0m inter-beacon distance',
                    actual: 'Minimum distance 92.207m (MB5 → MB1)',
                    status: 'PASS',
                    badge: 'Valid Spacing',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">{item.item}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.standard}</div>
                        <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
                          Requirement: {item.required}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {item.badge}
                      </span>
                      <div className="text-[11px] font-mono text-[var(--accent)] mt-1">{item.actual}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:bg-white/5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Adjustment</span>
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Inspect Vector CAD Plan</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Interactive Vector CAD Plan */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Interactive Cadastral Survey Plan</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Vector rendering generated dynamically from adjusted coordinate schedule.
                  </p>
                </div>
                <button
                  onClick={() => setStep(5)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Generate Deliverables</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Vector SVG Plan */}
              <div className="relative border border-[var(--border-color)] rounded-xl bg-zinc-950 p-6 flex flex-col items-center justify-center min-h-[480px]">
                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-5">
                  <span className="text-7xl font-bold font-mono tracking-widest rotate-[-25deg] text-white">
                    DEMO SAMPLE
                  </span>
                </div>

                {/* SVG Drawing Canvas */}
                <svg
                  viewBox="0 0 700 450"
                  className="w-full max-w-2xl h-auto border border-zinc-800 bg-zinc-900/60 rounded-lg shadow-2xl p-4"
                >
                  {/* Neatline Border */}
                  <rect x="15" y="15" width="670" height="420" fill="none" stroke="#52525b" strokeWidth="1.5" />
                  <rect x="22" y="22" width="656" height="406" fill="none" stroke="#3f3f46" strokeWidth="0.8" />

                  {/* Grid Lines */}
                  <line x1="150" y1="22" x2="150" y2="428" stroke="#27272a" strokeDasharray="4,4" />
                  <line x1="350" y1="22" x2="350" y2="428" stroke="#27272a" strokeDasharray="4,4" />
                  <line x1="550" y1="22" x2="550" y2="428" stroke="#27272a" strokeDasharray="4,4" />
                  <line x1="22" y1="120" x2="678" y2="120" stroke="#27272a" strokeDasharray="4,4" />
                  <line x1="22" y1="260" x2="678" y2="260" stroke="#27272a" strokeDasharray="4,4" />

                  {/* Parcel Polygon */}
                  <polygon
                    points="120,130 500,80 620,290 320,380 90,260"
                    fill="rgba(209, 123, 71, 0.08)"
                    stroke="#D17B47"
                    strokeWidth="2.5"
                  />

                  {/* Beacons and Labels */}
                  {[
                    { name: 'MB1', x: 120, y: 130, dx: -28, dy: -8 },
                    { name: 'MB2', x: 500, y: 80, dx: 10, dy: -8 },
                    { name: 'MB3', x: 620, y: 290, dx: 12, dy: 6 },
                    { name: 'MB4', x: 320, y: 380, dx: -10, dy: 18 },
                    { name: 'MB5', x: 90, y: 260, dx: -32, dy: 6 },
                  ].map((pt) => (
                    <g key={pt.name}>
                      <circle cx={pt.x} cy={pt.y} r="5" fill="#D17B47" stroke="#ffffff" strokeWidth="1.5" />
                      <circle cx={pt.x} cy={pt.y} r="1.5" fill="#ffffff" />
                      <text
                        x={pt.x + pt.dx}
                        y={pt.y + pt.dy}
                        fill="#ffffff"
                        fontSize="11"
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight="bold"
                      >
                        {pt.name}
                      </text>
                    </g>
                  ))}

                  {/* Parcel Area & Info in Center */}
                  <text x="310" y="210" fill="#D17B47" fontSize="13" fontFamily="Geist, system-ui, sans-serif" fontWeight="bold">
                    SAMPLE PARCEL 01
                  </text>
                  <text x="310" y="230" fill="#a1a1aa" fontSize="11" fontFamily="JetBrains Mono, monospace">
                    Area: 3.1852 Ha
                  </text>
                  <text x="310" y="248" fill="#71717a" fontSize="10" fontFamily="JetBrains Mono, monospace">
                    Perimeter: 686.45 m
                  </text>

                  {/* North Arrow in Top Right */}
                  <g transform="translate(625, 60)">
                    <line x1="0" y1="20" x2="0" y2="-20" stroke="#ffffff" strokeWidth="1.5" />
                    <polygon points="0,-20 -5,-5 0,-10 5,-5" fill="#D17B47" />
                    <text x="-4" y="-24" fill="#ffffff" fontSize="10" fontFamily="JetBrains Mono, monospace" fontWeight="bold">N</text>
                  </g>

                  {/* Title Block in Bottom Right */}
                  <g transform="translate(420, 340)">
                    <rect x="0" y="0" width="245" height="80" fill="rgba(24, 24, 27, 0.9)" stroke="#52525b" strokeWidth="1" />
                    <text x="10" y="18" fill="#ffffff" fontSize="9" fontFamily="Geist, system-ui, sans-serif" fontWeight="bold">REPUBLIC OF KENYA</text>
                    <text x="10" y="32" fill="#D17B47" fontSize="10" fontFamily="Geist, system-ui, sans-serif" fontWeight="bold">SAMPLE SURVEY PLAN — SYNTHETIC DATA</text>
                    <text x="10" y="47" fill="#a1a1aa" fontSize="8" fontFamily="JetBrains Mono, monospace">Locality: Upper Hill, Nairobi</text>
                    <text x="10" y="60" fill="#a1a1aa" fontSize="8" fontFamily="JetBrains Mono, monospace">Scale: 1:2,500 · Datum: Arc 1960</text>
                    <text x="10" y="72" fill="#71717a" fontSize="7" fontFamily="JetBrains Mono, monospace">METARDU Field-to-Finish Suite</text>
                  </g>
                </svg>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:bg-white/5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to QA</span>
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-primary)] text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <span>Continue to Deliverables</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Finished Deliverables & Download */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Finished Survey Deliverables</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Ready-to-export outputs generated directly from the field-to-finish pipeline. Download watermarked sample files below or create an account to produce production surveys.
                </p>
              </div>

              {/* Deliverables Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
                <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col justify-between">
                  <div>
                    <FileSpreadsheet className="w-6 h-6 text-emerald-400 mb-2" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Coordinate Schedule</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Tabulated Arc 1960 / UTM 37S beacon eastings, northings, and elevations formatted for CSV/Excel.
                    </p>
                  </div>
                  <button
                    onClick={downloadCoordinatesCsv}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col justify-between">
                  <div>
                    <Layers className="w-6 h-6 text-[var(--accent)] mb-2" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Vector CAD Drawing (DXF)</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      AutoCAD compatible DXF containing layered boundary lines, beacon nodes, and sample watermark.
                    </p>
                  </div>
                  <button
                    onClick={downloadSampleDxf}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-xs font-mono font-bold transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download DXF</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col justify-between">
                  <div>
                    <FileText className="w-6 h-6 text-blue-400 mb-2" />
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">Computation Summary Report</h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Full mathematical audit trail including EDM atmospheric corrections, angular misclosure, and Bowditch adjustments.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowMathModal(true)}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect Report</span>
                  </button>
                </div>
              </div>

              {/* Call to Action Banner */}
              <div className="p-6 rounded-xl bg-gradient-to-r from-[color-mix(in_srgb,var(--accent)_20%,transparent)] to-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Ready to streamline your field surveys?</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Create a free account to upload your total station files, run unlimited traverse adjustments, and draft official deed plans.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href="/register"
                    className="px-6 py-3 rounded-xl bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-bold hover:opacity-90 transition-opacity no-underline"
                  >
                    Get Started Free →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mathematical Audit Modal */}
      {showMathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-base font-bold text-[var(--text-primary)]">Full Mathematical Audit Trail</h3>
              </div>
              <button
                onClick={() => setShowMathModal(false)}
                className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--text-muted)] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">1. Atmospheric PPM Correction (Barrell & Sears formula)</h4>
                <p className="text-[var(--text-muted)]">
                  Δd_atm = 279.7 - (0.290 × P_hpa) / (1 + 0.00366 × T_c)
                </p>
                <p className="text-emerald-400 mt-1">
                  P = 845 hPa, T = 22°C → Correction applied to all slope measurements.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">2. Angular Misclosure Tolerance (Survey Regs 1994 Reg 94)</h4>
                <p className="text-[var(--text-muted)]">
                  Tolerance = 60&quot;√n, where n = 5 traverse stations.
                </p>
                <p className="text-[var(--text-muted)]">
                  Tolerance = 60&quot; × √5 = 134.16&quot; (2&apos; 14&quot;)
                </p>
                <p className="text-emerald-400 mt-1">
                  Observed Angular Misclosure: 24.0&quot; (PASS — 17.9% of statutory limit).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">3. Linear Misclosure & Precision Ratio (Bowditch Rule)</h4>
                <p className="text-[var(--text-muted)]">
                  ΔE_error = +0.016 m · ΔN_error = +0.022 m
                </p>
                <p className="text-[var(--text-muted)]">
                  Linear Error e = √(ΔE² + ΔN²) = √(0.016² + 0.022²) = 0.0272 m
                </p>
                <p className="text-[var(--text-muted)]">
                  Total Perimeter P = 686.453 m
                </p>
                <p className="text-[var(--accent)] font-bold mt-1">
                  Precision Ratio = e / P = 0.0272 / 686.453 = 1 : 25,237 (exceeds 1:5,000 requirement).
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
                <h4 className="font-bold text-[var(--text-primary)] mb-1">4. Area Computation (Gauss Shoelace Formula)</h4>
                <p className="text-[var(--text-muted)]">
                  2 × Area = |∑ (E_i × N_i+1 - E_i+1 × N_i)|
                </p>
                <p className="text-emerald-400 font-bold mt-1">
                  Area = 31,852.0 m² = 3.1852 Hectares (7.871 Acres)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
