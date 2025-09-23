-- Add retention offer tracking fields to users table
ALTER TABLE users
ADD COLUMN retention_offer_used BOOLEAN DEFAULT FALSE,
ADD COLUMN retention_offer_claimed_at TIMESTAMP,
ADD COLUMN retention_offer_expires_at TIMESTAMP,
ADD COLUMN retention_coupon_id VARCHAR(255),
ADD COLUMN retention_discount_percent INTEGER,
ADD COLUMN retention_discount_months INTEGER;

-- Create index for faster queries
CREATE INDEX idx_users_retention_offer ON users(retention_offer_used, retention_offer_expires_at);