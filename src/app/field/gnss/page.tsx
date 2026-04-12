'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { GNSSConnectionPanel } from '@/components/gnss/GNSSConnectionPanel';
import { CoordinateDisplay } from '@/components/gnss/CoordinateDisplay';
import { type NMEAPosition } from '@/lib/gnss';

export default function GNSSPage() {
  const [position, setPosition] = useState<NMEAPosition | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1B3A5C] text-white px-4 py-3 flex items-center gap-3">
        <Link href="/field" className="p-2 -ml-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-semibold">GNSS Receiver</h1>
      </div>

      <div className="p-4 space-y-4">
        <GNSSConnectionPanel
          onPosition={setPosition}
          onConnect={(device) => console.log('Connected:', device)}
          onDisconnect={() => setPosition(null)}
        />

        {position && (
          <CoordinateDisplay
            position={position}
            showKenya={true}
            onCopy={(coord) => console.log('Copied:', coord)}
          />
        )}

        <div className="p-4 bg-yellow-50 rounded-lg">
          <h3 className="font-medium text-yellow-800 mb-2">Instructions</h3>
          <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
            <li>Enable Bluetooth on your device</li>
            <li>Turn on your GNSS receiver</li>
            <li>Tap "Scan for GNSS" to find devices</li>
            <li>Select your receiver and tap "Connect"</li>
            <li>Coordinates will stream automatically</li>
          </ol>
        </div>

        <div className="p-4 bg-gray-100 rounded-lg">
          <h3 className="font-medium mb-2">Supported Receivers</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Trimble R Series (R2, R4, R6, R8, R10)</li>
            <li>• Leica GS Series (GS14, GS16, GS18)</li>
            <li>• Topcon HiPer Series</li>
            <li>• South S Series</li>
            <li>• Generic NMEA 0183 receivers</li>
          </ul>
        </div>
      </div>
    </div>
  );
}