declare global {
  namespace L {
    const icon: (options: any) => any;
    const Icon: {
      Default: {
        prototype: { _getIconUrl: any };
        mergeOptions: (options: any) => void;
      };
    };
    const divIcon: (options: any) => any;
    const Control: any;
    const control: {
      layers: (base: any, overlay?: any) => any;
    };
    const tileLayer: (url: string, options?: any) => any;
    const polygon: (latlngs: any, options?: any) => any;
    const polyline: (latlngs: any, options?: any) => any;
    const marker: (latlng: any, options?: any) => any;
    const circleMarker: (latlng: any, options?: any) => any;
    const point: (x: number, y: number) => any;
    const latLngBounds: (latlngs: any) => any;
    const LatLngBounds: any;
    const Bounds: any;
    const Point: any;
    const LatLng: any;
    const DomUtil: any;
  }
}

declare module 'leaflet' {
  const L: any;
  export default L;
  export { L };
}

declare module 'react-leaflet' {
  import { FC, ReactNode } from 'react';
  export const MapContainer: FC<any>;
  export const TileLayer: FC<any>;
  export const Marker: FC<any>;
  export const CircleMarker: FC<any>;
  export const Popup: FC<any>;
  export const Tooltip: FC<any>;
  export const Polyline: FC<any>;
  export const Polygon: FC<any>;
  export const useMap: () => any;
  export const useMapEvents: (events: any) => void;
  export const LayersControl: FC<any> & { BaseLayer: FC<any> };
  export const BaseLayer: FC<any>;
}

declare module 'react-leaflet-cluster' {
  const MarkerClusterGroup: FC<any>;
  export default MarkerClusterGroup;
}

declare module 'leaflet/dist/leaflet.css' {
  const content: string;
  export default content;
}