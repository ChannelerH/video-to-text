-- Email Feedback System Migration
-- Created: 2024-12-25
-- Description: Add tables and fields for email feedback and rewards system

-- 1. Extend users table with geo and language information
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS country VARCHAR(2);
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS browser_language VARCHAR(10);
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS email_language VARCHAR(10) DEFAULT 'en';
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS optimal_send_hour INTEGER DEFAULT 9;

-- Create index for timezone queries
CREATE INDEX IF NOT EXISTS idx_users_timezone ON v2tx_users(timezone, optimal_send_hour);

-- 2. Email rewards tracking table (prevent duplicate rewards)
CREATE TABLE IF NOT EXISTS v2tx_email_rewards (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  campaign_id VARCHAR(50) NOT NULL, # 是哪一个邮件活动送出的奖励，例如 day_3_activation、win_back 等，用来区分不同 campaign。
  minutes_granted INTEGER NOT NULL, # 这次活动赠送的标准分钟数（整数）。
  pack_id INTEGER, # 赠送的分钟包 id，用来关联到 minute_packs 表，可以用来查询赠送的分钟包信息。
  status VARCHAR(20) DEFAULT 'pending', #奖励状态，默认 pending，业务里会更新为 completed / failed 等，用来做重试或统计。
  granted_at TIMESTAMP WITH TIME ZONE, # 赠送的时间
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_uuid, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_email_rewards_user ON v2tx_email_rewards(user_uuid);
CREATE INDEX IF NOT EXISTS idx_email_rewards_status ON v2tx_email_rewards(status);

-- 3. User feedback tracking table
CREATE TABLE IF NOT EXISTS v2tx_user_feedback (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  feedback_type VARCHAR(50),
  content TEXT,
  status VARCHAR(50) DEFAULT 'received',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  implemented_at TIMESTAMP WITH TIME ZONE,
  related_feature_id INTEGER,
  response TEXT,
  user_notified BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON v2tx_user_feedback(user_uuid, status);
CREATE INDEX IF NOT EXISTS idx_user_feedback_priority ON v2tx_user_feedback(priority DESC, created_at);

-- 4. Email sending history and analytics
CREATE TABLE IF NOT EXISTS v2tx_email_history (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  campaign_id VARCHAR(50),
  email_type VARCHAR(50),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  unsubscribed BOOLEAN DEFAULT FALSE,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_email_history_user ON v2tx_email_history(user_uuid);
CREATE INDEX IF NOT EXISTS idx_email_history_campaign ON v2tx_email_history(campaign_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_history_analytics ON v2tx_email_history(opened_at, clicked_at);

-- 5. Email campaign logs for monitoring
CREATE TABLE IF NOT EXISTS v2tx_email_campaign_logs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50),
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  emails_sent INTEGER DEFAULT 0,
  emails_failed INTEGER DEFAULT 0,
  minutes_granted_total INTEGER DEFAULT 0,
  errors TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_date ON v2tx_email_campaign_logs(executed_at DESC);