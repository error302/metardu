-- Forward fix: a BEFORE DELETE trigger must return OLD for an ordinary row.
-- Migration 101 returned NEW (NULL on DELETE), silently suppressing every
-- survey-point deletion even when no immutable import capture existed.
-- Retain all captured control protections and all historical records/hashes.
CREATE OR REPLACE FUNCTION public.protect_imported_control_coordinate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.control_import_captures WHERE point_id = OLD.id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Imported control coordinates retain their source capture.';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['description','updated_at','signed_audit'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['description','updated_at','signed_audit']) THEN
      RAISE EXCEPTION 'Imported control coordinates are immutable; record a new observation.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- DOWN: Restore no silent deletion suppression. Preserve imported control
-- evidence and use a reviewed forward correction for any future issue.
