/**
 * useSurveyMapEngine (plan Phase 4 / §3.1 `react/`).
 *
 * Hook access to the engine context provided by `SurveyMapEngineProvider`.
 * Throws on use outside a provider: the engine context is the only sanctioned
 * path to export/print entries on map surfaces, so silently no-oping would
 * hide a wiring regression.
 */

import {
  useSurveyMapEngineContext,
  type SurveyMapEngineContextValue,
} from './SurveyMapEngineContext';

export function useSurveyMapEngine(): SurveyMapEngineContextValue {
  const ctx = useSurveyMapEngineContext();
  if (!ctx) {
    throw new Error(
      'useSurveyMapEngine must be used inside <SurveyMapEngineProvider> ' +
        '(survey map engine context, plan Phase 4)'
    );
  }
  return ctx;
}

export type {
  SurveyMapEngineContextValue,
  SurveyMapEngineExportApi,
  SurveyMapEnginePrintApi,
} from './SurveyMapEngineContext';
