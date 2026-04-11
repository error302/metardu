---
Task ID: 1
Agent: Main Agent
Task: Premium Map Page Overhaul for METARDU Surveying SaaS

Work Log:
- Read worklog.md and analyzed existing codebase (map page, QuickCompute, projection lib, existing map components)
- Created `/home/z/my-project/src/components/map/PremiumIcons.tsx` — 22 custom SVG icon components with linear gradients, consistent 20x20 viewBox, brand orange color scheme
- Completely rewrote `/home/z/my-project/src/app/map/page.tsx` (883 → ~1130 lines) with premium UI
- Upgraded `/home/z/my-project/src/components/layout/QuickCompute.tsx` with premium styling, BoltIcon SVG, gradient FAB button, slide-in panel with smooth animation
- Fixed pre-existing `next.config.js` crash by wrapping `@next/bundle-analyzer` require in try-catch
- All 3 files pass ESLint with 0 errors/warnings

Stage Summary:

### 1. PremiumIcons.tsx (NEW — 22 icons)
Custom SVG icon components with:
- Linear gradients using brand orange (#E8841A → #FFB84D → #B35D00)
- Consistent 20x20 viewBox, 1.75px stroke, round linecaps
- `active` prop that switches between gradient stroke and currentColor
- Icons: MapPin, Pencil, Hexagon, Circle, Globe, Crosshair, Satellite, Map, Trash, Bolt, Compass, Ruler, Layers, Edit, Undo, Redo, Target, Upload, Download, ChevronLeft, ChevronRight, X, Menu, Search, LocationDot, Moon, Terrain, Grid, Opacity

### 2. Map Page Overhaul (src/app/map/page.tsx)
**Layout restructure:**
- Top bar: hamburger toggle + "METARDU Map" title + project count pill + coordinate search input
- Left collapsible panel (280px expanded, 48px collapsed icon strip)
  - DRAW section: Point, Line, Polygon, Circle in 2x2 grid with active glow states
  - EDIT section: Modify Vertices toggle, Undo/Redo buttons, Delete Selected, Feature Properties panel (name/type input)
  - MEASURE section: Distance and Area measurement tools with live result display
  - LAYERS section: OSM/Satellite/Dark/Terrain in 2x2 grid + layer opacity slider
  - ACTIONS section: Fit to Kenya, Fit to Drawn, GPS Tracking, Overview Map
  - EXPORT section (conditional): GeoJSON/KML/WKT download + Clear All
- Bottom bar: E/N coordinates (EPSG:21037) + GPS accuracy indicator + drag-drop hint

**New OpenLayers capabilities:**
- Modify interaction (`ol/interaction/Modify`) for vertex editing
- Undo/Redo history stack (up to 50 entries)
- Distance measurement (LineString draw with length calculation)
- Area measurement (Polygon draw with area calculation)
- Feature name editing via properties panel
- Layer opacity control
- Coordinate search (supports lat,lon and UTM easting,northing)
- Smart mode switching (drawing/measuring/editing are mutually exclusive)

**Styling:**
- Frosted glass panels: `bg-[#0d0d14]/95 backdrop-blur-xl`
- Subtle borders: `border-white/[0.06]`
- Active tool glow: `shadow-[0_0_12px_rgba(232,132,26,0.15)]`
- Custom scrollbar styling
- All OL controls styled to match dark theme
- NO emojis anywhere on the page
- Responsive panel with smooth slide animation

### 3. QuickCompute Upgrade
- Replaced emoji with premium BoltIcon SVG
- Gradient FAB button: `bg-gradient-to-r from-[#FFB84D] to-[#E8841A]`
- Pulsing glow: `shadow-[0_0_20px_rgba(232,132,26,0.3)]`
- Slide-in panel with transform animation
- Consistent dark theme with frosted glass styling
- Chevron right arrows on tool items

Files Modified:
1. src/components/map/PremiumIcons.tsx (NEW)
2. src/app/map/page.tsx (complete rewrite)
3. src/components/layout/QuickCompute.tsx (premium styling upgrade)
4. next.config.js (bug fix: try-catch for bundle-analyzer)

Files NOT Modified (as requested):
- src/app/project/[id]/map/page.tsx
- All API routes
- No new npm packages installed
