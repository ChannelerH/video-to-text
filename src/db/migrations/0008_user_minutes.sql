-- 聚合表，用于快速读取用户标准/高精度分钟余额（由 minute_packs 汇总刷新）。
-- 前端余额展示的快捷数据源（同时保留逐包实际数据）。
CREATE TABLE IF NOT EXISTS v2tx_user_minutes (
  user_id VARCHAR(64) PRIMARY KEY,
  std_balance INTEGER NOT NULL DEFAULT 0,
  ha_balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

