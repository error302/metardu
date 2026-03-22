# METARDU Geometric Validation Engine — RDM 1.3 (Aug 2023)
import math

design_speeds = {
    'DR1': {'flat': [120,110], 'rolling': [100,90], 'mountainous': [80,70], 'escarpment': [60,50]},
    'DR2': {'flat': [110,90],  'rolling': [90,85],  'mountainous': [70,60], 'escarpment': [50]},
    'DR3': {'flat': [100,80],  'rolling': [90,65],  'mountainous': [70,50], 'escarpment': [50]},
    'DR4': {'flat': [90,70],   'rolling': [85,65],  'mountainous': [60,50], 'escarpment': [50]},
    'DR5': {'flat': [80,60],   'rolling': [70,50],  'mountainous': [50,40], 'escarpment': [40]},
    'DR6': {'flat': [70,50],   'rolling': [65,40],  'mountainous': [50,30], 'escarpment': [30]},
    'DR7': {'flat': [60,50],   'rolling': [50,40],  'mountainous': [40,30], 'escarpment': [30]},
    'Urban_Arterial':  {'flat': [80,60], 'rolling': [60,50], 'mountainous': [50,40]},
    'Urban_Collector': {'flat': [60,50], 'rolling': [50,40], 'mountainous': [40,30]},
    'Urban_Local':     {'flat': [50,40], 'rolling': [40,30], 'mountainous': [30,20]}
}

gradients = {
    'flat':        {'desirable': 3, 'absolute': 5, 'minimum': 0.5},
    'rolling':     {'desirable': 4, 'absolute': 6, 'minimum': 0.5},
    'mountainous': {'desirable': 6, 'absolute': 8, 'minimum': 0.5},
    'escarpment':  {'desirable': 6, 'absolute': 8, 'minimum': 0.5},
    'urban':       {'desirable': 5, 'absolute': 7, 'minimum': 0.5}
}

min_radii_8pct = {
    120: 665, 110: 530, 100: 415, 90: 320, 85: 270,
    80: 240, 70: 170, 65: 140, 60: 120, 50: 80, 40: 45, 30: 24
}

ssd_desirable = {
    120: 285, 110: 245, 100: 205, 90: 170, 80: 140,
    70: 110, 60: 85,  50: 70,  40: 50,  30: 35
}

k_crest = {
    120: 140, 110: 110, 100: 85, 90: 65, 80: 50,
    70: 35,  60: 25,  50: 15, 40: 9,  30: 5
}

def calculate_ssd(speed_kmh: float, grade_percent: float = 0.0,
                  friction: float = 0.35) -> float:
    v = speed_kmh
    g = grade_percent / 100
    return round((v ** 2) / (254 * (friction + g)), 1)

def validate_geometry(road_class: str, terrain: str, design_speed: float,
                      proposed_gradient: float, proposed_radius: float,
                      proposed_ssd: float = None,
                      superelevation: float = 8.0) -> dict:
    result = {'status': 'GREEN', 'flags': [], 'details': {}}

    g_limits = gradients.get(terrain.lower(), gradients['flat'])
    if proposed_gradient < g_limits['minimum']:
        result['status'] = 'YELLOW'
        result['flags'].append(
            f"Gradient {proposed_gradient}% is below minimum {g_limits['minimum']}% — "
            f"drainage may be inadequate (RDM 1.3)")
    elif proposed_gradient > g_limits['absolute']:
        result['status'] = 'RED'
        result['flags'].append(
            f"DEPARTURE FROM STANDARD: Gradient {proposed_gradient}% exceeds absolute "
            f"maximum {g_limits['absolute']}% for {terrain} terrain. Written approval "
            f"from Chief Engineer (Roads) required — RDM 1.3 §1.6.2")
    elif proposed_gradient > g_limits['desirable']:
        result['status'] = 'YELLOW'
        result['flags'].append(
            f"Gradient {proposed_gradient}% exceeds desirable {g_limits['desirable']}% "
            f"(absolute max is {g_limits['absolute']}%) — RDM 1.3")

    min_r = min_radii_8pct.get(int(design_speed), 9999)
    if proposed_radius < min_r:
        result['status'] = 'RED'
        result['flags'].append(
            f"DEPARTURE FROM STANDARD: Radius {proposed_radius}m is below minimum "
            f"{min_r}m at {design_speed}km/h ({superelevation}% superelevation). "
            f"Written approval from Chief Engineer required — RDM 1.3 §1.6.2")

    required_ssd = ssd_desirable.get(int(design_speed),
                                     calculate_ssd(design_speed))
    if proposed_ssd is not None and proposed_ssd < required_ssd:
        result['status'] = 'RED'
        result['flags'].append(
            f"DEPARTURE FROM STANDARD: SSD {proposed_ssd}m insufficient — "
            f"minimum required {required_ssd}m at {design_speed}km/h — RDM 1.3")

    result['details'] = {
        'max_gradient_desirable': g_limits['desirable'],
        'max_gradient_absolute':  g_limits['absolute'],
        'min_gradient':           g_limits['minimum'],
        'min_radius':             min_r,
        'required_ssd':           required_ssd,
        'k_crest':               k_crest.get(int(design_speed), 'N/A')
    }
    return result
