-- UP: Unique block identities and retention-safe direct block deletion.
-- Fail on legacy duplicates/orphans; never delete or renumber them automatically.
CREATE UNIQUE INDEX scheme_block_number_per_project ON public.blocks(project_id,block_number);

-- Preserve project/account cascades: every child also has its existing project
-- lifecycle FK. Direct block deletion may not silently cascade retained records.
-- Check the exact installed FK shape rather than assume constraint names.
DO $$
DECLARE
  relation_name text;
  relation_id regclass;
  block_column smallint;
  constraint_name text;
  matches integer;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['parcels','block_assignments','scheme_import_receipts'] LOOP
    relation_id := to_regclass('public.' || relation_name);
    IF relation_id IS NULL THEN RAISE EXCEPTION 'Required block retention table % is absent; review migration order.',relation_name; END IF;
    SELECT attnum INTO block_column FROM pg_attribute WHERE attrelid=relation_id AND attname='block_id' AND NOT attisdropped;
    SELECT COUNT(*),MIN(conname::text) INTO matches,constraint_name FROM pg_constraint
      WHERE conrelid=relation_id AND contype='f' AND confrelid='public.blocks'::regclass
        AND conkey=ARRAY[block_column]::smallint[]
        AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.blocks'::regclass AND attname='id' AND NOT attisdropped)]::smallint[]
        AND confdeltype='c' AND NOT condeferrable AND NOT condeferred AND convalidated;
    IF matches<>1 THEN RAISE EXCEPTION 'Unexpected block FK shape on %; review before applying 118.',relation_name; END IF;
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',relation_name,constraint_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY(block_id) REFERENCES public.blocks(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED',relation_name,constraint_name);
  END LOOP;
END $$;

-- DOWN: retain identity/retention guarantees; roll back application code instead.
DO $$ BEGIN RAISE EXCEPTION '118 requires a reviewed forward correction; do not restore destructive block cascades.'; END $$;
