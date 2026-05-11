# Launch assets

Ready-to-publish copy for the v0.2 launch. Tweak before posting if voice feels off; the wording's been calibrated to platform norms.

**Schedule** (suggested, Pacific Time):
- Tue 06:00 PT — Telegram post (RU audience wakes up)
- Tue 09:00 PT — Show HN
- Tue 09:30 PT — Reddit r/selfhosted
- Tue 10:00 PT — Reddit r/ClaudeAI
- Tue 12:01 PT — Product Hunt (PH-day starts midnight PT but morning posts get more eyeballs)
- Tue 14:00 PT — X/Twitter thread

Stay in front of inbox + repo issues the first 4-6 hours after posting.

---

## Product Hunt

**Tagline** (60 chars max):

> Drive your AI coding CLIs from your phone. Self-hosted.

**Description** (260 chars max):

> Mobile control panel for Claude Code, Gemini CLI, and Codex running on your own servers. Plug a CLI subscription into one box, use it from any other. Open source (AGPL). 14-day trial on hosted; self-host free forever.

**Gallery (6 shots, in order):**
1. Hero — phone screenshot of chat with code edits
2. Devices list — multi-server view, online indicators
3. Add Device — SSH-install form (the killer "no terminal needed" shot)
4. Project create — GitHub clone-as-project flow
5. Codex / Gemini / Claude setup tabs in DeviceSheet
6. Desktop split-pane view (sidebar + chat)

**First comment (Maker):**

> Hi PH! I built Autmzr Command because I kept wanting to push a quick fix from a phone and couldn't — my Claude subscription was tied to one machine, and SSHing from a phone is misery.
>
> Three things I want feedback on:
>
> 1. **One subscription, every server.** Plug a Claude/Gemini/Codex CLI into one box, proxy its session into any other server you own. Killer feature for fleets.
> 2. **Phone-native install.** No terminal needed — type your VPS's SSH credentials in the app and it installs the agent for you. Works from a coffee shop.
> 3. **Async by default.** Kick off a task, close the app, walk away. The agent keeps running on your server. Push notification when it's done.
>
> Just shipped in v0.2: GitHub OAuth + clone-from-repo, agent auto-update via WS handshake, Plugin API so community can add Aider / Cursor / DeepSeek without forking, Codex CLI first-class parity.
>
> Try it: https://cmd.autmzr.com — 14 days free, no card. Or `git clone github.com/AUTMZR/cmd && npm run setup`.

---

## Hacker News (Show HN)

**Title** (80 chars max, keep tight):

> Show HN: Drive Claude Code / Gemini CLI / Codex from your phone, self-hosted

**Body:**

> Hi HN. Self-hosted, open-source web app to drive AI coding CLIs from a phone — chat, terminal, file ops, all running against your own VPS or laptop.
>
> Why I built it: Claude/Codex subscriptions sit on one machine. If I want to push a small fix from anywhere else (a phone, a different laptop), I'm stuck. Autmzr lets you plug a CLI into one server and proxy its session into any other server you own — one subscription, every box.
>
> Architecture is intentionally boring: Next.js master + standalone Node agent per device, WebSocket between them, agent talks to the local CLI. The agent never sends your `~/.claude` tokens up; the master never sees your code unless you ask it to. Master is stateless aside from Postgres; agent is a single-file Node bundle deployed via SSH or a one-liner curl.
>
> What I'd love feedback on:
>
>  - **Proxy mode** — Remote-FS over MCP, one CLI subscription speaks to multiple servers' filesystems: https://github.com/AUTMZR/cmd/tree/main/packages/rfs-mcp
>  - **Plugin API** — community can add any CLI without forking: https://github.com/AUTMZR/cmd/blob/main/docs/plugin-api.md
>  - **Phone install UX** — paste SSH creds in the modal, master installs the agent over SSH end-to-end. No terminal needed.
>
> AGPL-3.0. Try it: cmd.autmzr.com (14-day trial, no card) or `npm run setup` locally. Repo: github.com/AUTMZR/cmd.
>
> Open to honest critique on the proxy-mode design and what'd unblock you from adopting this for real work.

---

## Reddit r/selfhosted

**Title:**

> [Project] Autmzr Command — self-hosted mobile UI for Claude Code / Gemini / Codex CLIs

**Body:**

> Yet another AI dev tool, but optimized for a use case the cloud players don't touch: **driving AI coding CLIs from your phone, against servers you own.**
>
> Stack:
>  - **Master:** Next.js 14 + Postgres
>  - **Agent:** single-file Node bundle (one per device, ~70KB)
>  - **Transport:** WSS, agent-initiated outbound only — no inbound port on your servers
>  - **License:** AGPL-3.0
>
> What it does:
>  - Run Claude Code / Gemini CLI / Codex CLI on any server you have an agent on
>  - Chat, file editor, persistent terminal (xterm.js + PTY), Files browser
>  - **Killer feature:** one CLI subscription on one server, proxy it to all your other servers via a Remote-FS MCP
>  - Push notifications when long jobs finish (PWA, iOS Safari supported)
>  - 14-day trial on the hosted version, or self-host with no time limits
>  - Phone-friendly install — paste SSH creds in the app, master installs the agent for you
>
> Self-host setup:
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
> Roadmap is open in the README — Aider, Cursor CLI, plugin marketplace. PRs welcome (we just merged Codex CLI integration from a first-time contributor).

---

