'use client';
// HARD RULE: dynamic import with ssr:false required — OpenLayers uses window/document
import { useEffect, useRef } from 'react';
import { MapLayer, FieldBeacon, FieldParcel } from '@/types/field';

interface Props {
  layers: MapLayer[];
  beacons: FieldBeacon[];
  parcels: FieldParcel[];
  onMapClick?: (lat: number, lng: number) => void;
}

export default function MapViewer({ layers, beacons, parcels, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    // Dynamic imports — OpenLayers is browser-only
    Promise.all([
      import('ol/Map'),
      import('ol/View'),
      import('ol/layer/Tile'),
      import('ol/layer/Vector'),
      import('ol/source/OSM'),
      import('ol/source/Vector'),
      import('ol/format/GeoJSON'),
      import('ol/format/KML'),
      import('ol/geom/Point'),
      import('ol/geom/Polygon'),
      import('ol/Feature'),
      import('ol/style'),
      import('ol/proj'),
      import('ol/coordinate'),
      import('ol/css'),
    ]).then(([
      { default: Map },
      { default: View },
      { default: TileLayer },
      { default: VectorLayer },
      { default: OSM },
      { default: VectorSource },
      { default: GeoJSONFormat },
      { default: KMLFormat },
      { default: Point },
      { default: Polygon },
      { default: Feature },
      { Style, Circle, Fill, Stroke, Text },
      proj,
      coordinate,
    ]) => {
      if (!containerRef.current) return;
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }

      // Nairobi default center — EPSG:4326 → EPSG:3857
      const defaultCenter = proj.fromLonLat([36.817223, -1.286389]);

      // Base OSM tile layer
      const baseLayer = new TileLayer({ source: new OSM() });

      // GeoJSON / KML vector layers
      const vectorLayers = layers
        .filter(l => l.visible && l.geojson)
        .map(l => {
          const features = new GeoJSONFormat().readFeatures(l.geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });
          return new VectorLayer({
            source: new VectorSource({ features }),
            style: new Style({
              stroke: new Stroke({ color: '#3b82f6', width: 2 }),
              fill: new Fill({ color: 'rgba(59,130,246,0.1)' }),
            }),
          });
        });

      // Beacon point layer
      const beaconFeatures = beacons.map(b => {
        const f = new Feature({
          geometry: new Point(proj.fromLonLat([b.coordinate.lng, b.coordinate.lat])),
          label: b.label,
          type: b.beaconType,
        });
        return f;
      });

      const beaconLayer = new VectorLayer({
        source: new VectorSource({ features: beaconFeatures }),
        style: (feature) => new Style({
          image: new Circle({
            radius: 8,
            fill: new Fill({ color: '#f59e0b' }),
            stroke: new Stroke({ color: '#ffffff', width: 2 }),
          }),
          text: new Text({
            text: feature.get('label'),
            offsetY: -16,
            fill: new Fill({ color: '#f59e0b' }),
            stroke: new Stroke({ color: '#000', width: 3 }),
            font: 'bold 12px monospace',
          }),
        }),
      });

      // Parcel polygon layer
      const parcelFeatures = parcels
        .filter(p => p.walkPoints.length >= 3)
        .map(p => {
          const coords = p.walkPoints.map(wp =>
            proj.fromLonLat([wp.coordinate.lng, wp.coordinate.lat])
          );
          coords.push(coords[0]); // close ring

          const f = new Feature({
            geometry: new Polygon([coords]),
            label: p.label,
            areaHa: p.computedAreaM2 ? (p.computedAreaM2 / 10000).toFixed(4) : '',
          });
          return f;
        });

      const parcelLayer = new VectorLayer({
        source: new VectorSource({ features: parcelFeatures }),
        style: new Style({
          stroke: new Stroke({ color: '#10b981', width: 2 }),
          fill: new Fill({ color: 'rgba(16,185,129,0.08)' }),
        }),
      });

      const map = new Map({
        target: containerRef.current,
        layers: [baseLayer, ...vectorLayers, parcelLayer, beaconLayer],
        view: new View({
          center: defaultCenter,
          zoom: 13,
          projection: 'EPSG:3857',
        }),
      });

      // Fit to beacon extent if beacons exist
      if (beaconFeatures.length > 0) {
        const extent = beaconLayer.getSource()!.getExtent();
        map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 17 });
      } else if (parcelFeatures.length > 0) {
        const extent = parcelLayer.getSource()!.getExtent();
        map.getView().fit(extent, { padding: [60, 60, 60, 60], maxZoom: 17 });
      }

      // Map click handler — convert EPSG:3857 → WGS84
      if (onMapClick) {
        map.on('click', (e: any) => {
          const [lng, lat] = proj.toLonLat(e.coordinate);
          onMapClick(lat, lng);
        });
      }

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }
    };
  }, [layers, beacons, parcels, onMapClick]);

  return <div ref={containerRef} className="w-full h-full z-0" />;
}
