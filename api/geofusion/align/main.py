import json
import numpy as np
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

class ControlPoint(BaseModel):
    source: Dict[str, float]
    target: Dict[str, float]
    weight: Optional[float] = 1.0

class AlignRequest(BaseModel):
    source_data: Dict[str, Any]
    target_data: Optional[Dict[str, Any]] = None
    transform_type: str = "affine"
    control_points: Optional[List[ControlPoint]] = None
    params: Optional[Dict[str, float]] = None

class AlignResponse(BaseModel):
    transformed_data: Dict[str, Any]
    transform_matrix: List[List[float]]
    accuracy_score: float
    residuals: List[float]

def compute_affine_transform(control_points: List[ControlPoint]) -> tuple:
    n = len(control_points)
    A = np.zeros((2 * n, 6))
    b = np.zeros((2 * n, 1))
    
    for i, cp in enumerate(control_points):
        sx, sy = cp.source['x'], cp.source['y']
        tx, ty = cp.target['x'], cp.target['y']
        w = cp.weight
        
        A[2*i] = [sx, sy, 1, 0, 0, 0]
        A[2*i + 1] = [0, 0, 0, sx, sy, 1]
        b[2*i] = tx * w
        b[2*i + 1] = ty * w
    
    x, residuals, rank, s = np.linalg.lstsq(A, b, rcond=None)
    return x.reshape(2, 3), residuals

def compute_similarity_transform(control_points: List[ControlPoint]) -> tuple:
    n = len(control_points)
    sx_sum = sy_sum = tx_sum = ty_sum = 0
    dx_sum = dy_sum = 0
    
    for cp in control_points:
        sx, sy = cp.source['x'], cp.source['y']
        tx, ty = cp.target['x'], cp.target['y']
        w = cp.weight
        
        sx_sum += w * sx
        sy_sum += w * sy
        tx_sum += w * tx
        ty_sum += w * ty
        dx_sum += w * (tx * sx + ty * sy)
        dy_sum += w * (ty * sx - tx * sy)
    
    ss = sum(cp.weight * (cp.source['x']**2 + cp.source['y']**2) for cp in control_points)
    s = np.sqrt(dx_sum**2 + dy_sum**2) / ss if ss > 0 else 1
    
    theta = np.arctan2(dy_sum, dx_sum)
    
    a = s * np.cos(theta)
    b = s * np.sin(theta)
    
    tx = (tx_sum - a * sx_sum + b * sy_sum) / n
    ty = (ty_sum - b * sx_sum - a * sy_sum) / n
    
    transform_matrix = [[a, -b, tx], [b, a, ty]]
    residuals = []
    
    return transform_matrix, residuals

def compute_helmert_transform(control_points: List[ControlPoint]) -> tuple:
    n = len(control_points)
    A = np.zeros((2 * n, 4))
    b = np.zeros((2 * n, 1))
    
    for i, cp in enumerate(control_points):
        sx, sy = cp.source['x'], cp.source['y']
        tx, ty = cp.target['x'], cp.target['y']
        w = cp.weight
        
        A[2*i] = [w, 0, w * sx, w * sy]
        A[2*i + 1] = [0, w, -w * sy, w * sx]
        b[2*i] = tx * w
        b[2*i + 1] = ty * w
    
    x, residuals, rank, s = np.linalg.lstsq(A, b, rcond=None)
    transform_matrix = [[x[1], x[2], x[0]], [x[3], x[1], x[2]]]
    
    return transform_matrix, residuals

def apply_transform(points: List[Dict[str, float]], transform_matrix: List[List[float]], transform_type: str) -> List[Dict[str, float]]:
    transformed = []
    
    for pt in points:
        x, y = pt.get('x', 0), pt.get('y', 0)
        
        if transform_type == "affine":
            tx = transform_matrix[0][0] * x + transform_matrix[0][1] * y + transform_matrix[0][2]
            ty = transform_matrix[1][0] * x + transform_matrix[1][1] * y + transform_matrix[1][2]
        elif transform_type == "similarity":
            tx = transform_matrix[0][0] * x + transform_matrix[0][1] * y + transform_matrix[0][2]
            ty = transform_matrix[1][0] * x + transform_matrix[1][1] * y + transform_matrix[1][2]
        elif transform_type == "helmert":
            tx = transform_matrix[0][0] + transform_matrix[0][1] * x + transform_matrix[0][2] * y
            ty = transform_matrix[1][0] + transform_matrix[1][1] * x + transform_matrix[1][2] * y
        else:
            tx, ty = x, y
        
        transformed.append({'x': tx, 'y': ty, **pt})
    
    return transformed

