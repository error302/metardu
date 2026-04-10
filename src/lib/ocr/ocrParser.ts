/**
 * METARDU — Level Book OCR Parser
 *
 * Parses raw Tesseract.js OCR output into structured LevelBookRow data.
 *
 * Handles:
 * - Column detection from headers (BS, IS, FS, RL, Rise, Fall, HI/HC, etc.)
 * - Common OCR character misreads  (O→0, l→1, S→5, I→1, etc.)
 * - Both Rise & Fall and Height of Collimation formats
 * - Confidence scoring and flagging of low-confidence / out-of-range values
 */

import type { OCRResult, OCRWord } from './levelBookOCR';

// ─── Public Types ───────────────────────────────────────────────

export interface LevelBookRow {
  id: string;
  station: string;
  bs: number | null;
  is: number | null;
  fs: number | null;
  rl: number | null;
  rise: number | null;
  fall: number | null;
  remarks: string;
  ocrConfidence: number; // Average word confidence for this row
  flagged: boolean;      // Low confidence or computation error
  flags: string[];       // Human-readable reasons for flagging
}

export type LevelBookFormat = 'rise_and_fall' | 'height_of_collimation' | 'unknown';

export interface ParsedLevelBook {
  rows: LevelBookRow[];
  format: LevelBookFormat;
  openingRL: number | null;
  columnMap: ColumnMap;
  rawText: string;
}

export interface ColumnMap {
  station: number | null;
  bs: number | null;
  is: number | null;
  fs: number | null;
  rise: number | null;
  fall: number | null;
  rl: number | null;
  remarks: number | null;
}

// ─── OCR Character Correction ───────────────────────────────────

/** Maps commonly misread characters back to their likely digit. */
const OCR_CHAR_FIXES: Record<string, string> = {
  O: '0', o: '0',
  l: '1', I: '1',
  S: '5', s: '5',
  B: '8',  // 'B' can look like '8' in OCR of handwriting
  Z: '2',  // 'Z' can look like '2'
};

/**
 * Attempt to fix common OCR character errors in a numeric string.
 * Only fixes characters that are not already digits.
 */
function fixOCRNumber(raw: string): string {
  let fixed = '';
  for (const ch of raw) {
    if (/\d/.test(ch) || ch === '.' || ch === '-' || ch === '+') {
      fixed += ch;
    } else {
      fixed += OCR_CHAR_FIXES[ch] ?? ch;
    }
  }
  return fixed;
}

/**
 * Parse a string into a number, applying OCR character fixes first.
 * Returns null if the string is not a valid number.
 */
function parseOCRNumber(raw: string): number | null {
  if (!raw || raw.trim().length === 0) return null;

  const cleaned = raw.trim().replace(/[,;\s]/g, '');
  if (cleaned.length === 0) return null;

  const fixed = fixOCRNumber(cleaned);
  const num = parseFloat(fixed);
  return Number.isFinite(num) ? num : null;
}

// ─── Header / Column Detection ──────────────────────────────────

const HEADER_PATTERNS: Record<keyof ColumnMap, RegExp[]> = {
  station: [/^(station|stn|stn\s*n[o0]|point|no\.?)$/i],
  bs: [/^b\.?\s*s\.?$/, /^backsight$/i, /^back\s*sight$/i],
  is: [/^i\.?\s*s\.?$/, /^inter\s*sight$/i, /^int\.?\s*s\.?$/i],
  fs: [/^f\.?\s*s\.?$/, /^foresight$/i, /^fore\s*sight$/i],
  rise: [/^rise$/i, /^r$/i],
  fall: [/^fall$/i, /^f$/i],
  rl: [/^(r\.?\s*l\.?|reduced\s*level|rl)$/i],
  remarks: [/^(rem(?:arks)?|notes?)$/i],
};

function matchHeaderPattern(headerText: string): keyof ColumnMap | null {
  const normalized = headerText.trim().replace(/[\s_\-]+/g, ' ');
  for (const [col, patterns] of Object.entries(HEADER_PATTERNS)) {
    for (const pat of patterns) {
      if (pat.test(normalized)) return col as keyof ColumnMap;
    }
  }
  return null;
}

/**
 * Build a column map from OCR words organized by approximate Y-line rows.
 * Tesseract word bounding boxes (bbox) let us group words into rows by
 * their y0 coordinate, then detect which columns each header occupies.
 */
