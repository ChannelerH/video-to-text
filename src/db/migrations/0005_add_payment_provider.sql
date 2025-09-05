-- Ensure v2tx_orders has payment_provider column (for older DBs)
ALTER TABLE IF EXISTS v2tx_orders
  ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'stripe';

