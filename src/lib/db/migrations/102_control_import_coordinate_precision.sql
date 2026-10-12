-- UP: Preserve published control coordinates beyond the legacy four decimal places.
-- Storage precision is not measurement accuracy; no coordinate uncertainty is inferred.
DROP POLICY control_import_insert ON public.control_import_captures;
ALTER TABLE public.survey_points
  ALTER COLUMN easting TYPE NUMERIC(24,10),
  ALTER COLUMN northing TYPE NUMERIC(24,10),
  ALTER COLUMN elevation TYPE NUMERIC(24,10);
CREATE POLICY control_import_insert ON public.control_import_captures FOR INSERT WITH CHECK (
 actor_id=current_user_id()
 AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=actor_id)
 AND EXISTS (SELECT 1 FROM public.survey_points s JOIN public.public_beacons b ON b.id=control_import_captures.beacon_id
   JOIN public.project_reference_systems r ON r.project_id=control_import_captures.project_id
   WHERE s.id=point_id AND s.project_id=control_import_captures.project_id AND b.status='verified'
   AND b.horizontal_crs IS NOT NULL AND b.horizontal_crs=r.horizontal_crs AND s.horizontal_crs=b.horizontal_crs
   AND s.easting=b.easting::numeric(24,10) AND s.northing=b.northing::numeric(24,10)
   AND s.elevation IS NOT DISTINCT FROM b.elevation::numeric(24,10)
   AND (b.elevation IS NULL OR (b.vertical_datum IS NOT NULL AND b.vertical_datum=r.vertical_datum AND s.vertical_datum=b.vertical_datum))
   AND source_snapshot=to_jsonb(b) AND project_reference_snapshot=to_jsonb(r))
);
-- DOWN: Widened coordinates cannot safely be truncated by automatic rollback.
-- DO $$ BEGIN RAISE EXCEPTION 'Use a reviewed forward migration; preserve recorded coordinate precision.'; END $$;
