/**
 * Type declarations for tesseract.js
 *
 * NOTE: This package must be installed for OCR to work.
 *   npm install tesseract.js
 *
 * These declarations allow the project to compile without tesseract.js
 * installed, while still providing proper type safety when it is present.
 */

declare module 'tesseract.js' {
  interface TesseractWorker {
    recognize(image: Blob | File | string): Promise<{ data: TesseractData }>;
    terminate(): Promise<void>;
  }

  interface TesseractWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }

  interface TesseractData {
    text: string;
    confidence: number;
    words: TesseractWord[];
  }

  interface TesseractLogger {
    (info: { status: string; progress: number }): void;
  }

  export function createWorker(
    lang?: string,
    oem?: number,
    options?: { logger?: TesseractLogger },
  ): Promise<TesseractWorker>;

  const _default: {
    createWorker: typeof createWorker;
  };

  export default _default;
}
