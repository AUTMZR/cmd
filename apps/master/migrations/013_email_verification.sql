-- Email verification для public-signup flow.
-- Существующих юзеров считаем verified (они уже работают, не ломаем им flow).

ALTER TABLE pc.users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- Backfill: всех созданных до этой миграции считаем verified.
UPDATE pc.users SET email_verified = true WHERE email_verified = false;

-- Дальше DEFAULT остаётся false — новые signup проходят через verify-flow.

COMMENT ON COLUMN pc.users.email_verified IS
  'true когда юзер кликнул по ссылке из verification email. Soft-блокировки: непроверенный юзер видит баннер, но может пользоваться.';

CREATE TABLE IF NOT EXISTS pc.email_verifications (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES pc.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON pc.email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON pc.email_verifications(expires_at);
