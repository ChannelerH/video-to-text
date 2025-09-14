--  任务租约/锁的预留表（含 expires_at 索引），用于分布式抢占/续租等高级队列场景。
CREATE TABLE IF NOT EXISTS v2tx_q_leases (
  id SERIAL PRIMARY KEY,
  tier VARCHAR(32) NOT NULL,
  lease_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_q_leases_tier ON v2tx_q_leases(tier);
CREATE INDEX IF NOT EXISTS idx_q_leases_expires ON v2tx_q_leases(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_q_leases_lease_id ON v2tx_q_leases(lease_id);

