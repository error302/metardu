/**
 * Web Serial API Type Declarations
 * ===================================
 * TypeScript declarations for the Web Serial API.
 * These types are available in Chrome 89+ and Edge 89+ but not yet
 * in the default TypeScript DOM lib.
 */

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
  forget(): Promise<void>
  getInfo(): SerialPortInfo
  getSignals(): Promise<SerialPortSignals>
  setSignals(signals: Partial<SerialPortSignals>): Promise<void>
  readLockReleased: boolean
  writeLockReleased: boolean
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void
}

interface SerialPortInfo {
  usbVendorId: number | undefined
  usbProductId: number | undefined
}

interface SerialPortSignals {
  dataTerminalReady: boolean
  requestToSend: boolean
  clearToSend: boolean
  dataCarrierDetect: boolean
  dataSetReady: boolean
  ringIndicator: boolean
}

interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  flowControl?: 'none' | 'hardware'
  bufferSize?: number
}

interface Serial {
  requestPort(): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
  addEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
  removeEventListener(type: 'connect' | 'disconnect', listener: (event: Event) => void): void
}

interface Navigator {
  serial: Serial
}
