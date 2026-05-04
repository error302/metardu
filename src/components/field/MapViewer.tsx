'use client';
import { useEffect, useRef } from 'react';
import { MapLayer, FieldBeacon, FieldParcel, GeoPDFLayer, MBTilesSession } from '@/types/field';

interface Props {
  layers: MapLayer[];
  beacons: FieldBeacon[];
  parcels: FieldParcel[];
  geoPDFLayers?: GeoPDFLayer[];
  mbtilesSessions?: MBTilesSession[];
  onMapClick?: (lat: number, lng: number) => void;
}

export default function MapViewer({ layers, beacons, parcels, geoPDFLayers, mbtilesSessions, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let mounted = true;

    async function initMap() {
      try {
        // Inject OpenLayers CSS via link tag (dynamic import of CSS crashes in Next.js)
        if (!document.querySelector('link[href*="ol/ol.css"]')) {
          try { await import('ol/ol.css' as any); } catch {
            // Fallback: inject from CDN if bundler CSS import fails
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/ol@10.8.0/ol.css';
            document.head.appendChild(link);
          }
        }
        
        // Import OpenLayers modules individually
        const { default: Map } = await import('ol/Map');
        const { default: View } = await import('ol/View');
        const { default: TileLayer } = await import('ol/layer/Tile');
        const { default: VectorLayer } = await import('ol/layer/Vector');
        const { default: OSM } = await import('ol/source/OSM');
        const { default: VectorSource } = await import('ol/source/Vector');
        const { default: GeoJSONFormat } = await import('ol/format/GeoJSON');
        const { default: Feature } = await import('ol/Feature');
        const { default: Point } = await import('ol/geom/Point');
        const { default: Polygon } = await import('ol/geom/Polygon');
        const { default: Style } = await import('ol/style/Style');
        const { default: CircleStyle } = await import('ol/style/Circle');
        const { default: Fill } = await import('ol/style/Fill');
        const { default: Stroke } = await import('ol/style/Stroke');
        const { default: TextStyle } = await import('ol/style/Text');
        const { fromLonLat, toLonLat } = await import('ol/proj');

        if (!mounted || !containerRef.current) return;

        // Cleanup previous map
        if (mapRef.current) {
          mapRef.current.setTarget(undefined);
          mapRef.current = null;
        }

        // Nairobi default center
        const defaultCenter = fromLonLat([36.817223, -1.286389]);

        // Base OSM tile layer
        const baseLayer = new TileLayer({ source: new OSM() });

        // GeoJSON vector layers
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
            geometry: new Point(fromLonLat([b.coordinate.lng, b.coordinate.lat])),
          });
          f.set('label', b.label);
          return f;
        });

        const beaconLayer = new VectorLayer({
          source: new VectorSource({ features: beaconFeatures }),
          style: (feature: any) => new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color: '#f59e0b' }),
              stroke: new Stroke({ color: '#ffffff', width: 2 }),
            }),
            text: new TextStyle({
              text: feature.get('label') || '',
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
              fromLonLat([wp.coordinate.lng, wp.coordinate.lat])
            );
            coords.push(coords[0]);
            const f = new Feature({ geometry: new Polygon([coords]) });
            f.set('label', p.label);
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
          }),
        });

        // Fit to data extent
        if (beaconFeatures.length > 0) {
          const src = beaconLayer.getSource();
          if (src) map.getView().fit(src.getExtent(), { padding: [60, 60, 60, 60], maxZoom: 17 });
        } else if (parcelFeatures.length > 0) {
          const src = parcelLayer.getSource();
          if (src) map.getView().fit(src.getExtent(), { padding: [60, 60, 60, 60], maxZoom: 17 });
        }

        // Map click handler
        if (onMapClick) {
          map.on('click', (e: any) => {
            const [lng, lat] = toLonLat(e.coordinate);
            onMapClick(lat, lng);
          });
        }

        // GeoPDF layers
        if (geoPDFLayers?.length) {
          const { buildOLGeoPDFLayer } = await import('@/lib/field/geopdf');
          geoPDFLayers.filter(g => g.visible && g.gcps.length === 4).forEach(g => {
            map.addLayer(buildOLGeoPDFLayer(g));
          });
        }

        // MBTiles layers
        if (mbtilesSessions?.length) {
          const { buildOLMBTilesLayer } = await import('@/lib/field/mbtiles');
          mbtilesSessions.forEach(s => {
            map.addLayer(buildOLMBTilesLayer(s));
          });
        }

        mapRef.current = map;
      } catch (err) {
        console.error('[MapViewer] Init error:', err);
      }
    }

    initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.setTarget(undefined);
        mapRef.current = null;
      }
    };
  }, [layers, beacons, parcels, geoPDFLayers, mbtilesSessions, onMapClick]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '400px' }} />;
}
