-- Transcription storage (results only, no raw media)
CREATE TABLE IF NOT EXISTS v2tx_transcriptions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL UNIQUE,
  user_uuid VARCHAR(255) NOT NULL DEFAULT '',
  source_type VARCHAR(50) NOT NULL,
  source_hash VARCHAR(255) NOT NULL,
  source_url VARCHAR(1024),
  title VARCHAR(512),
  language VARCHAR(50),
  duration_sec INTEGER NOT NULL DEFAULT 0,
  cost_minutes INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS v2tx_transcription_results (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  format VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ,
  CONSTRAINT transcription_result_unique UNIQUE (job_id, format)
);

