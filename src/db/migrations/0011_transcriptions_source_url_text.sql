-- Expand v2tx_transcriptions.source_url to TEXT to store long provider URLs
ALTER TABLE v2tx_transcriptions
  ALTER COLUMN source_url TYPE TEXT;

