# Launch assets

Copy-paste ready text for the v0.2 launch. Tweak voice/numbers before posting — these are templates, not final.

---

## Product Hunt

**Tagline (60 chars max):**
> Drive your AI coding CLIs from your phone. Self-hosted.

**Description (260 chars):**
> Mobile control panel for Claude Code, Gemini CLI, and Codex running on your own servers. Plug a CLI subscription into one box, use it from any other. Open source (AGPL). 14-day trial on hosted; self-host for free, forever.

**Gallery shots (in order):**
1. Hero — phone screenshot of chat
2. Devices list — multi-server view
3. Project create wizard
4. GitHub clone-as-project (new)
5. Subscription / trial banner
6. Desktop split-pane view

**First comment (Maker):**
> Hi PH! I built Autmzr Command because I kept wanting to ship a quick fix from a coffee line and couldn't — my Claude subscription was tied to one machine, and SSHing from a phone is misery.
>
> Three things I want feedback on:
> 1. The killer feature — *one* CLI subscription, *every* server you own (proxy mode).
> 2. Async-by-default. You start a task, close the app, the agent keeps going on your VPS.
> 3. We're AGPL — pick the cloud version or run it yourself, same code.
>
> Roadmap right now: GitHub OAuth + clone-from-repo (just shipped), agent auto-update (just shipped), Plugin API for community providers (just shipped). Aider and Cursor next.
>
> Try it: https://cmd.autmzr.com — 14 days free, no card. Or `git clone github.com/AUTMZR/cmd && npm run setup`.

---

## Hacker News (Show HN)

**Title:**
> Show HN: Autmzr Command – Mobile control for Claude Code, Gemini CLI, Codex

**Body:**
> Hi HN. Self-hosted, open-source web app to drive AI coding CLIs from a phone — chat, terminal, file ops, all running against your own VPS or laptop.
>
> Why I built it: Claude subscriptions sit on one machine. If I want to push a small fix from anywhere else (a phone, a different laptop), I'm stuck. Autmzr lets you plug a CLI into one server and proxy its session into any other server you own — one subscription, every box.
>
> Architecture is intentionally boring: Next.js master + standalone Node agent per device, WebSocket between them, agent talks to the local CLI. The agent never sends your `~/.claude` tokens up; the master never sees your code unless you ask it to.
>
> Recent work I'd love feedback on:
>  - Plugin API for community providers (think Aider, Cursor): https://github.com/AUTMZR/cmd/blob/main/docs/plugin-api.md
>  - Agent self-update via WS handshake (no rebuild scripts to remember)
>  - Web Push for "task done while you were on the bus"
>
> AGPL-3.0. Hosted at cmd.autmzr.com (14-day trial), or `npm run setup` locally. Repo: https://github.com/AUTMZR/cmd.
>
> Open to honest critique on the proxy-mode design and on what'd unblock you from adopting this for real work.

---

## Reddit r/selfhosted

**Title:**
> [Project] Autmzr Command — self-hosted mobile UI for Claude Code / Gemini / Codex CLIs

**Body:**
> Yet another AI dev tool, but this one's optimized for a use case the cloud players don't touch: **driving AI coding CLIs from your phone, against servers you own.**
>
> Stack:
>  - Master: Next.js 14 + Postgres
>  - Agent: single-file Node bundle (one per device)
>  - WSS between them, agent-initiated outbound only — no inbound port on your servers
>  - AGPL-3.0
>
> What it does:
>  - Run Claude Code / Gemini CLI / Codex CLI on any server you have an agent on
>  - Chat, file editor, persistent terminal (xterm.js + PTY)
>  - **Killer feature:** one CLI subscription on one server, proxy it to all your other servers (via a Remote-FS MCP)
>  - Push notifications when long jobs finish
>  - 14-day trial on the hosted version, or self-host with no time limits
>
> Setup:
> ```
> git clone https://github.com/AUTMZR/cmd
> cd cmd
> npm run setup   # 5 questions
> docker compose up -d
> npm run migrate
> npm start
> ```
>
> Live demo: cmd.autmzr.com.
> Repo: https://github.com/AUTMZR/cmd.
>
> Roadmap is open in the README — Aider, Cursor CLI, plugin marketplace, etc. PRs welcome.

