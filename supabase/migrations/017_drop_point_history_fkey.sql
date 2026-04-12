-- Drop the strict foreign key on point_history.point_id to allow logging point deletions
ALTER TABLE point_history DROP CONSTRAINT IF EXISTS point_history_point_id_fkey;
