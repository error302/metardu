import json
import sys
from typing import List, Dict, Any
from shapely.geometry import Polygon
from shapely.ops import unary_union

def calculate_polygon_area(points: List[List[float]]) -> float:
    if len(points) < 3:
        return 0.0
    poly = Polygon(points)
    return abs(poly.area)

def detect_overlaps(new_boundary: Dict, historical: List[Dict]) -> List[Dict]:
    overlaps = []
    coords = new_boundary.get('points', [])
    if not coords:
        return overlaps
    
    new_poly = Polygon(coords)
    if not new_poly.is_valid:
        new_poly = new_poly.buffer(0)
    
    for i, hist in enumerate(historical):
        hist_coords = hist.get('points', [])
        if not hist_coords:
            continue
        hist_poly = Polygon(hist_coords)
        if not hist_poly.is_valid:
            hist_poly = hist_poly.buffer(0)
        
        if new_poly.intersects(hist_poly):
            intersection = new_poly.intersection(hist_poly)
            if not intersection.is_empty and intersection.area > 0.01:
                area = intersection.area
                severity = 'severe' if area > 100 else 'moderate' if area > 10 else 'minor'
                overlaps.append({
                    'id': f'overlap_{i}',
                    'area': round(area, 2),
                    'coordinates': [{'easting': c[0], 'northing': c[1]} for c in list(intersection.exterior.coords)[:-1]],
                    'severity': severity,
                    'description': f'Overlapping area of {round(area, 2)} sq meters with historical parcel'
                })
    return overlaps

def detect_gaps(new_boundary: Dict, historical: List[Dict]) -> List[Dict]:
    if not historical:
        return []
    
    gaps = []
    coords = new_boundary.get('points', [])
    if not coords:
        return gaps
    
    new_poly = Polygon(coords)
    if not new_poly.is_valid:
        new_poly = new_poly.buffer(0)
    
    existing_polys = []
    for hist in historical:
        hist_coords = hist.get('points', [])
        if hist_coords:
            hp = Polygon(hist_coords)
            if hp.is_valid:
                existing_polys.append(hp)
    
    if not existing_polys:
        return []
    
    existing = unary_union(existing_polys)
    difference = new_poly.difference(existing)
    
    if difference.is_empty:
        return []
    
    diffs = [difference] if difference.geom_type == 'Polygon' else list(difference.geoms) if difference.geom_type == 'MultiPolygon' else []
    
    for i, diff in enumerate(diffs):
        if diff.area > 1:
            severity = 'severe' if diff.area > 100 else 'moderate' if diff.area > 10 else 'minor'
            gaps.append({
                'id': f'gap_{i}',
                'area': round(diff.area, 2),
                'coordinates': [{'easting': c[0], 'northing': c[1]} for c in list(diff.exterior.coords)[:-1]],
                'severity': severity,
                'description': f'Gap of {round(diff.area, 2)} sq meters not covered by historical parcels'
            })
    
    return gaps

def calculate_dispute_score(overlaps: List[Dict], gaps: List[Dict], boundary_area: float) -> int:
    if boundary_area == 0:
        return 100
    
    overlap_penalty = sum(min(o['area'] / boundary_area * 100, 30) for o in overlaps)
    gap_penalty = sum(min(g['area'] / boundary_area * 100, 25) for g in gaps)
    
    score = max(0, min(100, 100 - overlap_penalty - gap_penalty))
    return int(score)

def validate_cadastra(boundary: Dict, historical: List[Dict] = None) -> Dict:
    historical = historical or []
    
    points_list = boundary.get('points', [])
    boundary_area = calculate_polygon_area(points_list)
    
    overlaps = detect_overlaps(boundary, historical)
    gaps = detect_gaps(boundary, historical)
    score = calculate_dispute_score(overlaps, gaps, boundary_area)
    
    total_overlap = sum(o['area'] for o in overlaps)
    total_gap = sum(g['area'] for g in gaps)
    
    risk = 'high' if score < 50 else 'medium' if score < 75 else 'low'
    
    return {
        'score': score,
        'overlaps': overlaps,
        'gaps': gaps,
        'summary': {
            'total_overlap_area': round(total_overlap, 2),
            'total_gap_area': round(total_gap, 2),
            'risk_level': risk,
            'boundary_area': round(boundary_area, 2)
        }
    }

if __name__ == '__main__':
    try:
        input_data = json.loads(sys.stdin.read())
        boundary = input_data.get('boundary', {})
        historical = input_data.get('historical', [])
        result = validate_cadastra(boundary, historical)
        print(json.dumps({'validation': result}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