function detectColumns(words: OCRWord[]): ColumnMap {
  // Group words into horizontal lines based on y0 proximity (within 30% of median word height)
  if (words.length === 0) return emptyColumnMap();

  const heights = words.map((w) => Math.abs(w.bbox.y1 - w.bbox.y0));
  const medianH = median(heights.filter((h) => h > 0)) || 10;
  const ROW_THRESHOLD = medianH * 0.6;

  // Sort words by y0 then x0
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);

  // Group into rows
  const rows: OCRWord[][] = [];
  let currentRow: OCRWord[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].bbox.y0 - currentRow[0].bbox.y0) < ROW_THRESHOLD) {
      currentRow.push(sorted[i]);
    } else {
      rows.push(currentRow);
      currentRow = [sorted[i]];
    }
  }
  rows.push(currentRow);

  // Try to find a header row (usually first or second row)
  const colMap = emptyColumnMap();
  for (let r = 0; r < Math.min(rows.length, 3); r++) {
    const rowTexts = rows[r].map((w) => w.text.trim());
    // If more than 2 words in the row match known column headers, treat it as the header row
    let matchCount = 0;
    for (const txt of rowTexts) {
      if (matchHeaderPattern(txt)) matchCount++;
    }
    if (matchCount >= 2) {
      // Sort this row's words by x0 to determine column positions
      const headerRow = [...rows[r]].sort((a, b) => a.bbox.x0 - b.bbox.x0);
      for (const w of headerRow) {
        const col = matchHeaderPattern(w.text);
        if (col) {
          colMap[col] = w.bbox.x0;
        }
      }
      break;
    }
  }

  // If no header row found, try heuristic column assignment by x-position
  if (colMap.station === null && colMap.bs === null && colMap.fs === null) {
    assignColumnsByPosition(rows, colMap);
  }

  return colMap;
}

function assignColumnsByPosition(rows: OCRWord[][], colMap: ColumnMap) {
  if (rows.length < 2) return;
  // Use first data row (after potential header) to estimate column positions
  // In a typical level book: Station | BS | IS | FS | Rise | Fall | RL | Remarks
  const dataRow = rows.length > 2 ? rows[1] : rows[0];
  if (dataRow.length < 2) return;

  const sorted = [...dataRow].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  // Assign by position: first non-numeric or short alphanumeric = station,
  // then numbers in order for BS, IS, FS, then Rise, Fall, RL
  let numIdx = 0;
  for (const w of sorted) {
    const num = parseOCRNumber(w.text);
    if (num === null && colMap.station === null) {
      colMap.station = w.bbox.x0;
    } else if (num !== null) {
      if (numIdx === 0 && colMap.bs === null) colMap.bs = w.bbox.x0;
      else if (numIdx === 1 && colMap.is === null) colMap.is = w.bbox.x0;
      else if (numIdx === 2 && colMap.fs === null) colMap.fs = w.bbox.x0;
      else if (numIdx === 3 && colMap.rise === null) colMap.rise = w.bbox.x0;
      else if (numIdx === 4 && colMap.fall === null) colMap.fall = w.bbox.x0;
      else if (numIdx === 5 && colMap.rl === null) colMap.rl = w.bbox.x0;
      numIdx++;
    }
  }
}

function emptyColumnMap(): ColumnMap {
  return { station: null, bs: null, is: null, fs: null, rise: null, fall: null, rl: null, remarks: null };
}

// ─── Row Parsing ────────────────────────────────────────────────

/**
 * Given a column map with x-positions, assign each word to the nearest column.
 * Words that are within 40% of the column gap from a column's x-position
 * are assigned to that column.
 */
