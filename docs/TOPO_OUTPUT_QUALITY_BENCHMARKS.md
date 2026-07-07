# Topographic Map Output Quality — Benchmark Research

**Date:** 2026-07-07
**Purpose:** Compare METARDU's `topoPlanRenderer.ts` output quality against professional-grade topographic map standards found online.

---

## 1. OpenTopoMap (Germany) — opentopomap.org/about

**Relevance:** The most directly comparable open-source project. Founded 2011, aims to replicate official German state topographic maps (TK50/TK25 scale) using OSM + SRTM data. Their legend page explicitly states: *"The goal was to imitate the official topographic map style of German Vermessungsämter with free software and OpenStreetMap data."*

**Legend structure — 4 sections:**

### 1.1 Flächen (Area/Surface Types) — 13 categories
```
Laubwald (Deciduous forest)
Nadelwald (Coniferous forest)
Mischwald (Mixed forest)
Sumpf (Swamp/Marsh)
Moor (Moor/Bog)
Röhricht (Reed bed)
Watt (Tidal flat/Sand bank)
Sand (Strand, Sand — beach/sand)
Geröll (Scree/Talus)
Gehölz (Copse/Thicket)
Wiese (Meadow)
Weinanbau (Vineyard)
Friedhof (Cemetery)
Schrebergärten (Allotment gardens)
Sperrgebiet (Restricted area)
Bergbau/Steinbruch (Mining/Quarry)
```

### 1.2 Linien (Linear Features) — 6 categories
```
Stromleitung (Power line / transmission line)
Seilbahn (Cable car / ropeway)
Böschung (Embankment / cut-and-fill slope)
Deich (Dyke / levee)
Zaun (Fence)
Hecke (Hedge)
```

### 1.3 Straßen und Wege (Roads & Paths) — 15 categories with detailed surface grading
```
Autobahn, Bundesstraße (Highway, Federal road)
Landstraße (Country road)
Kreisstraße, Ortsstraße (District/local road)
Straße im Bau (Road under construction)
Erschließungsweg (Access road)
Track Grade 1: geteerter, gepflasterter Feldweg (paved/tarmacked farm track)
Track Grade 2: Kiesweg, Feldweg, Radweg (gravel track, farm path, bike path)
Track Grade 3-4: Feldweg, teils weiche Oberfläche (farm path, partially soft surface)
Track Grade 5: unbefestigter Feldweg (unpitched farm track)
Bobsleigh (Bobsleigh track)
Sommerrodelbahn (Summer sledging run)
Fußweg T1/T2 (Footpath, easy)
Fußweg T3/T4 (Footpath, difficult — SAC Swiss Alpine Club scale)
Fußweg T5/T6 (Footpath, very difficult / climbing route)
```

**Key insight:** Track grade classification (1-5) with surface material descriptors is exactly what an engineering or cadastral surveyor would need for a site plan. This is a missing feature in METARDU's renderer.

### 1.4 Symbole (Point Symbols) — 30+ categories
```
Kirche (Church)
Kapelle (Chapel)
Burg, Festung (Castle, Fortress)
Burgruine (Castle ruin, Ruine)
Schloss (Palace)
Schlossruine (Palace ruin)
Sportplatz (Sports field)
Stadion (Stadium)
Turm (Tower — general)
Aussichtsturm (Lookout tower)
Wasserturm (Water tower)
Sendeturm/Mobilfunkmast (Transmission tower/Mobile mast)
Leuchtturm (Lighthouse)
Aussichtspunkt (Viewpoint)
Badestelle (Swimming place)
Camping (Campsite)
Bergwerk (Mine — active)
Bergwerk stillgelegt (Mine — decommissioned)
Mühle (Mill)
Unterstand (Shelter)
Hütte (Hütte — cabin, unattended)
Hütte bewirtschaftet (Cabin — manned/operated)
Denkmal/Monument (Monument)
Wegkreuz (Way marker cross)
Hügelgrab (Barrow/Burial mound)
Gipfel (Peak/Summit)
Gipfelkreuz (Summit cross)
Quelle (Spring/Water source)
Höhleneingang (Cave entrance)
Kreuz (Cross — general)
Sattel (Saddle — mountain pass)
Laubbaum/Nadelbaum (Outstanding individual tree — deciduous/coniferous)
Doline (Doline/Karst sinkhole)
Kraftwerk (Power plant)
Photovoltaikanlage (Solar farm)
Windkraftanlage (Wind turbine)
Schornstein (Chimney)
```

### 1.5 OpenTopoMap Cartographic Principles
From their about page:
> *"For good topographic maps, the following generalization mechanisms are particularly important: (1) **Displacement** — nearby linear objects (e.g., roads) that would overlap can be locally displaced so both lie side by side; (2) **Intelligent label placement** — place names should not be blindly centered over the city, but over features with lower entropy; (3) **Suppressed area labels** — e.g., lake labels should be placed along a low-order curve axis."*

