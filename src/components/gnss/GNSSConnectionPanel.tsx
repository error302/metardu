'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bluetooth, BluetoothOff, Loader2, MapPin, AlertTriangle, CheckCircle } from 'lucide-react';
import { WebBluetoothGNSS, CapacitorBLEGNSS, type GNSSDevice, type NMEAPosition } from '@/lib/gnss';
import { Capacitor } from '@capacitor/core';

interface GNSSConnectionPanelProps {
  onPosition?: (position: NMEAPosition) => void;
  onConnect?: (device: GNSSDevice) => void;
  onDisconnect?: () => void;
}

export function GNSSConnectionPanel({ onPosition, onConnect, onDisconnect }: GNSSConnectionPanelProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<GNSSDevice | null>(null);
  const [position, setPosition] = useState<NMEAPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gnssService, setGnssService] = useState<{ 
    onPosition: (cb: (pos: NMEAPosition) => void) => () => void;
    onConnectionChange: (cb: (connected: boolean, err?: string) => void) => () => void;
    scanForDevices: () => Promise<{ id: string; name: string; type: string }[]>;
    connect: (deviceId: string) => Promise<void>;
    disconnect: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setGnssService(new CapacitorBLEGNSS() as never);
    } else {
      setGnssService(new WebBluetoothGNSS() as never);
    }
  }, []);

  useEffect(() => {
    if (!gnssService) return;

    const unsubPosition = gnssService.onPosition((pos: NMEAPosition) => {
      setPosition(pos);
      onPosition?.(pos);
    });

    const unsubConnection = gnssService.onConnectionChange((connected, err) => {
      setIsConnected(connected);
      if (err) {
        setError(err);
      }
      if (!connected) {
        setDevice(null);
        setPosition(null);
        onDisconnect?.();
      }
    });

    return () => {
      unsubPosition();
      unsubConnection();
    };
  }, [gnssService, onPosition, onDisconnect]);

  const handleScan = useCallback(async () => {
    if (!gnssService) return;

    setIsScanning(true);
    setError(null);

    try {
      const devices = await gnssService.scanForDevices();

      if (devices.length > 0) {
        setDevice({ 
          id: devices[0].id || '', 
          name: devices[0].name || 'Unknown', 
          type: (devices[0].type as GNSSDevice['type']) || 'generic' 
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScanning(false);
    }
  }, [gnssService]);

  const handleConnect = useCallback(async () => {
    if (!gnssService || !device) return;

    setIsScanning(true);
    setError(null);

    try {
      await gnssService.connect(device.id);
      setIsConnected(true);
      onConnect?.(device);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsScanning(false);
    }
  }, [gnssService, device, onConnect]);

  const handleDisconnect = useCallback(async () => {
    if (!gnssService) return;

    try {
      await gnssService.disconnect();
      setIsConnected(false);
      setDevice(null);
      setPosition(null);
      onDisconnect?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [gnssService, onDisconnect]);

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">GNSS Receiver</h3>
        {isConnected ? (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <CheckCircle className="w-4 h-4" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-400 text-sm">
            <BluetoothOff className="w-4 h-4" />
            Disconnected
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded mb-4">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!isConnected && !device && (
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Bluetooth className="w-5 h-5" />
              Scan for GNSS
            </>
          )}
        </button>
      )}

      {device && !isConnected && (
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="font-medium">{device.name}</div>
            <div className="text-sm text-gray-500 capitalize">{device.type}</div>
          </div>
          <button
            onClick={handleConnect}
            disabled={isScanning}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium"
          >
            {isScanning ? 'Connecting...' : 'Connect'}
          </button>
          <button
            onClick={() => setDevice(null)}
            className="w-full py-2 text-gray-600 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {isConnected && device && (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="font-medium">{device.name}</div>
            <div className="text-sm text-gray-500">{device.id}</div>
          </div>

          {position && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">Current Position</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Lat:</span>
                  <span className="font-mono ml-1">{position.latitude.toFixed(6)}°</span>
                </div>
                <div>
                  <span className="text-gray-500">Lon:</span>
                  <span className="font-mono ml-1">{position.longitude.toFixed(6)}°</span>
                </div>
                <div>
                  <span className="text-gray-500">Alt:</span>
                  <span className="font-mono ml-1">{position.altitude.toFixed(1)}m</span>
                </div>
                <div>
                  <span className="text-gray-500">Sats:</span>
                  <span className="font-mono ml-1">{position.satellites}</span>
                </div>
                <div>
                  <span className="text-gray-500">HDOP:</span>
                  <span className="font-mono ml-1">{position.hdop.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Fix:</span>
                  <span className="font-mono ml-1 uppercase">{position.fixType}</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleDisconnect}
            className="w-full py-2 px-4 border border-red-300 text-red-600 rounded-lg text-sm"
          >
            <BluetoothOff className="w-4 h-4 inline mr-2" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}