import fs from 'fs';

let code = fs.readFileSync('src/app/map/MapClient.tsx', 'utf8');

// 1. Remove MapRail import
code = code.replace(/import MapRail from '@\/app\/map\/components\/MapRail'[\r\n]+/, '');

// 2. Simplify MapToolDock import
code = code.replace(
  "import { MapToolDock, ReconContent, CaptureContent, ComputeContent, SetOutContent, LayersContent, ExportContent } from '@/app/map/components/MapToolDock'",
  "import { MapToolDock } from '@/app/map/components/MapToolDock'"
);

// 3. Remove lucide-react line
code = code.replace(/import { Target, PenLine, Layers, Ruler, Binoculars, Crosshair, Calculator, Download } from 'lucide-react'[\r\n]+/, '');

// 4. Remove MeasureRailPanel
code = code.replace(/\/\/ ── MapRail panels[\s\S]*?function MeasureRailPanel\(\) {[\s\S]*?\n}[\r\n]+/, '');

// 5. Remove activeRailTool state
code = code.replace(/\s*const \[activeRailTool, setActiveRailTool\] = useState<string \| null>\(null\)[\r\n]+/, '\n');

// 6. Replace MapWorkspaceHeader & Tool Dock
code = code.replace(
  /<MapWorkspaceHeader layersOpen={activeRailTool === 'layers'} onToggleLayers={\(\) => setActiveRailTool\(current => current === 'layers' \? null : 'layers'\)} \/>\s*<MapBasemapBar \/>\s*{\/\* ── Tool Dock — MOBILE ONLY \(bottom-sheet UX\) ── \*\/}\s*{isMobile && <MapToolDock expanded={mobileToolsExpanded} onExpandedChange={setMobileToolsExpanded} \/>}/,
  `<MapWorkspaceHeader />\n              <MapBasemapBar />\n\n              {/* ── Unified Tool Dock (matching UX on desktop & mobile) ── */}\n              <MapToolDock expanded={mobileToolsExpanded} onExpandedChange={setMobileToolsExpanded} />`
);

// 7. Remove MapRail render block
code = code.replace(
  /{\/\* ── Tool rail \(desktop\)[\s\S]*?{!isMobile && \(\s*<>\s*<MapRail[\s\S]*?\/>\s*<\/>\s*\)}/,
  ''
);

fs.writeFileSync('src/app/map/MapClient.tsx', code, 'utf8');
console.log('Successfully updated MapClient.tsx');
