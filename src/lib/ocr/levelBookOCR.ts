/**
 * METARDU — Level Book OCR Engine
 *
 * Tesseract.js wrapper for scanned level book pages.
 * Includes image pre-processing (grayscale + contrast boost)
 * for improved OCR on aged/deteriorated field book scans.
 *
 * NOTE: Requires `tesseract.js` as a peer dependency.
 *   npm install tesseract.js
 */

// ─── Public Types ───────────────────────────────────────────────

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRResult {
  text: string;
  confidence: number;
  words: OCRWord[];
}

export type OCRStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; progress: number }
  | { phase: 'recognizing'; progress: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

// ─── Image Pre-processing ───────────────────────────────────────

/**
 * Convert uploaded file to a canvas, apply grayscale + contrast enhancement,
 * and return a Blob ready for Tesseract.
 *
 * Aged field book scans are often faded with low contrast pencil marks.
 * Boosting contrast and converting to grayscale dramatically improves
 * character recognition accuracy.
 */
export async function preprocessImage(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // Scale up small images for better OCR
        const MAX_DIM = 2400;
        let { width, height } = img;
        if (width < MAX_DIM && height < MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not get canvas 2d context'));
          return;
        }

        // Step 1: Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Step 2: Convert to grayscale
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        // Step 3: Increase contrast (factor 1.6 around midpoint 128)
        const CONTRAST = 1.6;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = clamp(((data[i] - 128) * CONTRAST) + 128);
          data[i + 1] = clamp(((data[i + 1] - 128) * CONTRAST) + 128);
          data[i + 2] = clamp(((data[i + 2] - 128) * CONTRAST) + 128);
        }

        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob returned null'));
          },
          'image/png',
          1.0,
        );
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file'));
    };

    img.src = url;
  });
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ─── Tesseract OCR Execution ────────────────────────────────────

/**
 * Run Tesseract.js OCR on a pre-processed image blob.
 * Returns structured result with word-level bounding boxes and confidence.
 *
 * @param imageBlob  — Pre-processed PNG blob (use preprocessImage first)
 * @param lang       — Tesseract language code, default 'eng'
 * @param onProgress — Optional callback for progress updates
 */
export async function performOCR(
  imageBlob: Blob,
  lang: string = 'eng',
  onProgress?: (status: OCRStatus) => void,
): Promise<OCRResult> {
  // Dynamic import so tesseract.js is loaded only when needed
  let TesseractModule: any;
  try {
    TesseractModule = await import('tesseract.js');
  } catch {
    throw new Error(
      'tesseract.js is not installed. Run: npm install tesseract.js',
    );
  }

  const createWorker = TesseractModule.createWorker ?? TesseractModule.default?.createWorker;
  if (typeof createWorker !== 'function') {
    throw new Error('Could not initialize tesseract.js worker');
  }

  const worker = await createWorker(lang, 1, {
    logger: (info: any) => {
      if (!onProgress) return;
      if (info.status === 'recognizing text') {
        onProgress({ phase: 'recognizing', progress: Math.round(info.progress * 100) });
      } else if (info.status === 'loading tesseract core' || info.status === 'initializing tesseract') {
        onProgress({ phase: 'loading', progress: Math.round(info.progress * 100) });
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageBlob);

    const words: OCRWord[] = (data.words ?? []).map((w: any) => ({
      text: (w.text ?? '').trim(),
      confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      bbox: {
        x0: w.bbox?.x0 ?? 0,
        y0: w.bbox?.y0 ?? 0,
        x1: w.bbox?.x1 ?? 0,
        y1: w.bbox?.y1 ?? 0,
      },
    }));

    return {
      text: data.text ?? '',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      words,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Convenience: preprocess an image file and run OCR in one call.
 */
export async function scanLevelBookPage(
  file: File | Blob,
  lang: string = 'eng',
  onProgress?: (status: OCRStatus) => void,
): Promise<OCRResult> {
  onProgress?.({ phase: 'loading', progress: 0 });
  const processed = await preprocessImage(file);
  const result = await performOCR(processed, lang, onProgress);
  onProgress?.({ phase: 'done' });
  return result;
}
