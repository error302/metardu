import json
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict, Any
import sys

def load_points(data: List[Dict]) -> np.ndarray:
    coords = []
    for p in data:
        coords.append([p.get('easting', 0), p.get('northing', 0), p.get('elevation', 0) or 0])
    return np.array(coords)

def detect_outliers(points: np.ndarray, contamination: float = 0.05) -> List[int]:
    if len(points) < 10:
        return []
    try:
        iso = IsolationForest(contamination=contamination, random_state=42)
        preds = iso.fit_predict(points)
        return [i for i, p in enumerate(preds) if p == -1]
    except Exception:
        return []

def detect_elevation_jumps(points: np.ndarray, threshold: float = 1.0) -> List[int]:
    jumps = []
    elevations = points[:, 2]
    for i in range(1, len(elevations)):
        if abs(elevations[i] - elevations[i-1]) > threshold:
            jumps.append(i)
    return jumps

def detect_duplicates(points: np.ndarray, tol: float = 0.01) -> List[int]:
    dupes = []
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if np.allclose(points[i], points[j], atol=tol):
                dupes.append(j)
    return list(set(dupes))

def classify_points(points: np.ndarray) -> List[str]:
    classifications = []
    for p in points:
        elev = p[2]
        if elev < 0.5:
            classifications.append('ground')
        else:
            classifications.append('uncertain')
    return classifications

def clean_survey_data(raw_data: List[Dict], data_type: str, options: Dict = None) -> Dict:
    options = options or {}
    points = load_points(raw_data)
    
    outliers = detect_outliers(points)
    elev_jumps = detect_elevation_jumps(points)
    duplicates = detect_duplicates(points)
    
    classifications = classify_points(points) if data_type == 'lidar' else ['uncertain'] * len(points)
    
    cleaned = []
    anomalies = []
    confidence_scores = {}
    
    for i, pt in enumerate(raw_data):
        is_outlier = i in outliers
        is_dupe = i in duplicates
        
        cleaned_pt = {
            'id': pt.get('id', str(i)),
            'easting': pt.get('easting', 0),
            'northing': pt.get('northing', 0),
            'elevation': pt.get('elevation'),
            'code': pt.get('code', ''),
            'cleaned': not is_outlier and not is_dupe,
            'confidence': 0.95 if not is_outlier else 0.3,
            'classification': classifications[i] if i < len(classifications) else 'uncertain'
        }
        cleaned.append(cleaned_pt)
        
        confidence_scores[str(i)] = cleaned_pt['confidence']
        
        if is_outlier:
            anomalies.append({
                'point_id': str(i),
                'type': 'outlier',
                'severity': 'high',
                'description': f'Point {i} flagged as statistical outlier'
            })
        if i in elev_jumps:
            anomalies.append({
                'point_id': str(i),
                'type': 'elevation_jump',
                'severity': 'medium',
                'description': f'Elevation jump detected at point {i}'
            })
        if is_dupe:
            anomalies.append({
                'point_id': str(i),
                'type': 'duplicate',
                'severity': 'low',
                'description': f'Point {i} is duplicate'
            })
    
    return {
        'cleaned_points': cleaned,
        'anomalies': anomalies,
        'confidence_scores': confidence_scores,
        'summary': {
            'total_points': len(raw_data),
            'outliers_removed': len(outliers),
            'duplicates_removed': len(duplicates),
            'classified_count': sum(1 for c in classifications if c != 'uncertain'),
            'confidence_avg': float(np.mean(list(confidence_scores.values()))) if confidence_scores else 0.0
        }
    }

if __name__ == '__main__':
    try:
        input_data = json.loads(sys.stdin.read())
        result = clean_survey_data(
            input_data.get('points', []),
            input_data.get('data_type', 'gnss'),
            input_data.get('options', {})
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
