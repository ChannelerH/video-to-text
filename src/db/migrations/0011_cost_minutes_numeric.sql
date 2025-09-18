-- Change cost_minutes to NUMERIC(10,3) to support fractional billing minutes
ALTER TABLE IF NOT EXISTS v2tx_transcriptions
  ALTER COLUMN cost_minutes TYPE NUMERIC(10,3) USING cost_minutes::numeric;

ALTER TABLE IF NOT EXISTS v2tx_transcriptions
  ALTER COLUMN cost_minutes SET DEFAULT 0;

-- Note: We intentionally do not backfill historical rows to fractional values
-- to avoid changing previously billed amounts. New records will write fractional
-- minutes; old records remain integers but compatible with NUMERIC.

