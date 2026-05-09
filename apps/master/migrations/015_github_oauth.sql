-- 015: GitHub OAuth — связываем pc.users с GitHub-аккаунтом.
--
--   github_id           — численный id юзера на GitHub (immutable)
--   github_login        — username (login), может меняться
--   github_avatar_url   — URL аватара
--   github_access_token — зашифрован INTEGRATION_KEY (lib/crypto.ts), нужен для
--                         запросов к /user/repos и т.п. от лица юзера.
--                         Хранится в plaintext-формате `iv.tag.cipher` (base64).
--
-- password_hash становится NULLABLE: GitHub-only юзеры не имеют пароля.

ALTER TABLE pc.users
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS github_id BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS github_login TEXT,
  ADD COLUMN IF NOT EXISTS github_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS github_access_token TEXT;

CREATE INDEX IF NOT EXISTS users_github_id_idx ON pc.users(github_id);