## Reddit r/ClaudeAI / r/LocalLLaMA

**Title:**

> Mobile UI for Claude Code that's actually usable on a phone (self-hosted, open source)

**Body:**

> If you ever wanted to push a fix from a coffee line and gave up because terminal-on-phone is misery — built this.
>
> Self-hosted Next.js app that talks to Claude Code (and Gemini CLI / Codex) running on your own VPS via a tiny agent. Claude session lives on the server, you drive it from the phone. Voice input, file editor, persistent terminal, async jobs that survive the app being closed, push notifications when long tasks finish.
>
> Connecting a new server is one screen on the phone — paste SSH creds, master installs the agent itself. No terminal needed.
>
> AGPL, 14-day trial on cmd.autmzr.com, or self-host: github.com/AUTMZR/cmd.
>
> Honest curiosity what'd make this useful for your workflow.

---

## X / Twitter thread

**1/** Shipped: Autmzr Command — mobile-first, self-hosted UI for AI coding CLIs (Claude Code, Gemini CLI, Codex).
>
> Drive your AI coding session from your phone, against your own servers.
>
> 🔗 cmd.autmzr.com

**2/** Killer feature: one CLI subscription, every server.
>
> Plug Claude Code into one box, use it from any other server you own through a remote-FS proxy. The CLI never knows it's not running locally.

**3/** Install a new server from the phone. No terminal needed.
>
> Paste SSH creds in the modal. Master SSHs in, drops the agent, brings it online. ~15 seconds.

**4/** Async-by-default. Kick off a long task, close the app, walk into a meeting.
>
> The agent keeps running on your server. Push notification when done.

**5/** Self-hosted? Yes. AGPL-3.0.
>
> No vendor lock-in. Your tokens, your code, your servers.
> Or use the hosted version: 14-day trial, no card.

**6/** Open source: github.com/AUTMZR/cmd
>
> Just shipped: GitHub OAuth + clone-from-repo, agent auto-update, Plugin API. Aider and Cursor next.

---

## Telegram пост (RU)

> Зарелизил v0.2 Autmzr Command — мобильная панель для AI-coding CLI (Claude Code, Gemini, Codex), которую крутишь со своего телефона на свои серверы.
>
> Что нового за последние две недели:
> — публичная регистрация + 14-дневный trial
> — push-уведомления когда долгая задача завершилась (PWA, iOS Safari тоже)
> — GitHub OAuth + clone-as-project (выбрал репо в UI → клонится прямо на устройство)
> — auto-update агента через WS-handshake (зарелизил новую версию — все агенты сами обновились)
> — Plugin API: пишешь интеграцию с любым AI CLI как npm-плагин (доки в репе)
> — Codex CLI first-class (install + login через UI как у Claude/Gemini)
> — добавляешь сервер прямо с телефона — вводишь SSH-данные, мастер сам подключается и ставит агент
>
> Self-host: github.com/AUTMZR/cmd, AGPL-3.0, локально через `npm run setup`.
> Hosted: cmd.autmzr.com, trial без карты.
>
> Open source целиком. Если кто пробовал и есть фидбек — пишите, буду благодарен.

---

## vc.ru / Хабр (RU long-form draft)

Заголовок: «Self-hosted мобильная панель для AI-coding CLI: запускаем Claude Code с телефона на свой VPS — open source проект Autmzr Command»

Структура:
1. Контекст — почему вообще нужен мобильный driver для AI CLI
2. Что есть на рынке (Anthropic Remote, Happy, Cloud Code) и чего там не хватает
3. Архитектура (master / agent / proxy mode) — диаграмма
4. Демо: фикс бага из метро. 5 скриншотов
5. Self-hosted vs hosted — почему AGPL, что в roadmap
6. Как присоединиться (issues, Plugin API)

Длинный текст пишется отдельно — это скелет.

---

## Pre-launch checklist

Run through this before posting anything. ~30 минут.

- [ ] **TG cache** — `@WebpageBot` в Telegram, отправить `https://cmd.autmzr.com`, дождаться «refreshed successfully»
- [ ] **OG preview** — посмотреть `https://www.opengraph.xyz/url/https%3A%2F%2Fcmd.autmzr.com` (или paste в Slack/Discord/любой чат с превью)
- [ ] **Signup flow** — пройти от чистого incognito: лендинг → signup → email-verify → /app
- [ ] **SSH-install** — добавить новое устройство через SSH-форму на iPhone (без терминала), проверить что онлайн
- [ ] **Trial expired flow** — псевдо-юзер с `trial_until < NOW()` (через SQL `UPDATE pc.users SET trial_until = NOW() - INTERVAL '1 day' WHERE email = '…';`), убедиться что чат отдаёт 402 и редирект на /upgrade
- [ ] **Push notification** — на iPhone сделать Add to Home Screen, открыть приложение оттуда, Settings → Notifications → Enable, отправить долгий чат, проверить что уведомление пришло
- [ ] **Resend deliverability** — отправить verify-письмо на 3 разные почты (gmail, yandex, outlook), проверить inbox vs spam
- [ ] **GitHub repo metadata** — описание, topics (`self-hosted`, `claude-code`, `mobile`, `ai-tools`), скрин README на main
- [ ] **Throw-away account** — иметь готовый signup для немедленного фикса если что-то ломается у первых посетителей
- [ ] **Stay near inbox + repo issues** первые 4-6 часов после поста (PH часто пишет тех-вопросы, HN тоже)
