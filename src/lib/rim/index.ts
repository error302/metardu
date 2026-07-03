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

// AUDIT FIX (2026-07-03): createRimTables export removed — function deleted.
// Tables are created by migrations, not at runtime.

// PDF generation
export { generateRimPdf } from './rimPdfGenerator'

// Templates
export { RIM_TEMPLATES, getTemplatesByCategory, searchTemplates, createSectionFromTemplate, getTemplateCategories } from "./rimTemplates"
export type { RimTemplate } from "./rimTemplates"
