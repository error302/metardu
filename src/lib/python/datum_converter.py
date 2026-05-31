import sys
import json
from pyproj import Transformer

# WGS84 UTM Zone 37N (EPSG:32637) <-> ARC1960 UTM Zone 37S (EPSG:21037)
# Survey data in UTM easting/northing — use UTM-to-UTM transformation
# NOT geographic (EPSG:4326) which requires lon/lat inputs

def wgs84_utm_to_arc1960_utm37(easting: float, northing: float) -> dict:
    transformer = Transformer.from_crs('EPSG:32637', 'EPSG:21037', always_xy=True)
    e_out, n_out = transformer.transform(easting, northing)
    return {'easting': round(e_out, 3), 'northing': round(n_out, 3), 'datum': 'ARC1960', 'epsg': 21037}

def arc1960_utm_to_wgs84_utm37(easting: float, northing: float) -> dict:
    transformer = Transformer.from_crs('EPSG:21037', 'EPSG:32637', always_xy=True)
    e_out, n_out = transformer.transform(easting, northing)
    return {'easting': round(e_out, 3), 'northing': round(n_out, 3), 'datum': 'WGS84', 'epsg': 32637}

def batch_convert(coords: list, from_datum: str, to_datum: str) -> list:
    results = []
    for c in coords:
        e = c.get('easting', 0)
        n = c.get('northing', 0)
        cid = c.get('id', '')
        if from_datum in ('WGS84', 'WGS84_UTM') and to_datum == 'ARC1960':
            r = wgs84_utm_to_arc1960_utm37(e, n)
            results.append({'id': cid, 'easting': r['easting'], 'northing': r['northing'], 'datum': r['datum'], 'epsg': r['epsg']})
        elif from_datum == 'ARC1960' and to_datum in ('WGS84', 'WGS84_UTM'):
            r = arc1960_utm_to_wgs84_utm37(e, n)
            results.append({'id': cid, 'easting': r['easting'], 'northing': r['northing'], 'datum': r['datum'], 'epsg': r['epsg']})
        else:
            results.append(c)
    return results

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Convert between WGS84 UTM Zone 37N and ARC1960 UTM Zone 37S')
    parser.add_argument('--coords', type=str, required=True, help='JSON array of {easting, northing, id}')
    parser.add_argument('--from', dest='from_datum', default='WGS84', choices=['WGS84', 'WGS84_UTM', 'ARC1960'], help='Source datum')
    parser.add_argument('--to', dest='to_datum', default='ARC1960', choices=['WGS84', 'WGS84_UTM', 'ARC1960'], help='Target datum')
    args = parser.parse_args()
    coords = json.loads(args.coords)
    results = batch_convert(coords, args.from_datum, args.to_datum)
    print(json.dumps(results))
