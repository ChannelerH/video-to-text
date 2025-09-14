-- 存储“分钟包”逐笔记录（类型、总量、剩余、到期、来源订单），支持“先到期先消耗”与 12 个月/按商品有效期。
-- 发包时插入记录，转写完成时优先从包扣减；账户页统计剩余与最早到期。
CREATE TABLE IF NOT EXISTS v2tx_minute_packs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  pack_type VARCHAR(16) NOT NULL, -- 'standard' | 'high_accuracy'
  minutes_total INTEGER NOT NULL,
  minutes_left INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  order_no VARCHAR(255) DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_minute_packs_user ON v2tx_minute_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_minute_packs_user_exp ON v2tx_minute_packs(user_id, expires_at);