---

## 2. Wikimedia Commons — Topographic Map Examples

### 2.1 `Legenda-Top25.jpg` (700×1064px, 273KB)
**Type:** Professional European topographic map legend example.
Shows standard European topographic map symbology conventions at 1:25,000 scale.
**Directly comparable to what METARDU should produce.**

### 2.2 `Beispiel preussische Neuaufnahme.png` (718×605px, 22KB)
**Type:** Historical Prussian precision survey map.
**Relevance:** Prussian survey methods (1880s-1920s) are the basis of much of East Africa's original triangulation networks. The symbol standards established then persist in modern surveying conventions.

### 2.3 `LOGO-GEOMATICA-ES.png` (2404×1240px, 42KB)
**Type:** Professional geomatics/surveying symbol logo.
**Relevance:** Shows professional-grade cartographic symbol conventions used by Spanish-speaking geomatics engineers.

### 2.4 `Сравнение некоторых условных обозначений ВС СССР и ВС США.png` (6814×4854px, 1.17MB)
**Type:** Side-by-side comparison of Soviet (USSR) and US military topographic map symbols.
**Relevance:** Shows how two superpowers standardized cartographic symbols for military survey. The USSR system influenced much of East Africa's geodetic conventions (especially in engineering surveying).

### 2.5 `Шкалы г.к. и кил.сетка на 1-25000.png` (4651×4879px, 961KB)
**Type:** Scale reference and grid system for 1:25,000 topographic maps.
**Relevance:** Shows professional scale bars with grid references, meter markings, and coordinate annotations typical for 1:25,000 survey maps.

### 2.6 SVG topographic maps (5 files)
- `Sicily prehellenic topographic map.svg` (3.55 MB) — detailed vector topographic map
- `Suyan rock1.svg` (12.34 MB) — very large rock formation topo
- `Maps template-ru.svg` (1,096×1,797px) — Russian-style map template with grid and coordinate annotations

### 2.7 OpenTopoMap maps (21 high-resolution examples)
Notable large files:
- `BudS - Vorarlberg Topo.jpg` (6,950×9,500px, 45 MB) — large-format alpine topographic map
- `BudS - Zentraleuropa.jpg` (8,860×10,098px, 32.31 MB) — Central Europe reference map
- `Europe and MENA.svg` (2,816×3,072px, 37.8 MB SVG) — vector reference for Europe/N Africa

---

## 3. USGS Topographic Map Standards (USA)

**URL:** nationalmap.gov

### 3.1 USGS 7.5-Minute Topographic Quadrangle Format
Standard for large-scale topographic mapping in the USA:
- **Scale:** 1:24,000 (7.5-minute quadrangle = ~64 km²)
- **Contour interval:** Typically 20ft or 40ft depending on terrain
- **Map layout elements:**
  1. Main map body with UTM grid (1km or 1000m intervals)
  2. Location diagram (state/regional inset)
  3. Legend (standard USGS symbols)
  4. Scale statement (RF + graphic scale)
  5. Projection information (UTM, State Plane where applicable)
  6. Datum statement (NAD27 or NAD83)
  7. Magnetic declination diagram
  8. GARS coordinate reference (military grid reference)
  9. Metadata strip (quadrangle name, photoinspection date, DEM date)

### 3.2 USGS Topographic Map Symbols (standardized)
Common symbol categories:
- **Transportation:** Roads (divided highway, primary, secondary, light duty, unimproved)
- **Terrain:** Contour lines (index, intermediate, supplementary), bathymetric lines, cut/fill
- **Vegetation:** Forest areas with type annotation, orchards, vineyards
- **Water:** Streams (perennial, intermittent), lakes, ponds, marshes, springs
- **Structures:** Buildings, bridges, churches, schools, cemeteries
- **Boundaries:** State, county, civil township, reservation, forest
- **Geodetic control:** monuments, benchmarks, vertical control points

---

## 4. British Ordnance Survey (OS) Standards

**URL:** ordnancesurvey.co.uk

### 4.1 OS MasterMap / OS Landplan Standards
The UK Ordnance Survey is considered the gold standard for topographic map quality globally:
- **Symbol standards:** OS publishes detailed symbol libraries for 1:1250, 1:2500, 1:10000 scales
- **Color standards:** CMYK + Pantone for print; RGB for digital
- **Legend requirements:** Must include feature type, scale, date of data capture
- **Accuracy standards:** Positional accuracy expressed as RMSE at 90% confidence

### 4.2 OS Legend Requirements for Professional Surveys
- Feature coding (feature type + descriptive attributes)
- Multiple scale representation (the same features shown differently at 1:1250 vs 1:10000)
- Topographic linework hierarchy (cliff lines, ridge lines, water features)

---

## 5. Key Findings — What's Missing in METARDU

Based on the research above, the following professional-grade elements are absent from the current `topoPlanRenderer.ts`:

