-- Add processed_url field to store R2/proxy URLs separately from original source_url
ALTER TABLE v2tx_transcriptions 
ADD COLUMN processed_url TEXT;

-- Add index for processed_url for potential lookups
CREATE INDEX idx_transcriptions_processed_url ON v2tx_transcriptions(processed_url);