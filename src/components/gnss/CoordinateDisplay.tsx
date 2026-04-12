'use client';

import { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { type NMEAPosition } from '@/lib/gnss';
import { wgs84ToKenya, formatCoordinate, type KenyanCoordinate } from '@/lib/gnss';

interface CoordinateDisplayProps {
  position: NMEAPosition | null;
  showKenya?: boolean;
  onCopy?: (coord: KenyanCoordinate) => void;
}

export function CoordinateDisplay({ position, showKenya = true, onCopy }: CoordinateDisplayProps) {
  const [kenya, setKenya] = useState<KenyanCoordinate | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (position && showKenya) {
      const kenyaCoord = wgs84ToKenya({
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: position.altitude,
      });
      setKenya(kenyaCoord);
    } else {
      setKenya(null);
    }
  }, [position, showKenya]);

  const handleCopy = () => {
    if (kenya) {
      navigator.clipboard.writeText(formatCoordinate(kenya));
      setCopied(true);
      onCopy?.(kenya);
      setTimeout(() => setCopied(false), 2000);
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
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="text-xs text-gray-500 mb-1">WGS84</div>
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
          <div>
            <span className="text-gray-500">Lat:</span>
            <span className="ml-1">{position.latitude.toFixed(6)}°</span>
          </div>
          <div>
            <span className="text-gray-500">Lon:</span>
            <span className="ml-1">{position.longitude.toFixed(6)}°</span>
          </div>
        </div>
      </div>

      {kenya && (
        <div className="p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-blue-700">Kenya SRID 21037</div>
            <button
              onClick={handleCopy}
              className="p-1 hover:bg-blue-100 rounded"
              title="Copy coordinates"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-blue-600" />
              )}
            </button>
          </div>
          <div className="font-mono text-sm">
            <div>E {kenya.easting.toFixed(3)} m</div>
            <div>N {kenya.northing.toFixed(3)} m</div>
          </div>
        </div>
      )}

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