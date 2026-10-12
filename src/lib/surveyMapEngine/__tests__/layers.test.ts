/**
 * Phase 2 tests — layer registry (plan Phase 2 exit: "layer toggle logic no
 * longer duplicated across contexts"). Exercises the consolidated helpers
 * against fake OL layers so behaviour parity with the three legacy basemap
 * switch loops and two opacity loops is pinned.
 */
import type Map from 'ol/Map';
import { GRID_LAYER_ID } from '../ol/qaOverlays';
import {
  STANDARD_BASEMAP_IDS,
  LAYER_CONTROL_BASEMAP_IDS,
  applyOverlayOpacity,
  describeMapLayers,
  findLayerByBasemapId,
  isSatelliteOrCustomId,
  isStandardBasemapId,
  setLayerVisibleByLayerId,
  switchBasemapById,
  toggleLayerVisibleByBasemapId,
} from '@/lib/surveyMapEngine/ol/layers';

interface FakeLayer {
  props: Record<string, unknown>;
  visible: boolean;
  opacity: number;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  setVisible(visible: boolean): void;
  getVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
}

function fakeLayer(props: Record<string, unknown>, opts?: { visible?: boolean; opacity?: number }): FakeLayer {
  const layer: FakeLayer = {
    props: { ...props },
    visible: opts?.visible ?? true,
    opacity: opts?.opacity ?? 1,
    get(key) {
      return this.props[key];
    },
    set(key, value) {
      this.props[key] = value;
    },
    setVisible(visible) {
      this.visible = visible;
    },
    getVisible() {
      return this.visible;
    },
    setOpacity(opacity) {
      this.opacity = opacity;
    },
    getOpacity() {
      return this.opacity;
    },
  };
  return layer;
}

function fakeMap(layers: FakeLayer[]): Map {
  return {
    getLayers: () => ({ getArray: () => layers }),
  } as unknown as Map;
}

describe('switchBasemapById', () => {
  test('switches every tagged layer and leaves untagged layers untouched', () => {
    const osm = fakeLayer({ basemapId: 'osm' });
    const satellite = fakeLayer({ basemapId: 'satellite' }, { visible: false });
    const drawing = fakeLayer({ drawing: true }, { visible: true });
    const map = fakeMap([osm, satellite, drawing]);

    switchBasemapById(map, 'satellite');

    expect(osm.visible).toBe(false);
    expect(satellite.visible).toBe(true);
    expect(drawing.visible).toBe(true);
  });

  test('onlyIds restricts participation (LayerControl leaves dark/terrain/custom alone)', () => {
    const osm = fakeLayer({ basemapId: 'osm' });
    const blank = fakeLayer({ basemapId: 'blank' }, { visible: false });
    const dark = fakeLayer({ basemapId: 'dark' }, { visible: true });
    const custom = fakeLayer({ basemapId: 'custom-ortho' }, { visible: true });
    const map = fakeMap([osm, blank, dark, custom]);

    switchBasemapById(map, 'osm', { onlyIds: LAYER_CONTROL_BASEMAP_IDS });

    expect(osm.visible).toBe(true);
    expect(blank.visible).toBe(false);
    expect(dark.visible).toBe(true);
    expect(custom.visible).toBe(true);
  });

  test('onlyIds with the standard set matches useMapBasemaps legacy behaviour', () => {
    const osm = fakeLayer({ basemapId: 'osm' }, { visible: false });
    const blank = fakeLayer({ basemapId: 'blank' }, { visible: true });
    const terrain = fakeLayer({ basemapId: 'terrain' }, { visible: false });
    const map = fakeMap([osm, blank, terrain]);

    switchBasemapById(map, 'osm', { onlyIds: STANDARD_BASEMAP_IDS });

    expect(osm.visible).toBe(true);
    expect(blank.visible).toBe(true);
    expect(terrain.visible).toBe(false);
  });

  test('opacityForId applies even while the layer is hidden (legacy LayerControl parity)', () => {
    const osm = fakeLayer({ basemapId: 'osm' });
    const satellite = fakeLayer({ basemapId: 'satellite' }, { opacity: 1 });
    const map = fakeMap([osm, satellite]);

    switchBasemapById(map, 'osm', {
      onlyIds: LAYER_CONTROL_BASEMAP_IDS,
      opacityForId: 'satellite',
      opacity: 0.8,
    });

    expect(satellite.visible).toBe(false);
    expect(satellite.opacity).toBe(0.8);
    expect(osm.opacity).toBe(1);
  });

  test('untagged and restricted-out layers never receive setVisible', () => {
    const drawing = fakeLayer({ drawing: true }, { visible: true });
    const dark = fakeLayer({ basemapId: 'dark' }, { visible: true });
    const map = fakeMap([drawing, dark]);

    switchBasemapById(map, 'osm', { onlyIds: ['osm', 'satellite'] });

    expect(drawing.visible).toBe(true);
    expect(dark.visible).toBe(true);
  });
});

