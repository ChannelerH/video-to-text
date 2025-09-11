-- v2tx_transcription_edits: store user-edited chapters/titles etc.
CREATE TABLE IF NOT EXISTS v2tx_transcription_edits (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  job_id VARCHAR(64) NOT NULL,
  user_uuid VARCHAR(255) NOT NULL,
  content TEXT NOT NULL, -- JSON string of edited structure { chapters: [...], updatedAt }
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS v2tx_transcription_edits_job_user_unique
  ON v2tx_transcription_edits (job_id, user_uuid);

