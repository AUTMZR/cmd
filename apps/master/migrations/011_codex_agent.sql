-- Add Codex CLI status beside Claude and Gemini.

ALTER TABLE pc.devices
  ADD COLUMN IF NOT EXISTS codex_installed BOOLEAN,
  ADD COLUMN IF NOT EXISTS codex_version   TEXT,
  ADD COLUMN IF NOT EXISTS codex_logged_in BOOLEAN;

COMMENT ON COLUMN pc.devices.preferred_agent IS 'claude-code | gemini-cli | codex-cli | aider — какой CLI агент использовать по умолчанию на этом девайсе';
