'use client';

/**
 * METARDU — OCR Import Panel
 *
 * Drag-and-drop upload panel for scanned level book pages.
 * Accepts PNG, JPG, JPEG, and PDF files. Displays image preview,
 * language selector, progress bar during OCR, and initiates parsing.
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, FileImage, AlertCircle, CheckCircle2, Loader2, X, RotateCcw } from 'lucide-react';
import { useOCRImport } from '@/hooks/useOCRImport';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.pdf'];
const MAX_FILE_SIZE_MB = 20;

interface OCRImportPanelProps {
  onParsed?: (rows: Array<{ id: string; station: string; bs: string; is: string; fs: string; remarks: string }>) => void;
  onPreview?: (previewUrl: string | null) => void;
}

export function OCRImportPanel({ onParsed, onPreview }: OCRImportPanelProps) {
  const {
    state,
    setFile,
    runOCR,
    reset,
    retry,
    getImportableRows,
  } = useOCRImport();

  const [lang, setLang] = useState('eng');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTesseractWarning, setShowTesseractWarning] = useState(false);

  const handleFile = useCallback((file: File) => {
    // Validate file type
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
      alert('Please upload a PNG, JPG, or PDF file.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setFile(file);
    setShowTesseractWarning(false);
  }, [setFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  const handleImport = useCallback(async () => {
    try {
      await runOCR(lang);
    } catch {
      setShowTesseractWarning(true);
    }
  }, [runOCR, lang]);

  const handleAccept = useCallback(() => {
    const rows = getImportableRows();
    if (rows.length === 0) {
      alert('No rows to import. Please run OCR first.');
      return;
    }
    onParsed?.(rows);
  }, [getImportableRows, onParsed]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="label">OCR Import — Scanned Level Book</span>
      </div>
      <div className="card-body space-y-4">
        {/* Tesseract dependency warning */}
        {showTesseractWarning && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-amber-300 font-medium">tesseract.js not installed</p>
              <p className="text-amber-200/70 mt-1">
                Install it with: <code className="bg-black/20 px-1 rounded text-xs">npm install tesseract.js</code>
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {state.phase === 'error' && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-red-300 font-medium">OCR Error</p>
              <p className="text-red-200/70 mt-1">{state.error}</p>
            </div>
            <button onClick={() => retry(lang)} className="text-red-300 hover:text-red-200" title="Retry">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload zone */}
        {state.phase === 'idle' && !state.file && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-3 p-8
              border-2 border-dashed rounded-lg cursor-pointer transition-colors
              ${dragOver
                ? 'border-[#1B3A5C] bg-[#1B3A5C]/10'
                : 'border-[var(--border-color)] hover:border-[#1B3A5C]/60 hover:bg-[#1B3A5C]/5'
              }
            `}
          >
            <div className="w-12 h-12 rounded-full bg-[#1B3A5C]/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-[#1B3A5C]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Drop scanned level book page here
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                PNG, JPG, or PDF — max {MAX_FILE_SIZE_MB} MB
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <FileImage className="w-3.5 h-3.5 mr-1" />
              Browse Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        )}

        {/* File preview + controls */}
        {state.file && (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center justify-between gap-3 p-3 bg-[var(--bg-primary)]/40 border border-[var(--border-color)] rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <FileImage className="w-4 h-4 text-[#1B3A5C] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {state.file.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {(state.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              {(state.phase === 'idle' || state.phase === 'done') && (
                <button
                  onClick={reset}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  title="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Image preview */}
            {state.previewUrl && (
              <div className="rounded-lg overflow-hidden border border-[var(--border-color)] bg-black/5">
                <img
                  src={state.previewUrl}
                  alt="Scanned level book preview"
                  className="w-full max-h-64 object-contain bg-white"
                />
              </div>
            )}

            {/* Progress bar */}
            {(state.phase === 'loading' || state.phase === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)] flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {state.progressLabel}
                  </span>
                  <span className="text-[var(--text-muted)] font-mono">{state.progress}%</span>
                </div>
                <div className="w-full h-2 bg-[var(--bg-primary)]/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1B3A5C] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${state.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Language selector + Import button */}
            {state.phase === 'idle' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="label text-xs">OCR Language</label>
                  <select
                    className="input input-sm"
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                  >
                    <option value="eng">English</option>
                    <option value="fra">French</option>
                    <option value="spa">Spanish</option>
                    <option value="por">Portuguese</option>
                    <option value="ara">Arabic</option>
                    <option value="swa">Swahili</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleImport}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import &amp; Parse
                  </button>
                </div>
              </div>
            )}

            {/* Done state */}
            {state.phase === 'done' && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-300">
                    {state.rows.length} row{state.rows.length !== 1 ? 's' : ''} extracted
                  </span>
                </div>
                {state.rows.length > 0 && (
                  <button
                    onClick={handleAccept}
                    className="btn btn-primary"
                  >
                    Accept &amp; Import into Field Book
                  </button>
                )}
                <button
                  onClick={() => retry(lang)}
                  className="btn btn-secondary flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Re-scan
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
