-- Add original total duration for transcriptions
ALTER TABLE v2tx_transcriptions
  ADD COLUMN IF NOT EXISTS original_duration_sec INTEGER NOT NULL DEFAULT 0;

