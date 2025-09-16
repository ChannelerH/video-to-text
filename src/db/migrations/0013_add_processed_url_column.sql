-- Add processed_url column to store R2/proxy URLs separately from original source URLs
-- This allows us to keep the original YouTube/audio URL while also storing the processed URL
ALTER TABLE v2tx_transcriptions 
ADD COLUMN IF NOT EXISTS processed_url TEXT;

-- Add index for potential lookups by processed URL
CREATE INDEX IF NOT EXISTS idx_transcriptions_processed_url 
ON v2tx_transcriptions(processed_url);

-- Comment for documentation
COMMENT ON COLUMN v2tx_transcriptions.processed_url IS 'Processed URL (R2, proxy) - used for re-runs within 24h';
COMMENT ON COLUMN v2tx_transcriptions.source_url IS 'Original URL provided by user (YouTube, audio URL, etc.)';