describe('applyOverlayOpacity + predicates', () => {
  test('isSatelliteOrCustomId matches satellite and custom-* only', () => {
    expect(isSatelliteOrCustomId('satellite')).toBe(true);
    expect(isSatelliteOrCustomId('custom-ortho-1')).toBe(true);
    expect(isSatelliteOrCustomId('osm')).toBe(false);
    expect(isSatelliteOrCustomId('terrain')).toBe(false);
  });

  test('isStandardBasemapId matches the shared standard set only', () => {
    for (const id of STANDARD_BASEMAP_IDS) expect(isStandardBasemapId(id)).toBe(true);
    expect(isStandardBasemapId('blank')).toBe(false);
    expect(isStandardBasemapId('custom-ortho')).toBe(false);
  });

  test('LayerControl predicate fades satellite + custom overlays, not basemaps', () => {
    const satellite = fakeLayer({ basemapId: 'satellite' });
    const custom = fakeLayer({ basemapId: 'custom-ortho' });
    const osm = fakeLayer({ basemapId: 'osm' });
    const map = fakeMap([satellite, custom, osm]);

    applyOverlayOpacity(map, 0.4, isSatelliteOrCustomId);

    expect(satellite.opacity).toBe(0.4);
    expect(custom.opacity).toBe(0.4);
    expect(osm.opacity).toBe(1);
  });

  test('/map predicate fades standard basemaps only and clamps out-of-range values', () => {
    const osm = fakeLayer({ basemapId: 'osm' });
    const custom = fakeLayer({ basemapId: 'custom-ortho' });
    const map = fakeMap([osm, custom]);

    applyOverlayOpacity(map, 2, isStandardBasemapId);

    expect(osm.opacity).toBe(1);
    expect(custom.opacity).toBe(1);

    applyOverlayOpacity(map, -0.5, isStandardBasemapId);
    expect(osm.opacity).toBe(0);
  });

  test('no predicate match leaves every layer untouched', () => {
    const satellite = fakeLayer({ basemapId: 'satellite' }, { opacity: 1 });
    applyOverlayOpacity(fakeMap([satellite]), 0.2, (id) => id === 'never');
    expect(satellite.opacity).toBe(1);
  });
});

describe('visibility helpers', () => {
  test('setLayerVisibleByLayerId toggles the grid layer and reports found', () => {
    const grid = fakeLayer({ layerId: GRID_LAYER_ID }, { visible: false });
    const other = fakeLayer({ layerId: 'other' }, { visible: true });
    const map = fakeMap([other, grid]);

    expect(setLayerVisibleByLayerId(map, GRID_LAYER_ID, true)).toBe(true);
    expect(grid.visible).toBe(true);
    expect(other.visible).toBe(true);

    expect(setLayerVisibleByLayerId(map, 'missing', false)).toBe(false);
    expect(other.visible).toBe(true);
  });

  test('toggleLayerVisibleByBasemapId flips visibility and returns the new state', () => {
    const custom = fakeLayer({ basemapId: 'custom-ortho' }, { visible: true });
    const map = fakeMap([custom]);

    expect(toggleLayerVisibleByBasemapId(map, 'custom-ortho')).toBe(false);
    expect(custom.visible).toBe(false);
    expect(toggleLayerVisibleByBasemapId(map, 'custom-ortho')).toBe(true);
    expect(custom.visible).toBe(true);
  });

  test('toggleLayerVisibleByBasemapId returns undefined when the layer is absent', () => {
    expect(toggleLayerVisibleByBasemapId(fakeMap([]), 'custom-ortho')).toBeUndefined();
  });

  test('findLayerByBasemapId locates tagged layers only', () => {
    const satellite = fakeLayer({ basemapId: 'satellite' });
    const map = fakeMap([fakeLayer({ basemapId: 'osm' }), satellite]);
    expect(findLayerByBasemapId(map, 'satellite')).toBe(satellite);
    expect(findLayerByBasemapId(map, 'dark')).toBeNull();
  });
});

describe('describeMapLayers registry read', () => {
  test('describes basemaps, grid, custom overlays and skips untagged layers', () => {
    const osm = fakeLayer({ basemapId: 'osm', title: 'Street Map' }, { visible: true, opacity: 1 });
    const grid = fakeLayer({ layerId: GRID_LAYER_ID }, { visible: false });
    const custom = fakeLayer({ basemapId: 'custom-ortho' }, { visible: true, opacity: 0.6 });
    const drawing = fakeLayer({ drawing: true }, { visible: true });
    const descriptors = describeMapLayers(fakeMap([osm, grid, custom, drawing]));

    expect(descriptors).toEqual([
      { id: 'osm', title: 'Street Map', visible: true, kind: 'basemap', opacity: 1 },
      { id: GRID_LAYER_ID, title: GRID_LAYER_ID, visible: false, kind: 'grid', opacity: 1 },
      { id: 'custom-ortho', title: 'custom-ortho', visible: true, kind: 'overlay', opacity: 0.6 },
    ]);
  });

  test('untagged layers produce no descriptor', () => {
    expect(describeMapLayers(fakeMap([fakeLayer({ drawing: true })]))).toEqual([]);
  });
});
