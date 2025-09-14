-- DB 持久化队列表。记录排队任务（job_id、tier、创建/选取时间、完成状态）。
-- 在启用队列（Q_ENABLED=true）时，支持“全局并发 + PRO 优先”的取号与位次计算。
CREATE TABLE IF NOT EXISTS v2tx_q_jobs (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  tier VARCHAR(32) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  picked_at TIMESTAMP NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_q_jobs_tier_created ON v2tx_q_jobs(tier, created_at);
CREATE INDEX IF NOT EXISTS idx_q_jobs_running ON v2tx_q_jobs(tier, picked_at, done);
CREATE UNIQUE INDEX IF NOT EXISTS uq_q_jobs_job_id ON v2tx_q_jobs(job_id);

