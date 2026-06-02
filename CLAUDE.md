# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 0. Говори простым языком

**Автор проекта — не профессиональный разработчик. Объясняй так, чтобы понял обычный человек.**

- Пиши по-русски, простыми словами, как другу без технического бэкграунда.
- Любой технический термин (API, proxy, multi-tenant, фуннель, SaaS, AGPL и т.п.) — поясняй в скобках одной фразой при первом упоминании.
- Не используй жаргон ради краткости. Лучше длиннее, но понятно.
- Перед сложным ответом дай короткое резюме «в двух словах», потом детали.
- Если без термина никак — сразу приведи бытовую аналогию.
- Код и идентификаторы оставляй как есть, но рядом объясняй, что они делают.

Тест: «Понял бы это человек, который не программирует?» Если нет — переформулируй.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Продукт: Autmzr Cmd

> Кодовое имя пакета — `autmzr-cmd` ([package.json](package.json)). Бренд — **Autmzr**.

## Что это

Self-hosted, open-source веб-приложение для управления AI-coding CLI (Claude Code, Gemini CLI и др. по [ROADMAP.md](ROADMAP.md)) с телефона. Mobile-first контрольная панель для парка серверов и CLI-подписок.

**Killer-feature:** одна CLI-подписка, прицепленная к одному серверу, работает на всех остальных серверах флота через proxy-режим (см. [docs/architecture.md](docs/architecture.md) → "Multi-server proxy mode"). Реализуется через [packages/rfs-mcp](packages/rfs-mcp/) — Remote-FS MCP-сервер, который даёт CLI на CLI-host доступ к файлам project-host'а.

## Стратегические границы (что мы НЕ делаем)

Из [ROADMAP.md](ROADMAP.md) "Out of scope":
- ❌ Не редактор кода на телефоне как основная поверхность — мобайл для control, не для авторинга.
- ❌ Не реселлер LLM — пользователь приносит свою подписку/ключ.
- ❌ Не хостинг моделей.
- ❌ Не VPN.
- ❌ Никакой closed-source enterprise-edition. AGPL-3.0 — единственная лицензия.

## Архитектура (3 компонента)

```
Browser ──HTTPS──▶ Master (Next.js 14 + Postgres) ──WSS──▶ Agent (Node, на устройстве пользователя)
                                                                │
                                                                ▼
                                                        spawns claude / gemini / bash / fs-ops
```

| Компонент | Где живёт | Роль |
|---|---|---|
| **Master** | [apps/master/](apps/master/), Next.js 14 App Router, порт 3100 | UI + REST API + кастомный WS-hub. Не спавнит CLI. Никогда не читает токены сторонних CLI. |
| **Agent** | [apps/agent/](apps/agent/), single-file Node bundle | Outbound WSS к мастеру с per-device токеном. Спавнит CLI/bash/fs локально. Reconnect с backoff, systemd/launchd. |
| **Protocol** | [packages/protocol/src/index.ts](packages/protocol/src/index.ts) | Shared TS-типы JSON-сообщений `device.*`, `cli.*`, `term.*`, `fs.*`, `error.*`. |
| **rfs-mcp** | [packages/rfs-mcp/](packages/rfs-mcp/) | Remote-FS MCP-сервер для proxy-режима + whitelist project-roots. |

## Что где хранится

### Postgres (схема `pc.*`)

Единственное persistent-хранилище состояния мастера. Миграции в [apps/master/migrations/](apps/master/migrations/) (001…010 на момент написания).

| Таблица | Содержит |
|---|---|
| `pc.users` | email (CITEXT), bcrypt password_hash, is_admin |
| `pc.user_sessions` | server-side cookie sessions (id, user_id, last_active) |
| `pc.devices` | подключённые устройства: `token_hash`, `kind`, `hostname`, `os/arch`, `capabilities` (jsonb), `agent_version`, `agent_installed`, `agent_logged_in`, `agent_kind`, `intent`, `root_path`, `last_online` |
| `pc.projects` | проекты на устройствах: `device_id` (project-host), `claude_device_id` (CLI-host для proxy), `path`, `instructions`, `default_model` |
| `pc.sessions` | чат-сессии: `project_id`, `claude_session_id`, `model`, `title` |
| `pc.messages` | история чата: `role` (user/assistant/system), `content`, `tool_events` (jsonb) |
| `pc.chat_jobs` | running/finished jobs для streaming chat (idx по `status='running'`) |
| `pc.rfs_tokens` | временные токены доступа Remote-FS MCP к project-host'ам |
| `pc.invite_codes` | invite-коды для регистрации |
| `pc.auth_audit` | аудит логинов: email, ip, ts |

