-- 066: drop_project_crs_defaults
--
-- Sprint A P0 (blueprint A4.2 / A31): no exporter may hard-code a project
-- CRS, and no row may silently carry one either. The canonical schema gave
-- projects.utm_zone / hemisphere / datum the invisible defaults 37 / 'S' /
-- 'Arc 1960' — a brand-new project therefore CLAIMED Arc 1960 / UTM 37S
-- before any surveyor declared it, and every downstream consumer (shapefile
-- .prj, IFC, NLIMS, GeoJSON, machine control, map display) inherited that
-- guess.
--
-- Dropping the defaults does not touch existing rows (their values were
-- materialised at INSERT time); it stops new rows from being born with a
-- false authority claim. Exporters now fail closed with CRS_UNDECLARED
-- until the project reference system is declared (migration 065 + the
-- ProjectReferenceSystemPanel).
--
-- UP:
ALTER TABLE projects ALTER COLUMN utm_zone DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN hemisphere DROP DEFAULT;
ALTER TABLE projects ALTER COLUMN datum DROP DEFAULT;

COMMENT ON COLUMN projects.utm_zone IS
  'Declared UTM zone (1-60). NULL until the project reference system is declared — exporters fail closed (CRS_UNDECLARED) while NULL.';
COMMENT ON COLUMN projects.hemisphere IS
  'Declared hemisphere N/S. NULL until the project reference system is declared.';
COMMENT ON COLUMN projects.datum IS
  'Declared horizontal datum (e.g. Arc 1960, WGS 84). NULL until the project reference system is declared. Never defaulted.';

-- DOWN: ALTER TABLE projects ALTER COLUMN utm_zone SET DEFAULT 37; ALTER TABLE projects ALTER COLUMN hemisphere SET DEFAULT 'S'; ALTER TABLE projects ALTER COLUMN datum SET DEFAULT 'Arc 1960';
