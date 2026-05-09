-- 014: Web Push subscriptions for PWA notifications.
--
-- One row per (user, browser/device). `endpoint` is unique because the same
-- subscription identifies the same browser permission grant.
--
-- We delete on 410/404 push responses (subscription revoked by the browser).

CREATE TABLE IF NOT EXISTS pc.push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES pc.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON pc.push_subscriptions(user_id);
