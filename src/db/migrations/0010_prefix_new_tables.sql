-- Rename non-prefixed tables to v2tx_* to keep naming consistent
DO $$ BEGIN
  IF to_regclass('public.usage_records') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE usage_records RENAME TO v2tx_usage_records';
  END IF;
  IF to_regclass('public.q_jobs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE q_jobs RENAME TO v2tx_q_jobs';
  END IF;
  IF to_regclass('public.q_leases') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE q_leases RENAME TO v2tx_q_leases';
  END IF;
  IF to_regclass('public.user_minutes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE user_minutes RENAME TO v2tx_user_minutes';
  END IF;
  IF to_regclass('public.minute_packs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE minute_packs RENAME TO v2tx_minute_packs';
  END IF;
END $$;

