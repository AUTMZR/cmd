-- Add trial_until для public-signup flow.
-- Каждый новый non-admin юзер получает 14-дневный trial с момента регистрации.
-- Админы и self-host пользователи trial_until = NULL (бесконечный доступ).

ALTER TABLE pc.users
  ADD COLUMN IF NOT EXISTS trial_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_trial_until ON pc.users (trial_until)
  WHERE trial_until IS NOT NULL;
