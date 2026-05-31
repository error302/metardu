/**
 * Capacitor Bluetooth LE Plugin Wrapper
 * Fallback implementation - uses Web Bluetooth when Capacitor not available
 */

import { parseNMEA, type NMEAPosition } from './nmea-parser';
import { type GNSSDevice, type PositionCallback, type ConnectionCallback } from './bluetooth';

export interface CapacitorGNSSDevice {
  deviceId: string;
  name: string;
  rssi?: number;
}

const LOCATION_SERVICE_UUID = '00001819-0000-1000-8000-00805f9b34fb';
const NMEA_CHARACTERISTIC_UUID = '00002a67-0000-1000-8000-00805f9b34fb';

export class CapacitorBLEGNSS {
  private deviceId: string | null = null;
  private positionCallbacks: PositionCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private buffer: string = '';

  static async isAvailable(): Promise<boolean> {
    return false;
  }

  static async requestPermissions(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async scanForDevices(): Promise<CapacitorGNSSDevice[]> {
    throw new Error('Capacitor Bluetooth LE not available. Use Web Bluetooth in browser.');
  }

  async connect(deviceId: string): Promise<void> {
    throw new Error('Capacitor Bluetooth LE not available. Use Web Bluetooth in browser.');
  }

  async disconnect(): Promise<void> {
    this.deviceId = null;
    this.buffer = '';
    this.notifyConnection(false);
  }

  onPosition(callback: PositionCallback): () => void {
    this.positionCallbacks.push(callback);
    return () => {
      this.positionCallbacks = this.positionCallbacks.filter(cb => cb !== callback);
    };
  }

  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.push(callback);
    return () => {
      this.connectionCallbacks = this.connectionCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyPosition(position: NMEAPosition): void {
    for (const callback of this.positionCallbacks) {
      callback(position);
    }
  }

  private notifyConnection(connected: boolean, error?: string): void {
    for (const callback of this.connectionCallbacks) {
      callback(connected, error);
    }
  }

  isConnected(): boolean {
    return this.deviceId !== null;
  }
}