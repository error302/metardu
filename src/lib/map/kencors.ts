export interface KenCORSStation {
  id: string;
  name: string;
  easting: number;
  northing: number;
  county: string;
  status: 'active' | 'inactive';
}

export const KENCORS_STATIONS: KenCORSStation[] = [
  { id: 'NRB1', name: 'Nairobi',     easting: 261518, northing: 9859340, county: 'Nairobi',   status: 'active' },
  { id: 'MSA1', name: 'Mombasa',     easting: 534850, northing: 9644920, county: 'Mombasa',   status: 'active' },
  { id: 'KSM1', name: 'Kisumu',      easting: 163400, northing: 9934220, county: 'Kisumu',    status: 'active' },
  { id: 'NYR1', name: 'Nyeri',       easting: 263200, northing: 9916800, county: 'Nyeri',     status: 'active' },
  { id: 'ELD1', name: 'Eldoret',     easting: 193600, northing: 9981200, county: 'Uasin Gishu', status: 'active' },
  { id: 'NKR1', name: 'Nakuru',      easting: 213100, northing: 9950600, county: 'Nakuru',    status: 'active' },
  { id: 'GRS1', name: 'Garissa',     easting: 498700, northing: 9950200, county: 'Garissa',   status: 'active' },
  { id: 'KTI1', name: 'Kitui',       easting: 370800, northing: 9870100, county: 'Kitui',     status: 'active' },
  { id: 'MRU1', name: 'Meru',        easting: 329600, northing: 9962000, county: 'Meru',      status: 'active' },
  { id: 'MLD1', name: 'Malindi',     easting: 569200, northing: 9745600, county: 'Kilifi',    status: 'active' },
  { id: 'KJD1', name: 'Kajado',      easting: 236800, northing: 9807400, county: 'Kajiado',   status: 'inactive' },
  { id: 'THK1', name: 'Thika',       easting: 278900, northing: 9888000, county: 'Kiambu',    status: 'active' },
];

export function nearestKenCORSStations(
  centroidEasting: number,
  centroidNorthing: number,
  n: number = 3
): Array<KenCORSStation & { distanceKm: number }> {
  return KENCORS_STATIONS
    .map(station => {
      const dE = station.easting - centroidEasting;
      const dN = station.northing - centroidNorthing;
      const distanceKm = Math.sqrt(dE * dE + dN * dN) / 1000;
      return { ...station, distanceKm };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}