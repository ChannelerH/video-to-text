-- Basic refunds table to track refund transactions
CREATE TABLE IF NOT EXISTS v2tx_refunds (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  stripe_payment_intent VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(16) NOT NULL DEFAULT 'usd',
  reason VARCHAR(128) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

