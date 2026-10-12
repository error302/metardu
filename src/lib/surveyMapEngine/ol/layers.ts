/**
 * SurveyMapEngine layer registry (plan §3.1 / Phase 2).
 *
 * Single implementation of the layer-toggle logic that was previously
 * duplicated across LayerControl, useMapBasemaps, useMapInteractions and
 * WorkspaceMap (three basemap-switch loops, two opacity loops). Pure
 * OpenLayers — no React.
 *
 * Layer-creation factories stay in `lib/map` until later adoption phases;
 * this module owns reads (describeMapLayers / findLayerByBasemapId) and
 * mutations (switchBasemapById / applyOverlayOpacity / visibility toggles).
 */
import type Map from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import { GRID_LAYER_ID } from './qaOverlays';
import type { LayerDescriptor, LayerKind } from '../core/types';

/** Basemap ids shared by the /map basemap creation and workspace basemaps. */
export const STANDARD_BASEMAP_IDS = ['osm', 'satellite', 'dark', 'terrain'] as const;
/** Basemap ids the LayerControl panel manages; other layers stay untouched. */
export const LAYER_CONTROL_BASEMAP_IDS = ['osm', 'satellite', 'blank'] as const;

export interface SwitchBasemapOptions {
  /** Only these basemapId values participate; every other layer is left untouched. */
  onlyIds?: readonly string[];
  /** Apply `opacity` to this basemapId when visited (legacy LayerControl parity: applied even while hidden). */
  opacityForId?: string;
  /** Opacity 0..1; honoured only together with `opacityForId`. */
  opacity?: number;
}

export function switchBasemapById(map: Map, mode: string, options?: SwitchBasemapOptions): void {
  const { onlyIds, opacityForId, opacity } = options ?? {};
  for (const layer of map.getLayers().getArray()) {
    const id = layer.get('basemapId') as string | undefined;
    if (!id) continue;
    if (onlyIds && !onlyIds.includes(id)) continue;
    layer.setVisible(id === mode);
    if (opacity !== undefined && opacityForId !== undefined && id === opacityForId) {
      layer.setOpacity(opacity);
    }
  }
}

export function applyOverlayOpacity(map: Map, opacity01: number, matches: (basemapId: string) => boolean): void {
  const opacity = Math.max(0, Math.min(1, opacity01));
  for (const layer of map.getLayers().getArray()) {
    const id = layer.get('basemapId') as string | undefined;
    if (id && matches(id)) layer.setOpacity(opacity);
  }
}

export const isStandardBasemapId = (basemapId: string): boolean =>
  (STANDARD_BASEMAP_IDS as readonly string[]).includes(basemapId);

export const isSatelliteOrCustomId = (basemapId: string): boolean =>
  basemapId === 'satellite' || basemapId.startsWith('custom-');

export function findLayerByBasemapId(map: Map, basemapId: string): BaseLayer | null {
  for (const layer of map.getLayers().getArray()) {
    if (layer.get('basemapId') === basemapId) return layer;
  }
  return null;
}

/** Set visibility of the first layer carrying `layerId`; returns whether one was found. */
export function setLayerVisibleByLayerId(map: Map, layerId: string, visible: boolean): boolean {
  for (const layer of map.getLayers().getArray()) {
    if (layer.get('layerId') === layerId) {
      layer.setVisible(visible);
      return true;
    }
  }
  return false;
}

/** Toggle the first layer carrying `basemapId`; returns the new visibility, or undefined when absent. */
export function toggleLayerVisibleByBasemapId(map: Map, basemapId: string): boolean | undefined {
  for (const layer of map.getLayers().getArray()) {
    if (layer.get('basemapId') === basemapId) {
      const next = !layer.getVisible();
      layer.setVisible(next);
      return next;
    }
  }
  return undefined;
}

export function describeMapLayers(map: Map): LayerDescriptor[] {
  const descriptors: LayerDescriptor[] = [];
  for (const layer of map.getLayers().getArray()) {
    const basemapId = layer.get('basemapId') as string | undefined;
    const layerId = layer.get('layerId') as string | undefined;
    const id = basemapId ?? layerId;
    if (!id) continue;
    const kind: LayerKind =
      basemapId && !basemapId.startsWith('custom-')
        ? 'basemap'
        : layerId === GRID_LAYER_ID
          ? 'grid'
          : 'overlay';
    const title = (layer.get('title') as string | undefined) ?? id;
    descriptors.push({ id, title, visible: layer.getVisible(), kind, opacity: layer.getOpacity() });
  }
  return descriptors;
}
