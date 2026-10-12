import { FieldBookRow } from '@/types/fieldbook';
import { SurveyType } from '@/types/project';

export interface FieldBookWarning {
  rowIndex?: number;
  column?: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface AutoCalculateResult {
  rows: FieldBookRow[];
  warnings: FieldBookWarning[];
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

function calculateEngineeringRL(
  rows: FieldBookRow[],
  _changedRowIndex: number
): FieldBookRow[] {
  const updated = [...rows];
  let hpc: number | null = null;
  let currentRL: number | null = null;

  for (let i = 0; i < updated.length; i++) {
    const row = { ...updated[i] };
    const bs = parseNumber(row.bs);
    const is = parseNumber(row.is);
    const fs = parseNumber(row.fs);

    // 1. If this row has FS or IS, compute RL from current setup HPC
    if (fs !== null && hpc !== null) {
      currentRL = hpc - fs;
      row.rl = currentRL;
    } else if (is !== null && hpc !== null) {
      currentRL = hpc - is;
      row.rl = currentRL;
    }

    // 2. If this row has BS, establish new HPC
    if (bs !== null) {
      const explicitRL = parseNumber(row.rl);
      const prevRL = i > 0 ? parseNumber(updated[i - 1].rl) : null;
      const benchmarkRL: number | null = explicitRL ?? currentRL ?? prevRL;

      if (benchmarkRL !== null) {
        hpc = benchmarkRL + bs;
        row.hpc = hpc;
        currentRL = benchmarkRL;
        if (row.rl === '' || row.rl === null || row.rl === undefined) {
          row.rl = benchmarkRL;
        }
      } else {
        row.hpc = undefined;
      }
    }

    updated[i] = row;
  }

  return updated;
}

function calculateTopographicRL(
  rows: FieldBookRow[],
  _changedRowIndex: number
): FieldBookRow[] {
  const updated = [...rows];
  let activeInstRL: number | null = null;
  let activeInstHeight = 0;

  for (let i = 0; i < updated.length; i++) {
    const row = { ...updated[i] };
    const hd = parseNumber(row.hd);
    const rawVA = parseNumber(row.va);
    const explicitInstRL = parseNumber(row.inst_rl ?? row.instrument_rl);
    const explicitIH = parseNumber(row.instrument_height ?? row.ih) ?? 0;
    const targetHeight = parseNumber(row.target_height ?? row.th) ?? 0;

    if (explicitInstRL !== null) {
      activeInstRL = explicitInstRL;
      activeInstHeight = explicitIH;
    } else if (i === 0 && parseNumber(row.rl) !== null && !row.computed_rl) {
      activeInstRL = parseNumber(row.rl);
      activeInstHeight = explicitIH;
      row.inst_rl = activeInstRL;
    }

    const instRL = activeInstRL ?? parseNumber(row.inst_rl) ?? (row.computed_rl ? null : parseNumber(row.rl));

    if (hd !== null && rawVA !== null && instRL !== null && Number.isFinite(hd) && Number.isFinite(rawVA) && Number.isFinite(instRL)) {
      // Check for zenith angle (0° = zenith, 90° = horizontal, 180° = nadir)
      // If rawVA is between 45° and 135°, treat as zenith angle. Otherwise treat as angle from horizontal.
      const vFromHoriz = Math.abs(rawVA) <= 45 ? rawVA : (90 - rawVA);

      if (Math.abs(vFromHoriz) >= 89.999999) {
        // Purely vertical sight — do not emit Infinity or NaN
      } else {
        const vRad = (vFromHoriz * Math.PI) / 180;
        const vertDiff = hd * Math.tan(vRad);

        if (Math.abs(vertDiff) > 1e-9 || activeInstHeight !== 0 || targetHeight !== 0) {
          const computedRL = instRL + activeInstHeight + vertDiff - targetHeight;
          if (Number.isFinite(computedRL)) {
            row.inst_rl = instRL;
            row.computed_rl = true;
            row.rl = computedRL;
          }
        }
      }
    }

    updated[i] = row;
  }

  return updated;
}

export function applyAutoCalculations(
  surveyType: SurveyType,
  rows: FieldBookRow[],
  changedRowIndex: number
): FieldBookRow[] {
  switch (surveyType) {
    case 'engineering':
      return calculateEngineeringRL(rows, changedRowIndex);
    case 'topographic':
      return calculateTopographicRL(rows, changedRowIndex);
    default:
      return rows;
  }
}

export function validateFieldBook(
  surveyType: SurveyType,
  rows: FieldBookRow[]
): FieldBookWarning[] {
  const warnings: FieldBookWarning[] = [];

  switch (surveyType) {
    case 'cadastral': {
      rows.forEach((row, idx) => {
        const distance = parseNumber(row.distance);
        const bearing = parseNumber(row.bearing);
        if (distance !== null && distance <= 0) {
          warnings.push({ rowIndex: idx, column: 'distance', message: 'Distance must be > 0', severity: 'error' });
        }
        if (bearing !== null && (bearing < 0 || bearing > 360)) {
          warnings.push({ rowIndex: idx, column: 'bearing', message: 'Bearing must be 0-360°', severity: 'error' });
        }
      });
      break;
    }

    case 'engineering': {
      rows.forEach((row, idx) => {
        const bs = parseNumber(row.bs);
        const is = parseNumber(row.is);
        const fs = parseNumber(row.fs);
        if (bs !== null && fs !== null && bs !== 0 && fs !== 0) {
          // Reserved for a future BS+FS coherence check; handled below for IS.
        }
        if (bs !== null && is !== null && bs !== 0 && is !== 0) {
          warnings.push({ rowIndex: idx, column: 'bs', message: 'BS and IS in same row', severity: 'warning' });
        }
      });
      break;
    }

    case 'drone': {
      if (rows.length < 5) {
        warnings.push({ message: 'Minimum 5 GCPs recommended', severity: 'warning' });
      }
      break;
    }

    case 'deformation': {
      const epochs = new Set(rows.map((r) => r.epoch).filter(Boolean));
      if (epochs.size < 2) {
        warnings.push({ message: 'Minimum 2 epochs required for comparison', severity: 'warning' });
      }
      break;
    }
  }

  return warnings;
}
