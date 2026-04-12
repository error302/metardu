export async function createOSMLayer() {
  const { default: TileLayer } = await import('ol/layer/Tile');
  const { default: OSM } = await import('ol/source/OSM');
  return new TileLayer({ source: new OSM(), zIndex: 0 });
}

export async function createParcelLayer(
  coords3857: Array<[number, number]>
): Promise<import('ol/layer/Vector').default> {
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: Polygon },
    { default: Style },
    { default: Stroke },
    { default: Fill },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Polygon'),
    import('ol/style/Style'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
  ]);

  const polygon = new Polygon([coords3857]);
  const feature = new Feature({ geometry: polygon, type: 'parcel' });

  const source = new VectorSource({ features: [feature] });

  return new VectorLayer({
    source,
    zIndex: 2,
    style: new Style({
      stroke: new Stroke({ color: '#1B3A5C', width: 2.5 }),
      fill: new Fill({ color: 'rgba(27, 58, 92, 0.08)' }),
    }),
  });
}

export async function createBeaconLayer(
  stations: Array<{ label: string; coord3857: [number, number] }>
): Promise<import('ol/layer/Vector').default> {
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: Point },
    { default: Style },
    { default: CircleStyle },
    { default: Stroke },
    { default: Fill },
    { default: Text },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/Circle'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
  ]);

  const features = stations.map(({ label, coord3857 }) => {
    const f = new Feature({ geometry: new Point(coord3857), label });
    f.setStyle(new Style({
      image: new CircleStyle({
        radius: 6,
        stroke: new Stroke({ color: '#1B3A5C', width: 2 }),
        fill: new Fill({ color: '#FFFFFF' }),
      }),
      text: new Text({
        text: label,
        offsetX: 10,
        offsetY: -10,
        font: 'bold 11px Calibri, sans-serif',
        fill: new Fill({ color: '#1B3A5C' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 3 }),
      }),
    }));
    return f;
  });

  const source = new VectorSource({ features });
  return new VectorLayer({ source, zIndex: 3 });
}

export async function createKenCORSLayer(
  stations: Array<{ id: string; name: string; coord3857: [number, number]; distanceKm: number; status: string }>
): Promise<import('ol/layer/Vector').default> {
  const [
    { default: VectorLayer },
    { default: VectorSource },
    { default: Feature },
    { default: Point },
    { default: Style },
    { default: RegularShape },
    { default: Stroke },
    { default: Fill },
    { default: Text },
  ] = await Promise.all([
    import('ol/layer/Vector'),
    import('ol/source/Vector'),
    import('ol/Feature'),
    import('ol/geom/Point'),
    import('ol/style/Style'),
    import('ol/style/RegularShape'),
    import('ol/style/Stroke'),
    import('ol/style/Fill'),
    import('ol/style/Text'),
  ]);

  const features = stations.map(({ id, name, coord3857, distanceKm, status }) => {
    const f = new Feature({ geometry: new Point(coord3857), id, name, distanceKm });
    f.setStyle(new Style({
      image: new RegularShape({
        points: 3,
        radius: 8,
        stroke: new Stroke({ color: status === 'active' ? '#006400' : '#888888', width: 2 }),
        fill: new Fill({ color: status === 'active' ? 'rgba(0,100,0,0.15)' : 'rgba(136,136,136,0.15)' }),
      }),
      text: new Text({
        text: `${id}\n${distanceKm.toFixed(1)} km`,
        offsetY: 18,
        font: '10px Calibri, sans-serif',
        fill: new Fill({ color: status === 'active' ? '#006400' : '#888888' }),
        stroke: new Stroke({ color: '#FFFFFF', width: 2 }),
        textAlign: 'center',
      }),
    }));
    return f;
  });

  const source = new VectorSource({ features });
  return new VectorLayer({ source, zIndex: 1 });
}