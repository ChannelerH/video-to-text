ALTER TABLE "v2tx_users"
  ADD COLUMN IF NOT EXISTS subscription_pending_plan varchar(50),
  ADD COLUMN IF NOT EXISTS subscription_pending_schedule_id varchar(255),
  ADD COLUMN IF NOT EXISTS subscription_pending_effective_at timestamptz;
