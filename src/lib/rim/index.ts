// ============================================================
// METARDU — RIM Editor System (Barrel Export)
// Resurvey and Index Map — Kenya Cadastral Document System
// ============================================================

// Types
export type {
  RimSection,
  RimParcel,
  RimBeacon,
} from './db'

// Database functions
export { createRimTables } from './db'

// PDF generation
export { generateRimPdf } from './rimPdfGenerator'

// Templates
export { RIM_TEMPLATES, getTemplatesByCategory, searchTemplates, createSectionFromTemplate, getTemplateCategories } from "./rimTemplates"
export type { RimTemplate } from "./rimTemplates"