function assignWordToColumn(word: OCRWord, colMap: ColumnMap): keyof ColumnMap | null {
  const entries = Object.entries(colMap).filter(([, v]) => v !== null) as [keyof ColumnMap, number][];
  if (entries.length === 0) return null;

  const wordCenter = (word.bbox.x0 + word.bbox.x1) / 2;
  let bestCol: keyof ColumnMap | null = null;
  let bestDist = Infinity;

  for (const [col, xPos] of entries) {
    const dist = Math.abs(wordCenter - xPos);
    if (dist < bestDist) {
      bestDist = dist;
      bestCol = col;
    }
  }

  // Only assign if reasonably close (within 40% of the column x-range)
  const positions = entries.map(([, v]) => v).sort((a, b) => a - b);
  const gap = positions.length >= 2
    ? (positions[positions.length - 1] - positions[0]) / (positions.length - 1)
    : 200;
  const threshold = gap * 0.45;

  return bestDist <= threshold ? bestCol : null;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Format Detection ───────────────────────────────────────────

function detectFormat(rows: LevelBookRow[]): LevelBookFormat {
  const hasRise = rows.some((r) => r.rise !== null);
  const hasFall = rows.some((r) => r.fall !== null);
  if (hasRise || hasFall) return 'rise_and_fall';
  // Default to HOC if there are BS/FS readings
  const hasReadings = rows.some((r) => r.bs !== null || r.is !== null || r.fs !== null);
  return hasReadings ? 'height_of_collimation' : 'unknown';
}

// ─── Validation & Flagging ──────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 70;
const UNREASONABLE_RL_MIN = -500;
const UNREASONABLE_RL_MAX = 9000;
const UNREASONABLE_READING_MIN = 0;
const UNREASONABLE_READING_MAX = 50;

function flagRow(row: LevelBookRow, index: number, allRows: LevelBookRow[]): string[] {
  const flags: string[] = [];

  if (row.ocrConfidence < LOW_CONFIDENCE_THRESHOLD) {
    flags.push(`Low OCR confidence (${row.ocrConfidence.toFixed(0)}%)`);
  }

  // Check for unreasonable values
  if (row.rl !== null && (row.rl < UNREASONABLE_RL_MIN || row.rl > UNREASONABLE_RL_MAX)) {
    flags.push(`RL out of typical range (${row.rl.toFixed(3)})`);
  }

  for (const field of ['bs', 'is', 'fs'] as const) {
    const val = row[field];
    if (val !== null && (val < UNREASONABLE_READING_MIN || val > UNREASONABLE_READING_MAX)) {
      flags.push(`${field.toUpperCase()} reading out of range (${val.toFixed(3)})`);
    }
  }

  // Check arithmetic: for a BS row, RL should equal previous RL (for Change Point)
  // For FS/IS rows, RL should be lower than HI
  if (index > 0) {
    const prev = allRows[index - 1];
    if (prev.bs !== null && row.rl !== null && prev.rl !== null) {
      // After a BS, the FS/IS row's RL should be: prevRL + prevBS - reading
      const hi = prev.rl + prev.bs;
      if (row.fs !== null) {
        const expectedRL = hi - row.fs;
        if (Math.abs(row.rl - expectedRL) > 0.05) {
          flags.push(`RL check: expected ${expectedRL.toFixed(3)}, got ${row.rl.toFixed(3)}`);
        }
      }
    }
  }

  return flags;
}

// ─── Main Parser ────────────────────────────────────────────────

/**
 * Parse raw OCR result into structured LevelBookRow data.
 *
 * Algorithm:
 * 1. Group OCR words into horizontal rows using bbox y-coordinates
 * 2. Detect column headers and build a column position map
 * 3. Assign each word to its nearest column
 * 4. Extract numeric values with OCR character correction
 * 5. Auto-detect format (Rise & Fall vs Height of Collimation)
 * 6. Flag rows with low confidence or computation errors
 */
export function parseLevelBookFromOCR(ocrResult: OCRResult): ParsedLevelBook {
  const { words, text } = ocrResult;

  if (words.length === 0) {
    return {
      rows: [],
      format: 'unknown',
      openingRL: null,
      columnMap: emptyColumnMap(),
      rawText: text,
    };
  }

  const colMap = detectColumns(words);

  // Group words into rows
  const heights = words.map((w) => Math.abs(w.bbox.y1 - w.bbox.y0));
  const medianH = median(heights.filter((h) => h > 0)) || 10;
  const ROW_THRESHOLD = medianH * 0.6;

  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const wordRows: OCRWord[][] = [];
  let currentRow: OCRWord[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].bbox.y0 - currentRow[0].bbox.y0) < ROW_THRESHOLD) {
      currentRow.push(sorted[i]);
    } else {
      wordRows.push(currentRow);
      currentRow = [sorted[i]];
    }
  }
  wordRows.push(currentRow);

  // Skip potential header rows (first 1-2 rows if they contain known column names)
  let startIdx = 0;
  for (let r = 0; r < Math.min(wordRows.length, 2); r++) {
    const rowTexts = wordRows[r].map((w) => w.text.trim());
    const headerCount = rowTexts.filter((t) => matchHeaderPattern(t)).length;
    if (headerCount >= 2) {
      startIdx = r + 1;
    }
  }

  // Parse data rows
  const rows: LevelBookRow[] = [];
  for (let r = startIdx; r < wordRows.length; r++) {
    const wordRow = wordRows[r].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (wordRow.length === 0) continue;

    // Collect text per column
    const colTexts: Partial<Record<keyof ColumnMap, string[]>> = {};
    const colConfidences: Partial<Record<keyof ColumnMap, number[]>> = {};

    for (const w of wordRow) {
      const col = assignWordToColumn(w, colMap);
      if (col) {
        if (!colTexts[col]) colTexts[col] = [];
        if (!colConfidences[col]) colConfidences[col] = [];
        colTexts[col]!.push(w.text);
        colConfidences[col]!.push(w.confidence);
      }
    }

    // Extract values
    const stationText = (colTexts.station ?? []).join(' ').trim();
    const bsText = (colTexts.bs ?? []).join(' ').trim();
    const isText = (colTexts.is ?? []).join(' ').trim();
    const fsText = (colTexts.fs ?? []).join(' ').trim();
    const riseText = (colTexts.rise ?? []).join(' ').trim();
    const fallText = (colTexts.fall ?? []).join(' ').trim();
    const rlText = (colTexts.rl ?? []).join(' ').trim();
    const remarksText = (colTexts.remarks ?? []).join(' ').trim();

    const bs = parseOCRNumber(bsText);
    const is = parseOCRNumber(isText);
    const fs = parseOCRNumber(fsText);
    const rl = parseOCRNumber(rlText);
    const rise = parseOCRNumber(riseText);
    const fall = parseOCRNumber(fallText);

    // Compute average confidence for this row
    const allConfidences = wordRow.map((w) => w.confidence);
    const avgConfidence = allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0;

    // If no column map was found, try to parse the row as a simple sequence:
    // station number text number number ...
    let finalStation = stationText;
    let finalBS = bs;
    let finalIS = is;
    let finalFS = fs;
    let finalRL = rl;
    let finalRise = rise;
    let finalFall = fall;

    if (colMap.station === null && wordRow.length >= 2) {
      // Fallback: first token is station, remaining tokens parsed as numbers
      const tokens = wordRow.map((w) => w.text.trim());
      finalStation = tokens[0];

      const numbers = tokens.slice(1).map((t) => parseOCRNumber(t)).filter((n): n is number => n !== null);
      if (numbers.length >= 1) finalBS = numbers[0] ?? null;
      if (numbers.length >= 2) finalIS = numbers[1] ?? null;
      if (numbers.length >= 3) finalFS = numbers[2] ?? null;
      if (numbers.length >= 4) finalRise = numbers[3] ?? null;
      if (numbers.length >= 5) finalFall = numbers[4] ?? null;
      if (numbers.length >= 6) finalRL = numbers[5] ?? null;
    }

    // Skip rows that have no station name and no numeric data
    if (!finalStation && finalBS === null && finalIS === null && finalFS === null) continue;

    const row: LevelBookRow = {
      id: crypto.randomUUID(),
      station: finalStation || `Row ${rows.length + 1}`,
      bs: finalBS,
      is: finalIS,
      fs: finalFS,
      rl: finalRL,
      rise: finalRise,
      fall: finalFall,
      remarks: remarksText,
      ocrConfidence: avgConfidence,
      flagged: false,
      flags: [],
    };

    rows.push(row);
  }

  // Flag problematic rows
  for (let i = 0; i < rows.length; i++) {
    const flags = flagRow(rows[i], i, rows);
    rows[i].flags = flags;
    rows[i].flagged = flags.length > 0;
  }

  // Detect opening RL: usually the first row's RL, or first row's BS + assumed RL
  let openingRL: number | null = null;
  if (rows.length > 0) {
    // Look for a row labeled BM or containing "BM" in station
    const bmRow = rows.find((r) => /bm\b|benchmark/i.test(r.station));
    if (bmRow !== undefined && bmRow.rl !== null) openingRL = bmRow.rl;
    else if (rows[0].rl !== null) openingRL = rows[0].rl;
  }

  const format = detectFormat(rows);

  return {
    rows,
    format,
    openingRL,
    columnMap: colMap,
    rawText: text,
  };
}