def transform_geojson(geojson_data: Dict[str, Any], transform_matrix: List[List[float]], transform_type: str) -> Dict[str, Any]:
    result = geojson_data.copy()
    
    if 'features' in geojson_data:
        transformed_features = []
        
        for feature in geojson_data['features']:
            geom = feature.get('geometry', {})
            coords = geom.get('coordinates', [])
            
            if geom.get('type') == 'Point':
                new_coords = apply_transform([{'x': coords[0], 'y': coords[1]}], transform_matrix, transform_type)
                geom['coordinates'] = [new_coords[0]['x'], new_coords[0]['y']]
            elif geom.get('type') == 'MultiPoint' or geom.get('type') == 'LineString':
                new_coords = []
                for coord in coords:
                    tc = apply_transform([{'x': coord[0], 'y': coord[1]}], transform_matrix, transform_type)
                    new_coords.append([tc[0]['x'], tc[0]['y']])
                geom['coordinates'] = new_coords
            elif geom.get('type') == 'Polygon' or geom.get('type') == 'MultiPolygon':
                new_coords = []
                for ring in coords:
                    new_ring = []
                    for coord in ring:
                        tc = apply_transform([{'x': coord[0], 'y': coord[1]}], transform_matrix, transform_type)
                        new_ring.append([tc[0]['x'], tc[0]['y']])
                    new_coords.append(new_ring)
                geom['coordinates'] = new_coords
            
            feature['geometry'] = geom
            transformed_features.append(feature)
        
        result['features'] = transformed_features
    
    return result

def calculate_accuracy(transform_matrix: List[List[float]], control_points: List[ControlPoint], transform_type: str) -> float:
    if not control_points:
        return 0.0
    
    residuals = []
    
    for cp in control_points:
        sx, sy = cp.source['x'], cp.source['y']
        tx, ty = cp.target['x'], cp.target['y']
        
        if transform_type == "affine":
            pred_tx = transform_matrix[0][0] * sx + transform_matrix[0][1] * sy + transform_matrix[0][2]
            pred_ty = transform_matrix[1][0] * sx + transform_matrix[1][1] * sy + transform_matrix[1][2]
        elif transform_type == "similarity":
            pred_tx = transform_matrix[0][0] * sx + transform_matrix[0][1] * sy + transform_matrix[0][2]
            pred_ty = transform_matrix[1][0] * sx + transform_matrix[1][1] * sy + transform_matrix[1][2]
        elif transform_type == "helmert":
            pred_tx = transform_matrix[0][0] + transform_matrix[0][1] * sx + transform_matrix[0][2] * sy
            pred_ty = transform_matrix[1][0] + transform_matrix[1][1] * sx + transform_matrix[1][2] * sy
        else:
            pred_tx, pred_ty = sx, sy
        
        residual = np.sqrt((tx - pred_tx)**2 + (ty - pred_ty)**2)
        residuals.append(residual)
    
    rmse = np.sqrt(np.mean([r**2 for r in residuals]))
    accuracy = max(0, 100 - rmse)
    
    return round(accuracy, 2)

def integrate_layers(layers: List[Dict[str, Any]], strategy: str = "union") -> Dict[str, Any]:
    if not layers:
        return {"type": "FeatureCollection", "features": []}
    
    all_features = []
    
    for layer in layers:
        if 'features' in layer:
            all_features.extend(layer['features'])
    
    if strategy == "union":
        return {"type": "FeatureCollection", "features": all_features}
    elif strategy == "intersection":
        return {"type": "FeatureCollection", "features": all_features[:1]}
    else:
        return {"type": "FeatureCollection", "features": all_features}

def align_data(request: AlignRequest) -> AlignResponse:
    transform_type = request.transform_type.lower()
    
    if request.control_points and len(request.control_points) >= 3:
        if transform_type == "affine":
            transform_matrix, residuals = compute_affine_transform(request.control_points)
        elif transform_type == "similarity":
            transform_matrix, residuals = compute_similarity_transform(request.control_points)
        elif transform_type == "helmert":
            transform_matrix, residuals = compute_helmert_transform(request.control_points)
        else:
            transform_matrix = [[1, 0, 0], [0, 1, 0]]
            residuals = []
    else:
        transform_matrix = [[1, 0, 0], [0, 1, 0]]
        residuals = []
    
    if 'type' in request.source_data:
        transformed_data = transform_geojson(request.source_data, transform_matrix, transform_type)
    else:
        points = request.source_data.get('points', [])
        transformed_points = apply_transform(points, transform_matrix, transform_type)
        transformed_data = {"type": "FeatureCollection", "features": transformed_points}
    
    accuracy_score = calculate_accuracy(transform_matrix, request.control_points or [], transform_type)
    
    residuals_list = residuals.tolist() if hasattr(residuals, 'tolist') else list(residuals)
    
    return AlignResponse(
        transformed_data=transformed_data,
        transform_matrix=transform_matrix,
        accuracy_score=accuracy_score,
        residuals=residuals_list[:10]
    )

def align_handler(event, context):
    try:
        body = json.loads(event.get('body', '{}'))
        
        request = AlignRequest(**body)
        result = align_data(request)
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps(result.dict())
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }
