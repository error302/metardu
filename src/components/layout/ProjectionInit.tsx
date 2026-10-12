'use client';

import { useEffect } from 'react';

/**
 * Registers the Kenyan cadastral projections (EPSG:21037/21036, WGS84 zones)
 * with proj4 + OpenLayers shortly after the shell mounts.
 *
 * This component deliberately does NOT statically import `@/lib/map/projection`:
 * that module pulls proj4 + ol/proj (~300 KB compressed) into every
 * authenticated route's initial bundle. Instead it imports it on idle, after
 * first paint, so map pages hydrate faster and non-map pages pay ~0 up front.
 *
 * Correctness: every real map entry point (useMapInit, SurveyMap, WorkspaceMap,
 * schemeLayer, layers, nativeProjectionView) awaits registerProjections()
 * itself before transforming, so a not-yet-fired prefetch can never break a
 * map. registerProjections() is idempotent, so a double call is harmless.
 */
export function ProjectionInit() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void import('@/lib/map/projection').then((m) => m.registerProjections());
    };
    if (typeof (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback === 'function') {
      const id = (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(run);
      // Belt-and-braces: don't let a never-idle page starve registration.
      const fallback = window.setTimeout(run, 2500);
      return () => {
        cancelled = true;
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
        window.clearTimeout(fallback);
      };
    }
    const t = window.setTimeout(run, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);
  return null;
}