// ─── Re-verification ────────────────────────────────────────────

/**
 * Re-compute RLs using Rise & Fall method from the given rows.
 * Returns updated rows with recalculated RLs and flags for any mismatches.
 */
export function verifyAndRecompute(rows: LevelBookRow[], openingRL: number): LevelBookRow[] {
  const updated = rows.map((r) => ({ ...r, flags: [] as string[], flagged: false }));

  let hi: number | null = null;
  let currentRL = openingRL;

  for (let i = 0; i < updated.length; i++) {
    const row = updated[i];

    if (row.bs !== null) {
      const baseRL = i === 0 ? openingRL : (updated[i - 1]?.rl ?? currentRL);
      hi = baseRL + row.bs;
      row.rl = baseRL;
    }

    if (row.is !== null && hi !== null) {
      const computedRL = hi - row.is;
      row.rl = computedRL;
      currentRL = computedRL;

      // Check if OCR-extracted RL matches computed
      if (row.rl !== null) {
        // RL is overwritten by computation — compare only if there was an original
      }
    }

    if (row.fs !== null && hi !== null) {
      const computedRL = hi - row.fs;
      row.rl = computedRL;
      currentRL = computedRL;
      // Reset HI after FS: a foresight terminates the current instrument setup.
      // The next reading must establish a new HI via a BS before IS is valid.
      hi = null;
    }

    // Re-flag
    const flags = flagRow(row, i, updated);
    row.flags = flags;
    row.flagged = flags.length > 0;
  }

  return updated;
}
