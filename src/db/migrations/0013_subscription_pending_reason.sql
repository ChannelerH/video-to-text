ALTER TABLE "v2tx_users"
  ADD COLUMN IF NOT EXISTS subscription_pending_reason varchar(255),
  ADD COLUMN IF NOT EXISTS subscription_pending_feedback text;