---

## Reddit r/ClaudeAI / r/LocalLLaMA

**Title:**
> Mobile UI for Claude Code that's actually usable on a phone (open source)

**Body:**
> If you ever wanted to push a fix from a coffee line and gave up because terminal-on-phone is misery — built this.
>
> Self-hosted Next.js app that talks to Claude Code (and Gemini CLI / Codex) running on your own VPS via a tiny agent. Claude session lives on the server, you drive it from the phone. Voice input, file editor, persistent terminal, async jobs that survive the app being closed.
>
> AGPL, 14-day trial on cmd.autmzr.com, or self-host: github.com/AUTMZR/cmd.
>
> Honestly curious what'd make this useful for your workflow.

---

## Twitter / X thread

**1/** Built and shipped: Autmzr Command — a mobile-first, self-hosted UI for AI coding CLIs (Claude Code, Gemini CLI, Codex).
>
> Drive your AI coding session from your phone, against your own servers.
>
> 🔗 cmd.autmzr.com

**2/** The killer feature: one CLI subscription, every server.
>
> Plug Claude Code into one box, use it from any other server you own through a remote-FS proxy. The CLI never knows it's not running locally.

**3/** Async-by-default. Kick off a long task, close the app, walk into a meeting.
>
> The agent keeps running on your server. Push notification when it's done.

**4/** Self-hosted? Yes. AGPL-3.0.
> No vendor lock-in. Your tokens, your code, your servers.
> Or use the hosted version (14-day trial, no card).

**5/** Open source: github.com/AUTMZR/cmd
>
> Just shipped: GitHub OAuth + clone-from-repo, agent auto-update, Plugin API for community providers (Aider/Cursor next).

---

## Telegram канал (RU)

**Пост:**
> Зарелизил v0.2 Autmzr Command — мобильную панель для AI coding CLIs (Claude Code, Gemini, Codex), которую крутишь со своего телефона на свои серверы.
>
> Что нового за последние две недели:
> — публичная регистрация + 14-дневный trial
> — push-уведомления когда долгая задача завершилась (PWA, iOS Safari тоже)
> — GitHub OAuth + clone-as-project
> — auto-update агента через WS-handshake
> — Plugin API: можно писать свои интеграции с любым AI CLI (доки в репе)
>
> Self-host: github.com/AUTMZR/cmd, AGPL, локально через `npm run setup`.
> Hosted: cmd.autmzr.com, trial без карты.
>
> Open source целиком. Если кто пробовал и есть фидбек — пишите, буду благодарен.

---

## vc.ru / Хабр (RU long-form)

> *(Заготовка title)* «Self-hosted мобильная панель для AI-coding CLI: запускаем Claude Code с телефона на свой VPS — open source проект Autmzr Command»
>
> Структура:
>  1. Контекст — почему вообще нужен мобильный driver для AI CLI
>  2. Что есть на рынке (Anthropic Remote, Happy, Cursor, Cloud Code) и почему ничего не подошло
>  3. Архитектура (master / agent / proxy mode) — диаграмма
>  4. Демо: фикс бага из метро. 5 скриншотов
>  5. Self-hosted vs hosted — почему AGPL, какие планы
>  6. Roadmap, как присоединиться
>
> *(черновик пишется отдельным документом, не сюда)*

---

## Pre-launch checklist

- [ ] Replace `cmd.autmzr.com` placeholders if domain changes
- [ ] Verify OG image renders on Twitter/Telegram/Slack/Discord (paste link, check preview)
- [ ] Test signup → email verify → /app loads
- [ ] Test trial expired → /upgrade flow
- [ ] Test push notification end-to-end (real phone, real task)
- [ ] Schedule posts: PH Tuesday 12:01 PT, HN same day 09:00 PT, Reddit 1h apart
- [ ] Have a "throwaway" account ready to verify signup as a stranger
