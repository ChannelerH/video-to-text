ALTER TABLE v2tx_users
  ADD COLUMN IF NOT EXISTS subscription_state VARCHAR(50) DEFAULT 'inactive';

UPDATE v2tx_users
SET subscription_state = subscription_status
WHERE subscription_status IS NOT NULL;
