'use client';

/**
 * METARDU — useOCRImport Hook
 *
 * Manages the full lifecycle of OCR-based level book import:
 * 1. File selection / drag-and-drop
 * 2. Image pre-processing + Tesseract.js OCR
 * 3. Parsing into structured LevelBookRow data
 * 4. Review, edit, verify, and accept
 */

import { useState, useCallback, useRef } from 'react';
import type { OCRResult, OCRStatus } from '@/lib/ocr/levelBookOCR';
import type { LevelBookRow, ParsedLevelBook } from '@/lib/ocr/ocrParser';
import { scanLevelBookPage } from '@/lib/ocr/levelBookOCR';
import { parseLevelBookFromOCR, verifyAndRecompute } from '@/lib/ocr/ocrParser';

export type ImportPhase = 'idle' | 'loading' | 'processing' | 'done' | 'error';

export interface OCRImportState {
  phase: ImportPhase;
  progress: number;           // 0–100
  progressLabel: string;
  file: File | null;
  previewUrl: string | null;
  ocrResult: OCRResult | null;
  parsed: ParsedLevelBook | null;
  rows: LevelBookRow[];
  error: string | null;
}

const INITIAL_STATE: OCRImportState = {
  phase: 'idle',
  progress: 0,
  progressLabel: '',
  file: null,
  previewUrl: null,
  ocrResult: null,
  parsed: null,
  rows: [],
  error: null,
};

export function useOCRImport() {
  const [state, setState] = useState<OCRImportState>(INITIAL_STATE);
  const previewUrlRef = useRef<string | null>(null);

  // Cleanup preview URL on unmount
  const cleanup = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  /**
   * Set the file to be processed. Creates a preview URL.
   */
  const setFile = useCallback((file: File) => {
    // Cleanup previous
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;

    setState({
      ...INITIAL_STATE,
      phase: 'idle',
      file,
      previewUrl,
    });
  }, []);

  /**
   * Run OCR on the currently selected file.
   */
  const runOCR = useCallback(async (lang: string = 'eng') => {
    if (!state.file) return;

    // Reset processing state
    setState((prev) => ({
      ...prev,
      phase: 'loading',
      progress: 0,
      progressLabel: 'Loading Tesseract engine…',
      ocrResult: null,
      parsed: null,
      rows: [],
      error: null,
    }));

    try {
      const ocrResult = await scanLevelBookPage(state.file, lang, (status) => {
        setState((prev) => {
          if (status.phase === 'loading') {
            return { ...prev, phase: 'loading' as const, progress: status.progress, progressLabel: 'Loading OCR engine…' };
          }
          if (status.phase === 'recognizing') {
            return { ...prev, phase: 'processing' as const, progress: status.progress, progressLabel: 'Recognizing text…' };
          }
          if (status.phase === 'done') {
            return { ...prev, progress: 100, progressLabel: 'Complete' };
          }
          if (status.phase === 'error') {
            return { ...prev, phase: 'error' as const, error: status.message };
          }
          return prev;
        });
      });

      setState((prev) => {
        const parsed = parseLevelBookFromOCR(ocrResult);
        return {
          ...prev,
          phase: 'done' as const,
          progress: 100,
          progressLabel: 'Done',
          ocrResult,
          parsed,
          rows: parsed.rows,
        };
      });
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err?.message || 'OCR processing failed',
      }));
    }
  }, [state.file]);

  /**
   * Update a single row's data (e.g., user edits a cell).
   */
  const updateRow = useCallback((rowId: string, updates: Partial<LevelBookRow>) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)),
    }));
  }, []);

  /**
   * Delete a row by ID.
   */
  const deleteRow = useCallback((rowId: string) => {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => r.id !== rowId),
    }));
  }, []);

  /**
   * Add a new empty row.
   */
  const addRow = useCallback(() => {
    setState((prev) => ({
      ...prev,
      rows: [
        ...prev.rows,
        {
          id: crypto.randomUUID(),
          station: `TP${prev.rows.length + 1}`,
          bs: null,
          is: null,
          fs: null,
          rl: null,
          rise: null,
          fall: null,
          remarks: '',
          ocrConfidence: 0,
          flagged: false,
          flags: [],
        },
      ],
    }));
  }, []);

  /**
   * Re-verify and recompute RLs using the leveling engine.
   * Requires an opening RL value.
   */
  const verify = useCallback((openingRL: number) => {
    setState((prev) => {
      const reverified = verifyAndRecompute(prev.rows, openingRL);
      return {
        ...prev,
        rows: reverified,
        parsed: prev.parsed ? { ...prev.parsed, rows: reverified, openingRL } : null,
      };
    });
  }, []);

  /**
   * Reset to initial idle state.
   */
  const reset = useCallback(() => {
    cleanup();
    setState(INITIAL_STATE);
  }, [cleanup]);

  /**
   * Retry OCR with the same file.
   */
  const retry = useCallback(async (lang: string = 'eng') => {
    await runOCR(lang);
  }, [runOCR]);

  /**
   * Get the rows in a format suitable for importing into the field book.
   */
  const getImportableRows = useCallback(() => {
    return state.rows.map((r) => ({
      id: r.id,
      station: r.station,
      bs: r.bs !== null ? String(r.bs) : '',
      is: r.is !== null ? String(r.is) : '',
      fs: r.fs !== null ? String(r.fs) : '',
      remarks: r.remarks,
    }));
  }, [state.rows]);

  return {
    state,
    setFile,
    runOCR,
    updateRow,
    deleteRow,
    addRow,
    verify,
    reset,
    retry,
    getImportableRows,
  };
}
