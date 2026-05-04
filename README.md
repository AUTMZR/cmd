# Autmzr

> **All your VPS and CLIs in one mobile interface.**
> Plug any CLI into one server — and use it across all the others. Ship a deploy from a cab, check prod logs in the coffee line, fix a config from the couch — by voice.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Self-hosted](https://img.shields.io/badge/self--host-friendly-green)](#quick-start)
[![Mobile-first](https://img.shields.io/badge/mobile--first-yes-orange)]()

**Languages:** **English** · [Русский](LANDING_RU.md) · [中文](LANDING_ZH.md)

---

## What it does

Autmzr is an open-source, self-hosted web app that lets you drive AI coding CLIs (Claude Code, Gemini CLI, and more on the roadmap) running on your own servers — from your phone.

**The killer feature:** plug a CLI subscription into *one* server and use it from any other server you own. One subscription, every machine.

- 📱 **Mobile-first.** Designed for thumbs, not adapted from a desktop UI.
- 🌐 **Multi-server.** Manage your fleet from one screen.
- 🔌 **Multi-CLI.** Claude Code + Gemini today. Codex, Aider, Cursor on the roadmap.
- 🎙️ **Voice input.** Long prompts on a phone = pain. Dictate them.
- 🔒 **Self-hosted.** Your servers, your keys, your data. Open source — verify it.
- ⏳ **Async-first.** Kick off a task, close the app, walk away. Agent keeps running on your server.

---

## Quick start

Requirements: Linux/macOS VPS with Docker, 2 GB RAM, a domain.

```bash
# 1. Clone
git clone https://github.com/autmzr/cmd.git
cd cmd

# 2. Run the setup wizard (5 questions)
npm run setup

# 3. Start
docker compose up -d
npm run migrate
npm run dev   # or `npm start` for production
```

Open `http://localhost:3100` and sign in.

For a one-liner installer (when public hosting is up):

```bash
curl https://cmd.autmzr.com/install | bash
```

---

## Connect a device

In the UI: **Settings → + Device → copy the command**. Run it on any server or workstation:

```bash
curl -sSL https://your-master.com/connect.sh | \
  bash -s -- --master wss://your-master.com/ws/agent --token XXX --name home-mac
```

The script:
- Downloads `agent.js` (~2 MB)
- Drops a config in `~/.autmzr/`
- Installs a systemd user unit (Linux) or launchd plist (macOS)
- Connects the agent to the master — the device shows up 🟢 online in the UI

**Required on the device:** `node >= 20` and one CLI (`claude`, `gemini`, …) authenticated locally. **Autmzr never reads, ships, or attempts to use your CLI auth tokens** — they stay in `~/.claude/`, `~/.config/gemini/`, etc., on the device that owns them.

---

## Architecture

Three components:

```
Browser  ──HTTPS──▶  Master (Next.js + Postgres)  ──WSS──▶  Agent (Node, on your device)
                                                                    │
                                                                    ▼
                                                            spawns claude / gemini / ...
```

- **Master** — UI + database + message router. Never spawns CLIs. Never stores third-party secrets.
- **Agent** — standalone Node binary, single file. Receives commands from the master, spawns CLIs, streams responses back.
- **Protocol** — JSON over WebSocket. All types live in `packages/protocol`.

Full details: [docs/architecture.md](docs/architecture.md).

---

## Security model

**If you self-host, we have nothing of yours.**

| Property | Implementation |
|---|---|
| API keys & OAuth tokens | Stay in your Postgres only — never leave your infrastructure |
| Agent context, sessions | Same — your DB only |
| Reading `~/.claude/*` etc. | Blocked at the protocol layer; the agent literally cannot do this |
| Inbound ports | None. Agent initiates outbound WebSocket, that's it |
| License | AGPL-3.0 — verify the code yourself |

In the cloud version (`$4.99/mo`, hosted by us): same model + encryption-at-rest. Keys decrypt only at agent-spawn time. If you don't trust us, run self-host. That's the entire point.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Why this exists (positioning)

In the last 12 months the "drive Claude Code from your phone" market went from empty to crowded:

- **Anthropic Remote Control** (Feb 2026) — official, but locked to Claude and one device per session.
- **Happy** (~19.7k stars) — polished mobile, but depends on a third-party sync server.
- **CloudCLI** (~10.5k stars) — multi-vendor, but single-machine.
- **Meridian** (~1k stars) — multi-server proxy, but no UI.
- **Telegram bots** — die at 5-min timeouts, fragile in regions where Telegram itself is throttled.

**The whitespace:** nobody offers *all* of these in one self-hosted package — multi-CLI × multi-server × mobile UI × your-keys-only.

That's what Autmzr is.

---

## Roadmap

### v0.1 (current) — single user, self-hosted, MVP
- [x] Master + agent + shared protocol monorepo
- [x] Email/password auth
- [x] Devices: add / list / remove + online status
- [x] Projects bound to devices
- [x] Chat → Claude / Gemini on-device with streaming
- [x] Terminal → bash on-device
- [x] FileTree / FileEditor through agent
- [x] Docker Compose + SSL via Caddy
- [x] Three themes: Soft / Light / Dark
- [x] Voice input (Web Speech API)

### v0.2 — integrations & DX
- [ ] Codex CLI integration
- [ ] Push notifications (PWA)
- [ ] Plugin API for community CLIs
- [ ] Auto-update via GitHub Releases
- [ ] GitHub OAuth + clone-as-project

### v0.3 — multi-vendor expansion
- [ ] Aider integration
- [ ] Cursor CLI integration
- [ ] Anything else the community asks for via PR

### v0.4 — multi-user
- [ ] Google/GitHub OAuth login
- [ ] Self-serve registration for the cloud tier
- [ ] Cross-project orchestration

### v0.5 (further out) — teams
- [ ] Team workspaces
- [ ] SSO (SAML/OIDC)
- [ ] Audit log
- [ ] RBAC

See full plan in [ROADMAP.md](ROADMAP.md).

---

## Pricing

- **Self-host** — free forever, AGPL-3.0, every feature, no limits, no telemetry.
- **Cloud version** — $4.99/mo, 14-day free trial. We host it, you don't deal with VPSes. Auto-updates, session backups, support. Your CLI subscription/key is still yours — we don't resell tokens.

Honest note: this project is built by one person. The paid tier is how it stays maintained. The OSS is the whole product.

---

## Contributing

Contributions welcome — bug reports, fixes, new CLI integrations, docs, translations.

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Architectural overview: [docs/architecture.md](docs/architecture.md)

Easy first issues are tagged [`good first issue`](https://github.com/autmzr/cmd/labels/good%20first%20issue).

---

## License

[AGPL-3.0-or-later](LICENSE).

This means: you can use, modify, and run Autmzr commercially or non-commercially. If you offer Autmzr (or a modified version) **as a hosted service to others**, you must publish your modifications under the same license. This protects the project from being forked into a closed-source SaaS competitor.

If AGPL doesn't fit your use case, [open an issue](https://github.com/autmzr/cmd/issues) — we may consider a commercial license.

---

## Project structure

```
apps/master/         # Next.js 14 + custom WS server (port 3100)
  src/app/           # App Router pages + API routes
  src/components/    # AppShell, DeviceSheet, DevicesList, etc.
  src/lib/           # auth, db, ws-hub, models, cli-error-parser
  migrations/        # 001-NNN_*.sql
  public/agent.js    # Bundled agent, served on download
apps/agent/          # Standalone Node, WS-reconnect, claude/gemini handlers
packages/protocol/   # Shared types (@autmzr/command-protocol)
packages/rfs-mcp/    # Remote-FS MCP server for proxy mode
```

---

## Links

- **Website:** [autmzr.com](https://autmzr.com)
- **Docs:** [docs/](docs/)
- **Issues / Discussions:** [GitHub Issues](https://github.com/autmzr/cmd/issues)
- **Security:** [SECURITY.md](SECURITY.md)

---

Made with ☕ in 2026.

## Languages

- [English (default)](LANDING_EN.md)
- [Russian](LANDING_RU.md)
- [Chinese](LANDING_ZH.md)
- [Spanish](LANDING_ES.md)