Локальная БД: `data/pg/` (volume в [docker-compose.yml](docker-compose.yml)). В деве слушает на `127.0.0.1:5432`.

### Что НЕ хранится в мастере

- **Токены CLI** (`~/.claude/`, `~/.config/gemini/`, …) — остаются на устройстве, agent их **не читает** (заблокировано на уровне протокола, paths matching этих путей режутся в [packages/rfs-mcp](packages/rfs-mcp/)).
- **Исходники проектов** — файлы живут только на agent-устройствах; мастер видит их через `fs.*` сообщения протокола.
- **API-ключи третьих сторон** — если шифруются (например, GitHub OAuth), то ключом `INTEGRATION_KEY` (AES-256-GCM, см. [.env.example](.env.example) и [apps/master/src/lib/crypto.ts](apps/master/src/lib/crypto.ts)).

### Файловые артефакты

- [apps/master/public/agent.js](apps/master/public/) — собранный agent-bundle, который качается через `connect.sh`.
- [apps/master/scripts/](apps/master/scripts/) — CLI-утилиты (миграции, setup).
- [scripts/setup.ts](scripts/) — корневой setup-wizard (`npm run setup`).
- На agent-устройстве: `~/.autmzr/` — конфиг + per-device token.

## Ключевые модули мастера

Из [apps/master/src/lib/](apps/master/src/lib/):

| Файл | Зачем |
|---|---|
| `db.ts` | pg-клиент |
| `auth.ts`, `csrf.ts`, `csrf-const.ts` | session cookie + CSRF |
| `ws-hub.ts` | роутинг WS-сообщений между browser и agent |
| `rfs-tokens.ts` | выдача и валидация Remote-FS токенов |
| `crypto.ts` | AES-256-GCM для интеграционных секретов |
| `cli-error-parser.ts` | человекочитаемые ошибки claude/gemini (auth, rate limit, geo) |
| `models.ts` | поддерживаемые модели и их выбор per-project / per-session |
| `device-intent.ts`, `job-tracker.ts` | состояние устройств и долгоживущих job'ов |
| `audit.ts`, `rate-limit.ts` | аудит-логи и троттлинг auth |
| `useSpeechRecognition.ts` | hook для voice-input через Web Speech API |

API routes — [apps/master/src/app/api/](apps/master/src/app/api/): `auth`, `chat`, `devices`, `exec`, `fs`, `healthz`, `projects`, `rfs`, `sessions`.

Agent handlers — [apps/agent/src/handlers/](apps/agent/src/handlers/): `claude.ts`, `pty.ts`, `exec.ts`, `fs.ts`, `status.ts`.

## Границы безопасности

Из [docs/architecture.md](docs/architecture.md):

| Граница | Защита |
|---|---|
| Browser ↔ Master | TLS, session cookie, CSRF на mutating операциях |
| Master ↔ Agent | TLS, per-device токен, agent-initiated outbound only (никаких inbound портов на устройстве) |
| Agent ↔ CLI | Прямой local spawn; auth остаётся в `~/.claude/` и т.п., agent не читает |
| Agent FS-операции | Через `rfs-mcp` с whitelist project-roots; пути `~/.claude/*` режутся протоколом |

## Текущий статус

- **v0.1.0** — shipped, single-user MVP, см. [CHANGELOG.md](CHANGELOG.md) и [ROADMAP.md](ROADMAP.md).
- **Текущий фокус (v0.2):** Codex CLI integration, push notifications (PWA), Plugin API, GitHub OAuth, agent auto-update.
- Лицензия: **AGPL-3.0-or-later** ([LICENSE](LICENSE)). Для модификаций, предлагаемых как hosted service, обязателен release исходников под той же лицензией.

## Как запускается локально

```bash
docker compose up -d   # Postgres
npm run setup          # wizard, пишет .env
npm run migrate        # apply migrations 001…N
npm run dev            # master + agent параллельно через concurrently
```

Healthcheck мастера: `GET /api/healthz` ([apps/master/src/app/api/healthz/](apps/master/src/app/api/healthz/)).

Env-переменные: см. [.env.example](.env.example). Критичные — `SESSION_SECRET`, `DATABASE_URL`, `PUBLIC_URL`, `INTEGRATION_KEY`, `SINGLE_USER_MODE`.
