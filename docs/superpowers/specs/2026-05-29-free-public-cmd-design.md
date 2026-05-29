# Design: Free Public cmd

**Date:** 2026-05-29
**Status:** Draft, pending user approval
**Author:** brainstorming session

## Context

cmd is currently deployed at `cmd.autmzr.com` / `claude.autmzr.ru` in single-user mode (one admin = the founder). Multi-tenant auth, signup, email verification, and GitHub OAuth are already implemented and shipped. Three users have registered through the public signup, but **zero have created a project** — the onboarding funnel drops to 0% before first chat.

Goal: convert cmd into a publicly-available free product (no trial, no paywall) that doubles as a lead-magnet for the founder's other products.

## Non-goals

- Hosting user code or running CLI on our infrastructure — users bring their own VPS and their own CLI subscriptions (this is cmd's core architectural premise, unchanged).
- Building a billing system or paid tier — explicitly out of scope; free forever.
- Building a captcha / advanced abuse system — deferred unless abuse becomes a real problem post-launch.
- Touching the master ↔ agent protocol or any agent-side code.

## What we change

| Component | Current | After |
|---|---|---|
| Trial logic | `register()` sets `trial_until = NOW() + 14d` for public signups | All users get `trial_until = NULL` (column kept for backward compat, just unused) |
| Email copy | "You have 14 days of free trial. No card needed yet." | "Free forever, no card needed." |
| `TrialBanner` component | Renders in app for users with active trial | Deleted |
| Onboarding flow | Empty dashboard → user must guess: create device → create project → install CLI → login CLI → chat (7 steps, 0% completion) | Welcome wizard with 3 branches |
| Promo slots for cross-sell | None | 1-2 generic slots configured via env JSON |
| Privacy / ToS | Pages exist, content not audited for public launch | Audited + minimal updates |
| `SINGLE_USER_MODE` env | Zombie var in `.env.example`, no code references | Removed from `.env.example` |
| Analytics | Plausible optional via env, not enabled in prod | Enabled in prod + 3 custom events |

## Architecture

### Trial removal

Lowest-risk approach: leave `pc.users.trial_until` column in the database. Just stop populating it (always `NULL`) and stop reading it. No migration required, no risk of breaking existing rows. The column becomes dead data — cheaper than a migration and trivial to revive if we ever add tiers.

**Files touched:**
- `apps/master/src/lib/auth.ts` — `register()`: remove `trialUntil` computation, always insert `NULL`
- `apps/master/src/lib/email.ts` — verification email template: remove "14 days" copy
- `apps/master/src/components/TrialBanner.tsx` — delete file
- Any imports / renders of `TrialBanner` — remove
- Landing pages (under `apps/master/src/components/landing/`) — find and rewrite any trial-related copy

### Onboarding wizard

The current empty dashboard offers no path forward for a new user. We replace it with a welcome screen that branches based on the user's situation.

**Trigger:** rendered inside `AppShell.tsx` when `user.email_verified === true && projects.length === 0 && !localStorage.getItem('cmd_onboarding_dismissed')`.

**Three branches:**

1. **"У меня есть VPS"** — opens `DeviceAddModal` pre-set to SSH method (no "Command" tab visible in this flow). On successful connect, automatically transitions into `ProjectCreateModal` with `path` prefilled to `~/projects`. End state: device + project + ready for first chat.

2. **"У меня нет VPS"** — renders a short markdown guide naming 2-3 recommended providers (timeweb.ru, beget.com for RU; hetzner.com for EN). CTA at the bottom: "Got it? → go to 'У меня есть VPS'". No state stored — purely informational.

3. **"Сначала демо"** — opens `DemoChat.tsx`, a fully read-only fake project with a scripted conversation. Demonstrates the chat UI, what tool-calls look like, what a session feels like. CTA at the end: "Хочешь так же со своими файлами? Подключи VPS." Hardcoded content in the component, no DB.

**Why three branches and not a single linear flow:** the dropoff is shaped like a funnel where the first decision ("do I have a VPS?") gates everything. A linear wizard assumes the user has a VPS — which is precisely the assumption that's killing the funnel today.

### Promo-slot infrastructure

A minimal cross-sell mechanism so the founder can advertise other products without redeploying code.

**Configuration:** environment variable `AUTMZR_PROMOS_JSON` containing a JSON array of `PromoItem` objects. Parsed at request time (cheap; small payload).

```typescript
// apps/master/src/lib/promo.ts
export interface PromoItem {
  id: string;            // for tracking clicks
  title: string;
  description: string;
  ctaUrl: string;
  ctaLabel: string;
  imageUrl?: string;
}
export function getActivePromos(): PromoItem[] {
  const raw = process.env.AUTMZR_PROMOS_JSON;
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
```

**Render sites (no more than two, to keep it un-spammy):**
1. **Dashboard sidebar** — a small compact promo card, always visible when there's at least one promo. Rotates randomly per page load if multiple promos are configured.
2. **Post-first-chat email** — once a user successfully completes their first chat, a one-time transactional email mentions "you might also like…" with up to two promos.

**Tracking:** click events go to Plausible as `promo_click` with `props.id`.

### Privacy / ToS

Both pages exist already at `apps/master/src/app/privacy/page.tsx` and `.../terms/page.tsx`. Read them at implementation time and add specifically these items if missing:

1. Statement that the service is free with no paid tier
2. List of personal data collected: email, bcrypt password hash, login audit log (IP + UA + timestamp), connected agent metadata (hostname, OS, agent version)
3. Statement that we do NOT have access to: user's source code, user's CLI auth tokens, user's API keys (architectural fact — worth saying explicitly)
4. Contact email for data-deletion requests (the founder's email)
5. "Last updated" date set to launch date

### Analytics

Plausible script is already conditionally loaded via env. Enable it in prod by setting `PLAUSIBLE_DOMAIN`. Add three custom events via `plausible('event_name')` calls:
- `signup_completed` — in the signup POST handler after successful insert
- `device_connected` — first time a device transitions to `online`
- `first_chat_sent` — when a user sends their first ever message (count from `pc.messages`)
- `promo_click` — on promo card click

These four events give us a complete signup → activated funnel without any extra infrastructure.

## Data flow (onboarding wizard)

```
User signs up (PUT /api/auth)
  → email sent with verify link
  → user clicks verify link → email_verified = true
  → redirect to /app
  → AppShell loads, fetches /api/projects → []
  → OnboardingWelcome renders (since projects.length === 0)
  → user picks branch:
      ├─ "Есть VPS"  → DeviceAddModal(method=ssh) → on success → ProjectCreateModal → /api/projects POST → done
      ├─ "Нет VPS"   → NoVpsGuide → user provisions VPS externally → comes back, picks "Есть VPS"
      └─ "Демо"      → DemoChat (read-only) → CTA to "Есть VPS"
  → after first project + first device, OnboardingWelcome unmounts
  → first sent message → plausible('first_chat_sent')
```

## Failure modes

| Scenario | Mitigation |
|---|---|
| Old user with active `trial_until` | Code ignores the field. No migration. They see no difference. |
| Email-verify SMTP not configured on prod | Pre-launch check: send test verification email to a real inbox. Block launch if it fails. |
| User dismisses OnboardingWelcome | `localStorage.cmd_onboarding_dismissed` stored. Re-shown automatically if `projects.length` is still 0 on next session (we DON'T persist dismissal across sessions for empty-project users). |
| SSH connect fails in "Есть VPS" | Already handled by `DeviceAddModal` — error displayed inline, user can retry. |
| Demo chat: user types and submits | Submit button disabled in demo mode. Input is read-only or omitted entirely. |
| Promo JSON malformed | `try/catch` in `getActivePromos()` returns `[]`. No promo rendered. Page does not break. |
| Bot abuse on signup | Existing rate-limit (3/min/IP) handles casual abuse. If we see floods, add hCaptcha as a follow-up. NOT in MVP. |
| Plausible script blocked by adblock | Events silently dropped. Acceptable — we lose visibility on adblock users, no functional impact. |

## Testing

**Automated (unit + integration):**
- `register()` always inserts `trial_until = NULL` — extend existing auth test
- `getActivePromos()` returns `[]` for: undefined env, empty string, invalid JSON, valid JSON — 4 cases
- `OnboardingWelcome` renders only when `projects.length === 0 && email_verified` — RTL test

**Manual UAT (pre-launch):**
- Sign up with a fresh email → verify email arrives → click link → land on welcome wizard
- Complete each of the three branches end-to-end
- Verify TrialBanner is gone from existing user sessions
- Verify promo card renders when env is set; doesn't render when env is empty
- Verify Plausible dashboard receives signup_completed event

**Post-launch smoke:**
- Register a test account → walk through onboarding → check Plausible received all 4 events
- Delete the test account via psql

## Out of scope (explicitly deferred)

- hCaptcha or other anti-bot — add only if abuse becomes measurable
- Multi-user teams within one cmd account — not requested
- Paid tier / billing — out of scope per the "free forever" decision
- I18n review of onboarding copy — covered separately if needed; copy will be authored in the locale files at implementation time

## Open questions (to be answered before plan)

None. All scope decisions are locked.

## Success criteria

- A new visitor can go from landing page → first chat in under 10 minutes without external help (target metric: median time-to-first-chat).
- Funnel `signup → first_chat_sent` reaches at least 30% within two weeks of launch (current rate: 0%).
- At least one promo click per day once 50 users are registered.
- Zero regressions for existing users (the founder's own admin account and the two other registered users).
