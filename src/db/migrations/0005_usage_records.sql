--记录用户使用统计与配额计算。按天/月聚合，用于限次/配额/溢出。
CREATE TABLE IF NOT EXISTS v2tx_usage_records (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  date VARCHAR(16) NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  model_type VARCHAR(32) NOT NULL DEFAULT 'standard',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON v2tx_usage_records(user_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_user_created ON v2tx_usage_records(user_id, created_at);

