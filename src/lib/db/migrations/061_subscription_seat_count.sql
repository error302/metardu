-- Migration: Add seat_count to user_subscriptions for per-seat billing
-- Per-seat plans (Team, Firm) include a base number of seats.
-- This column tracks how many ADDITIONAL seats have been purchased
-- beyond the plan's included base seats.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS seat_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_subscriptions.seat_count IS
  'Number of additional seats purchased beyond the plan base includedSeats. '
  'Effective member limit = plan.includedSeats + seat_count.';
