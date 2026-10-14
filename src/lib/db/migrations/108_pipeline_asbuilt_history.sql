-- UP: Retain private measured pipe profiles separately from mutable design JSON.
-- Prepare only; apply after compatibility and backup/recovery verification.
CREATE TABLE public.pipeline_asbuilt_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
 actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 client_batch_id UUID NOT NULL,
 input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
 capture JSONB NOT NULL,
 project_name TEXT NOT NULL,
 reference_snapshot JSONB,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() CHECK (isfinite(recorded_at)),
 UNIQUE(project_id, actor_id, client_batch_id),
 CHECK ((
   jsonb_typeof(capture) = 'object'
   AND capture->>'schemaVersion' = '1'
   AND capture->>'scope' = 'numerical_profile_only'
   AND jsonb_typeof(capture->'rawCsv') = 'string'
   AND octet_length(capture->>'rawCsv') BETWEEN 1 AND 1000000
   AND jsonb_typeof(capture->'metadata') = 'object'
   AND jsonb_typeof(capture->'result'->'points') = 'array'
   AND jsonb_array_length(capture->'result'->'points') BETWEEN 1 AND 1000
   AND capture->'result'->>'algorithmVersion' IS NOT NULL
   AND (jsonb_typeof(capture->'criterion') = 'object' OR capture->'criterion' = 'null'::jsonb)
 ) IS TRUE),
 CHECK (reference_snapshot IS NULL OR jsonb_typeof(reference_snapshot) = 'object')
);
CREATE INDEX pipeline_asbuilt_history ON public.pipeline_asbuilt_batches(project_id, recorded_at DESC, id DESC);
ALTER TABLE public.pipeline_asbuilt_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_asbuilt_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY pipeline_history_private ON public.pipeline_asbuilt_batches FOR SELECT USING (
 EXISTS(SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = public.current_user_id())
);
CREATE POLICY pipeline_history_append ON public.pipeline_asbuilt_batches FOR INSERT WITH CHECK (
 actor_id = public.current_user_id() AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = actor_id)
);
CREATE FUNCTION public.reject_pipeline_history_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Measured pipeline batches are append-only; retain the original and record a new revision.' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER pipeline_history_retained BEFORE UPDATE OR DELETE ON public.pipeline_asbuilt_batches
 FOR EACH ROW EXECUTE FUNCTION public.reject_pipeline_history_mutation();
-- DOWN: Field evidence must not be silently discarded.
DO $$ BEGIN RAISE EXCEPTION 'Pipeline history is evidence-forward-only; use a reviewed forward migration.' USING ERRCODE='55000'; END; $$;
