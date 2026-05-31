/**
 * METARDU Serial — Index
 * ========================
 * Public API barrel export for the serial/instrument connection system.
 */

export {
  InstrumentSerialConnection,
  INSTRUMENT_PRESETS,
  isSerialSupported,
  getPreviouslyAuthorizedPorts,
} from './InstrumentSerialConnection'

export type {
  ConnectionStatus,
  SerialConnectionConfig,
  InstrumentInfo,
  ConnectionStats,
} from './InstrumentSerialConnection'

export {
  parseNMEA,
  parseGPGGA,
  parseGPRMC,
  parseGSIBlock,
  parseGSILine,
  parseTopconLine,
  parseTrimbleLine,
  parseSokkiaLine,
  createStreamParser,
} from './protocolParsers'

export type {
  NMEAPosition,
  NMEARMC,
  GSIWord,
  GSIMeasurement,
  TopconMeasurement,
  TrimbleMeasurement,
  SokkiaMeasurement,
  ParsedInstrumentData,
  InstrumentStreamParser,
} from './protocolParsers'

export {
  LEICA_COMMANDS,
  TOPCON_COMMANDS,
  TRIMBLE_COMMANDS,
  SOKKIA_COMMANDS,
  getInstrumentCommand,
  getBrandFromPreset,
  getAvailableCommands,
  BRAND_INFO,
} from './instrumentCommands'

export type {
  InstrumentBrand,
  MeasurementCommand,
  CommandType,
  StationSetup,
} from './instrumentCommands'
