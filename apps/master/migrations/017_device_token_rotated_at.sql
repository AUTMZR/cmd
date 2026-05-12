-- 017: pc.devices.token_rotated_at — when the device's per-token was last reissued.
-- Surfaced in UI so users can spot a hijack ("device token rotated yesterday — wasn't me").

ALTER TABLE pc.devices
  ADD COLUMN IF NOT EXISTS token_rotated_at TIMESTAMPTZ;