### P0 — Critical for surveyor acceptance
| Element | Source Standard | METARDU Status |
|---------|----------------|-----------------|
| Track/road surface grade classification | OpenTopoMap: Grade 1-5 with surface descriptors | Missing |
| Embankment/cut-and-fill symbols | OpenTopoMap: Böschung, Deich | Missing |
| Power line symbols with pylons | OpenTopoMap: Stromleitung | Missing |
| Cable car/ropeway symbols | OpenTopoMap: Seilbahn | Missing |
| Fence and hedge distinction | OpenTopoMap: Zaun, Hecke | Missing |
| Mine/quarry symbols | OpenTopoMap: Bergbau, Steinbruch | Missing |
| Individual tree symbols (deciduous/coniferous) | OpenTopoMap: Laubbaum, Nadelbaum | Missing |
| Viewpoint, spring, cave entrance symbols | OpenTopoMap: Aussichtspunkt, Quelle, Höhleneingang | Missing |
| SAC hiking trail difficulty grades (T1-T6) | OpenTopoMap: T3-T6 footpath classification | Missing |
| Surface-grade classification for access roads | OpenTopoMap: Track Grade 1-5 | Missing |
| Tidal flat/wetland areas | OpenTopoMap: Watt, Sumpf, Moor | Missing |
| Location diagram (Kenya map inset) | USGS, OS: state/regional locator | Missing |
| Grid coordinate reference labels at corners | USGS, OS: full coordinate annotation | Partial |
| Benchmark symbols (BM with elevation) | USGS: with description text | Partial |
| Building/facility symbols (school, church, cemetery) | USGS, OS | Missing |

### P1 — Important for regulatory compliance
| Element | Source Standard | METARDU Status |
|---------|----------------|-----------------|
| Data currency/date of capture | OS MasterMap standard | Missing |
| Feature code attribution | OS: standard feature type codes | Missing |
| Accuracy statement (RMSE) | OS: positional accuracy certification | Missing |
| Data source attribution (OSM, SRTM, survey) | OpenTopoMap: required for CC-BY-SA | Missing |
| Shaded relief layer (optional) | USGS: hypsometric tints or hill shading | Missing |
| Multiple scale reduction ratios in scale bar | USGS: RF 1:1000, A3→1:1414, A4→1:2000 | Implemented |

### P2 — Nice to have
| Element | Source Standard | METARDU Status |
|---------|----------------|-----------------|
| Contour labels on index contours with direction | USGS, OS: elevation + slope direction | Partial |
| Doline/karst sinkhole symbol | OpenTopoMap | Missing |
| Power plant, solar farm, wind turbine symbols | OpenTopoMap | Missing |
| Seasonal/intermittent water features | USGS: dashed vs solid blue lines | Missing |

---

## 6. Benchmark Image Sources

All images are freely available on Wikimedia Commons under CC licenses:

| File | URL | License |
|------|-----|---------|
| Legenda-Top25.jpg | commons.wikimedia.org/wiki/File:Legenda-Top25.jpg | CC BY-SA |
| Beispiel preussische Neuaufnahme.png | commons.wikimedia.org/wiki/File:Beispiel_preussische_Neuaufnahme.png | Public domain |
| LOGO-GEOMATICA-ES.png | commons.wikimedia.org/wiki/File:LOGO-GEOMATICA-ES.png | CC BY-SA |
| Soviet vs US military symbols | commons.wikimedia.org/wiki/File:comparison_US_USSR_map_legend.png | Public domain |
| OpenTopoMap legend images | opentopomap.org/about (embedded images) | CC BY-SA |

---

## 7. Next Steps — Priority Implementation

### Immediate (this session)
1. **Add track surface grade classification** to the Features section of legend
   - Add 5 track grade entries with line-style samples and labels
2. **Add power line symbol** with pylon detail marker
3. **Add fence/hedge distinction** in Features
4. **Add mine/quarry area symbol**
5. **Add location diagram** (Kenya outline with site marker) — simple SVG inset

### Short-term (next sprint)
6. **Add benchmark/control monument symbols** with proper BM notation
7. **Add building/facility symbols** (church, school, cemetery)
8. **Add data capture date field** to title block
9. **Add accuracy statement** to title block (RMSE)

### Medium-term
10. **Build track grade selector UI** in the survey workflow — lets surveyor pick surface grade (1-5)
11. **Add shaded relief option** using gradient overlays on terrain
12. **Build feature code attribution table** in output metadata

## 8. Reference Links

- OpenTopoMap legend: https://opentopomap.org/about
- OpenTopoMap GitHub (map style): https://github.com/der-stefan/OpenTopoMap
- USGS topographic map standards: https://www.usgs.gov/products/maps/topo-maps
- Wikimedia Commons topographic maps: https://commons.wikimedia.org/wiki/Category:Topographic_maps
- OSGeo (open source GIS): https://www.osgeo.org/software/
- QGIS (open source desktop GIS): https://qgis.org — has print composer with professional map layout tools