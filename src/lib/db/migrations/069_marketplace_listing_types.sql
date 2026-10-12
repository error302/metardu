-- Migration 069: align persisted equipment listing types with the marketplace UI/API.
-- Migration 033 accepted "trade", while the current form and POST route offer
-- "wanted". Preserve any legacy trade rows rather than recasting their meaning.
-- UP:
ALTER TABLE instrument_listings
  DROP CONSTRAINT IF EXISTS instrument_listings_type_check;

ALTER TABLE instrument_listings
  ADD CONSTRAINT instrument_listings_type_check
  CHECK (type IN ('sale', 'rent', 'wanted', 'trade'));

-- DOWN: Manual rollback requires resolving wanted rows before restoring the
-- previous sale/rent/trade constraint. The migration runner executes full SQL
-- files on apply, so rollback instructions remain comments here.