'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { NMEAPosition } from '@/lib/gnss/nmea-parser';

interface CoordinateDisplayProps {
  position: NMEAPosition | null;
}

export function CoordinateDisplay({ position }: CoordinateDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    if (!position) return;
    setCopyFailed(false);
    const coordinates = `${position.latitude.toFixed(7)}, ${position.longitude.toFixed(7)}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(coordinates);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  };

  if (!position) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        No position data
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-tertiary)] p-3 text-[var(--text-primary)]">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Receiver latitude / longitude</div>
            <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
              Reference frame and height datum depend on receiver configuration. Confirm them against project control before engineering use.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            title="Copy receiver latitude and longitude"
            aria-label="Copy receiver latitude and longitude"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm tabular-nums">
          <div><span className="text-[var(--text-muted)]">Lat:</span><span className="ml-1">{position.latitude.toFixed(7)}°</span></div>
          <div><span className="text-[var(--text-muted)]">Lon:</span><span className="ml-1">{position.longitude.toFixed(7)}°</span></div>
        </div>
        {copied && <p role="status" className="mt-2 text-xs text-green-500">Coordinates copied.</p>}
        {copyFailed && <p role="alert" className="mt-2 text-xs text-red-500">Clipboard access failed. Select and copy the coordinates manually.</p>}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold">{position.satellites}</div>
          <div className="text-xs text-gray-500">Satellites</div>
        </div>
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold">{position.hdop.toFixed(1)}</div>
          <div className="text-xs text-gray-500">HDOP</div>
        </div>
        <div className="p-2 bg-gray-100 rounded">
          <div className="text-lg font-bold uppercase">{position.fixType}</div>
          <div className="text-xs text-gray-500">Fix Type</div>
        </div>
      </div>
    </div>
  );
}
