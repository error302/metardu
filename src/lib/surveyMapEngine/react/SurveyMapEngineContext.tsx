'use client';

/**
 * SurveyMapEngineContext (plan Phase 4 / §3.1 `react/`).
 *
 * Thin React context exposing the engine's public entry points to a map
 * surface. Phase 4 scope: export + print entries, reachable from this
 * context on both map surfaces (`/map` MapClient and `/project/[id]/map`
 * SurveyMap). Surfaces provide the print callbacks they already own (sheet
 * layout toggling, print action); the export entries delegate to the io
 * surface, which in turn re-exports the existing generators (no
 * reimplementation — GIS exporters keep their fail-closed CRS behavior).
 */

import { createContext, useContext, type ReactNode } from 'react';
import {
  exportDeedPlan,
  downloadDeedPlan,
  exportMapPDF,
  generateGeoJSON,
  downloadGeoJSON,
  generateLandXML,
  downloadLandXML,
} from '../io/exportSurface';
import { loadSheetLayout, type PrintOptions } from '../io/printSurface';

/** Export entry points reachable from the engine context (io/exportSurface). */
export interface SurveyMapEngineExportApi {
  exportDeedPlan: typeof exportDeedPlan;
  downloadDeedPlan: typeof downloadDeedPlan;
  exportMapPDF: typeof exportMapPDF;
  generateGeoJSON: typeof generateGeoJSON;
  downloadGeoJSON: typeof downloadGeoJSON;
  generateLandXML: typeof generateLandXML;
  downloadLandXML: typeof downloadLandXML;
  /** Lazily loads the SheetLayout overlay component (io/printSurface). */
  loadSheetLayout: typeof loadSheetLayout;
}

/** Print entry points owned by the surface and exposed through the engine. */
export interface SurveyMapEnginePrintApi {
  /** Whether the sheet-layout overlay is currently shown. */
  sheetLayoutOpen: boolean;
  /** Show the sheet-layout overlay. */
  openSheetLayout: () => void;
  /** Hide the sheet-layout overlay. */
  closeSheetLayout: () => void;
  /** Toggle the sheet-layout overlay. */
  toggleSheetLayout: () => void;
  /** The surface's print action (print current map view / open print flow). */
  print: (overrides?: Partial<PrintOptions>) => void | Promise<void>;
}

export interface SurveyMapEngineContextValue {
  exportApi: SurveyMapEngineExportApi;
  printApi: SurveyMapEnginePrintApi;
}

const SurveyMapEngineContext = createContext<SurveyMapEngineContextValue | null>(null);

/** Static export entries — identical for every surface; built once. */
const EXPORT_API: SurveyMapEngineExportApi = {
  exportDeedPlan,
  downloadDeedPlan,
  exportMapPDF,
  generateGeoJSON,
  downloadGeoJSON,
  generateLandXML,
  downloadLandXML,
  loadSheetLayout,
};

export interface SurveyMapEngineProviderProps {
  printApi: SurveyMapEnginePrintApi;
  children: ReactNode;
}

export function SurveyMapEngineProvider({ printApi, children }: SurveyMapEngineProviderProps) {
  // printApi is rebuilt by the surface when its state changes; memoization of
  // the context value would go stale, so compose it directly.
  const value: SurveyMapEngineContextValue = { exportApi: EXPORT_API, printApi };
  return (
    <SurveyMapEngineContext.Provider value={value}>
      {children}
    </SurveyMapEngineContext.Provider>
  );
}

export function useSurveyMapEngineContext(): SurveyMapEngineContextValue | null {
  return useContext(SurveyMapEngineContext);
}
