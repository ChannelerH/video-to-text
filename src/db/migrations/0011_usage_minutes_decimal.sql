-- Change minutes column to decimal to preserve fractional minutes
ALTER TABLE v2tx_usage_records
  ALTER COLUMN minutes TYPE numeric(10,2) USING minutes::numeric;
ALTER TABLE v2tx_usage_records
  ALTER COLUMN minutes SET DEFAULT 0;

