# Free Public cmd — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn cmd from "self-hosted, single-user" into a publicly-available free product that doubles as a lead-magnet for the founder's other products. Remove trial logic, add a 3-branch onboarding wizard, add a configurable promo slot, enable analytics.

**Architecture:** Frontend-heavy changes inside the existing Next.js 14 App Router master. No new services, no DB migrations, no protocol changes. Re-uses existing auth, multi-tenant data model, `DeviceAddModal` / `ProjectCreateModal`, and the conditionally-loaded Plausible script.

**Tech Stack:** TypeScript, Next.js 14 (App Router), `next-intl` for i18n (ru/en/zh JSON files), `lucide-react` for icons, Plausible for analytics, Postgres (no schema changes).

**Spec:** [`docs/superpowers/specs/2026-05-29-free-public-cmd-design.md`](../specs/2026-05-29-free-public-cmd-design.md)

**Tests:** No automated test framework exists in `apps/master/` today. We add `vitest` only where it earns its keep (pure-logic helpers). UI changes get manual smoke-tests in the UAT task at the end.

---

## File map

**Created:**
- `apps/master/src/lib/promo.ts` — env-driven cross-sell promo source
- `apps/master/src/lib/promo.test.ts` — unit tests
- `apps/master/src/components/PromoCard.tsx` — UI for promo display
- `apps/master/src/components/OnboardingWelcome.tsx` — 3-branch wizard wrapper
- `apps/master/src/components/NoVpsGuide.tsx` — informational sub-component
- `apps/master/src/components/DemoChat.tsx` — read-only scripted chat sub-component
- `apps/master/vitest.config.ts` — minimal vitest config

**Modified:**
- `apps/master/src/lib/auth.ts` — drop trial computation in `register()`
- `apps/master/src/lib/email.ts` — drop "14 days" copy
- `apps/master/src/components/AppShell.tsx` — remove `TrialBanner`, render `OnboardingWelcome` + `PromoCard`
- `apps/master/src/app/privacy/page.tsx` — add 5 disclosures (see spec §Privacy)
- `apps/master/src/app/terms/page.tsx` — same audit
- `apps/master/messages/ru.json`, `en.json`, `zh.json` — new translation keys
- `apps/master/package.json` — add `vitest` + `test` script
- `.env.example` — remove `SINGLE_USER_MODE=true`

**Deleted:**
- `apps/master/src/components/TrialBanner.tsx`

---

## Task 1 — Remove trial computation in `register()`

**Files:**
- Modify: `apps/master/src/lib/auth.ts:65-89`

- [ ] **Step 1: Edit `register()` to always set `trial_until = NULL`**

Replace lines 65-89 of `apps/master/src/lib/auth.ts`:

```typescript
/** TTL для verification token. */
const VERIFY_TOKEN_TTL_HOURS = 24;

export async function register(email: string, password: string, name?: string, isAdmin = false): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  // Free product — no trial. Column `trial_until` is kept for backward compatibility
  // and is always NULL. Admins still skip email verification (they're set up via wizard).
  const emailVerified = isAdmin;
  const rows = await query<{ id: string }>(
    `INSERT INTO pc.users (email, password_hash, name, is_admin, trial_until, email_verified)
     VALUES ($1, $2, $3, $4, NULL, $5)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash, name || null, isAdmin, emailVerified],
  );
  if (!rows[0]) throw new Error('user_exists');
  return {
    id: rows[0].id, email, name: name || null, is_admin: isAdmin,
    trial_until: null, email_verified: emailVerified,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -20`
Expected: no TypeScript errors, exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/master/src/lib/auth.ts
git commit -m "refactor(auth): drop 14-day trial logic from register()

Free public product — all new users get trial_until=NULL.
Column kept in DB for backward compatibility, just unused."
```

---

## Task 2 — Update email copy

**Files:**
- Modify: `apps/master/src/lib/email.ts:127,137` (verification email template)

- [ ] **Step 1: Find and read both lines**

Run: `grep -n "14 days" apps/master/src/lib/email.ts`
Expected: two matches at lines around 127 and 137.

- [ ] **Step 2: Edit line 127 (plain-text body)**

Replace `You have 14 days of free trial. No card needed yet.` with `Free forever, no card needed.`

- [ ] **Step 3: Edit line 137 (HTML body)**

Replace the long sentence ending `…14 days of free trial — no card needed yet.` with `…your Autmzr Command account is verified and ready. Free forever, no card needed.`

- [ ] **Step 4: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/lib/email.ts
git commit -m "copy(email): drop '14 days' trial language from verification email"
```

---

## Task 3 — Delete `TrialBanner` component + its usage

**Files:**
- Delete: `apps/master/src/components/TrialBanner.tsx`
- Modify: `apps/master/src/components/AppShell.tsx:19,600`

- [ ] **Step 1: Remove import**

In `apps/master/src/components/AppShell.tsx`, delete the line:
```typescript
import TrialBanner from './TrialBanner';
```

- [ ] **Step 2: Remove render**

In `apps/master/src/components/AppShell.tsx` around line 600, delete:
```tsx
<TrialBanner trialUntil={user.trial_until} isAdmin={user.is_admin} />
```

- [ ] **Step 3: Delete the component file**

```bash
rm apps/master/src/components/TrialBanner.tsx
```

- [ ] **Step 4: Check no stale references**

Run: `grep -rn "TrialBanner" apps/master/src/`
Expected: no output.

- [ ] **Step 5: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/components/TrialBanner.tsx apps/master/src/components/AppShell.tsx
git commit -m "chore(ui): remove TrialBanner — free product has no trial"
```

---

## Task 4 — Clean zombie `SINGLE_USER_MODE` from `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Verify it's truly unused in code**

Run: `grep -rn "SINGLE_USER_MODE" apps/ packages/`
Expected: no output (already verified during brainstorming).

- [ ] **Step 2: Remove the two lines**

Open `.env.example` and delete the block:
```
# Single-user mode (для себя): email и пароль админа создадутся при setup
SINGLE_USER_MODE=true
```

Also remove any blank line that's now leading or duplicated.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore(env): remove zombie SINGLE_USER_MODE — unused in code"
```

---

## Task 5 — Set up `vitest` for lib unit tests

**Files:**
- Modify: `apps/master/package.json`
- Create: `apps/master/vitest.config.ts`

- [ ] **Step 1: Install vitest as dev-dep**

Run: `cd apps/master && npm install --save-dev vitest@^2 @types/node`
Expected: `package.json` updated, lockfile updated.

- [ ] **Step 2: Add `test` script to `apps/master/package.json`**

In the `"scripts"` object add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create minimal vitest config**

Create `apps/master/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Smoke-test that vitest runs (no tests yet)**

Run: `cd apps/master && npm test 2>&1 | tail -10`
Expected: "No test files found" — exit code 0 or 1, but command works.

- [ ] **Step 5: Commit**

```bash
git add apps/master/package.json apps/master/package-lock.json apps/master/vitest.config.ts
git commit -m "build(master): add vitest for unit-test infra"
```

---

## Task 6 — Implement `lib/promo.ts` with tests

**Files:**
- Create: `apps/master/src/lib/promo.ts`
- Create: `apps/master/src/lib/promo.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `apps/master/src/lib/promo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getActivePromos, type PromoItem } from './promo';

describe('getActivePromos', () => {
  const ORIG = process.env.AUTMZR_PROMOS_JSON;
  afterEach(() => { process.env.AUTMZR_PROMOS_JSON = ORIG; });

  it('returns [] when env is undefined', () => {
    delete process.env.AUTMZR_PROMOS_JSON;
    expect(getActivePromos()).toEqual([]);
  });

  it('returns [] when env is empty string', () => {
    process.env.AUTMZR_PROMOS_JSON = '';
    expect(getActivePromos()).toEqual([]);
  });

  it('returns [] when env is malformed JSON', () => {
    process.env.AUTMZR_PROMOS_JSON = '{not json';
    expect(getActivePromos()).toEqual([]);
  });

  it('returns parsed array for valid JSON', () => {
    const promos: PromoItem[] = [{
      id: 'gpt', title: 'GPT', description: 'desc',
      ctaUrl: 'https://gpt.autmzr.ru', ctaLabel: 'Try it',
    }];
    process.env.AUTMZR_PROMOS_JSON = JSON.stringify(promos);
    expect(getActivePromos()).toEqual(promos);
  });

  it('returns [] when JSON is not an array', () => {
    process.env.AUTMZR_PROMOS_JSON = JSON.stringify({ id: 'x' });
    expect(getActivePromos()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail (module missing)**

Run: `cd apps/master && npm test 2>&1 | tail -15`
Expected: FAIL with "Cannot find module './promo'" or similar.

- [ ] **Step 3: Implement `lib/promo.ts`**

Create `apps/master/src/lib/promo.ts`:
```typescript
/**
 * Cross-sell promo source. Driven by env var AUTMZR_PROMOS_JSON
 * containing a JSON array of PromoItem objects. Founder can rotate
 * promos by editing .env and restarting the master — no code redeploy.
 */
export interface PromoItem {
  id: string;
  title: string;
  description: string;
  ctaUrl: string;
  ctaLabel: string;
  imageUrl?: string;
}

export function getActivePromos(): PromoItem[] {
  const raw = process.env.AUTMZR_PROMOS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PromoItem[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `cd apps/master && npm test 2>&1 | tail -15`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/lib/promo.ts apps/master/src/lib/promo.test.ts
git commit -m "feat(promo): env-driven cross-sell promo source

Reads AUTMZR_PROMOS_JSON, returns [] on anything malformed.
Lets the founder rotate promos without redeploying code."
```

---

## Task 7 — Implement `PromoCard` UI component

**Files:**
- Create: `apps/master/src/components/PromoCard.tsx`

- [ ] **Step 1: Inspect existing card-style components for visual consistency**

Run: `ls apps/master/src/components/ | grep -i card`
Note any existing Card patterns. Reuse class names where present.

- [ ] **Step 2: Create the component**

Create `apps/master/src/components/PromoCard.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import type { PromoItem } from '@/lib/promo';

interface Props {
  promos: PromoItem[];
}

declare global {
  interface Window { plausible?: (event: string, opts?: { props?: Record<string, string> }) => void }
}

/**
 * Renders one promo card, rotating randomly per page load if multiple promos
 * are configured. Click fires `promo_click` event to Plausible.
 */
export default function PromoCard({ promos }: Props) {
  const [chosen, setChosen] = useState<PromoItem | null>(null);

  useEffect(() => {
    if (promos.length === 0) { setChosen(null); return; }
    const idx = Math.floor(Math.random() * promos.length);
    setChosen(promos[idx]);
  }, [promos]);

  if (!chosen) return null;

  function onClick() {
    window.plausible?.('promo_click', { props: { id: chosen!.id } });
  }

  return (
    <a
      href={chosen.ctaUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="block rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 hover:bg-zinc-900 transition"
    >
      {chosen.imageUrl && (
        <img src={chosen.imageUrl} alt="" className="w-full h-24 object-cover rounded mb-2" />
      )}
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">From the maker of cmd</div>
      <div className="text-sm font-medium text-zinc-100 mb-1">{chosen.title}</div>
      <div className="text-xs text-zinc-400 mb-2">{chosen.description}</div>
      <div className="text-xs text-emerald-400">{chosen.ctaLabel} →</div>
    </a>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/components/PromoCard.tsx
git commit -m "feat(promo): PromoCard component with rotation + plausible tracking"
```

---

## Task 8 — Wire `PromoCard` into `AppShell` sidebar

**Files:**
- Modify: `apps/master/src/components/AppShell.tsx`

- [ ] **Step 1: Find a stable sidebar render site**

Run: `grep -n "sidebar\|Sidebar\|projects.length === 0 &&" apps/master/src/components/AppShell.tsx | head -10`
Pick the first sidebar render in the main layout (likely around line 633).

- [ ] **Step 2: Pass promos from server**

Promos come from env, so they need a Server Component or an API endpoint. Simplest: add a new GET endpoint.

Create `apps/master/src/app/api/promos/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getActivePromos } from '@/lib/promo';

export async function GET() {
  return NextResponse.json({ promos: getActivePromos() });
}
```

- [ ] **Step 3: Fetch promos in AppShell**

In `apps/master/src/components/AppShell.tsx`, near the other `useState`/`useEffect` blocks at the top of the component, add:
```typescript
const [promos, setPromos] = useState<import('@/lib/promo').PromoItem[]>([]);

useEffect(() => {
  fetch('/api/promos').then(r => r.json()).then(j => setPromos(j.promos || [])).catch(() => {});
}, []);
```

- [ ] **Step 4: Render `<PromoCard>` in the sidebar**

Add import at the top:
```typescript
import PromoCard from './PromoCard';
```

Insert into the sidebar JSX (near line 633 in current file, locate the sidebar `<aside>` or equivalent container), after the projects list:
```tsx
{promos.length > 0 && (
  <div className="mt-4 px-2">
    <PromoCard promos={promos} />
  </div>
)}
```

- [ ] **Step 5: Verify build + manual visual smoke**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

Run dev locally with a test promo:
```bash
cd /Users/aleksandrmalysev/projects/cmd
AUTMZR_PROMOS_JSON='[{"id":"test","title":"Test promo","description":"desc","ctaUrl":"https://example.com","ctaLabel":"Open"}]' npm run dev
```
Open `http://localhost:3100`, log in, confirm the card renders in the sidebar. Hit Cmd+Shift+I → Network → confirm `/api/promos` returns the promo.

- [ ] **Step 6: Commit**

```bash
git add apps/master/src/app/api/promos/route.ts apps/master/src/components/AppShell.tsx
git commit -m "feat(promo): expose /api/promos + render PromoCard in sidebar"
```

---

## Task 9 — Implement `NoVpsGuide` sub-component

**Files:**
- Create: `apps/master/src/components/NoVpsGuide.tsx`

- [ ] **Step 1: Create the component**

Create `apps/master/src/components/NoVpsGuide.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onBack: () => void;
}

/**
 * Informational panel for users without a VPS. Shows 3 recommended providers
 * and tells them to come back and pick "I have a VPS" once they've signed up
 * with one. Purely informational, no state.
 */
export default function NoVpsGuide({ onBack }: Props) {
  const t = useTranslations('onboarding.noVps');

  return (
    <div className="max-w-md mx-auto text-zinc-100">
      <h2 className="text-xl font-semibold mb-2">{t('title')}</h2>
      <p className="text-sm text-zinc-400 mb-4">{t('intro')}</p>

      <ul className="space-y-3 mb-6">
        <li className="rounded border border-zinc-800 p-3">
          <div className="font-medium">timeweb.cloud</div>
          <div className="text-xs text-zinc-400">{t('timewebHint')}</div>
        </li>
        <li className="rounded border border-zinc-800 p-3">
          <div className="font-medium">beget.com</div>
          <div className="text-xs text-zinc-400">{t('begetHint')}</div>
        </li>
        <li className="rounded border border-zinc-800 p-3">
          <div className="font-medium">hetzner.com</div>
          <div className="text-xs text-zinc-400">{t('hetznerHint')}</div>
        </li>
      </ul>

      <p className="text-sm text-zinc-300 mb-4">{t('outro')}</p>
      <button
        onClick={onBack}
        className="text-sm text-emerald-400 hover:text-emerald-300"
      >
        ← {t('back')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0 (locale keys not yet added — build won't fail, but runtime would warn; we add keys in Task 13).

- [ ] **Step 3: Commit**

```bash
git add apps/master/src/components/NoVpsGuide.tsx
git commit -m "feat(onboarding): NoVpsGuide informational sub-component"
```

---

## Task 10 — Implement `DemoChat` sub-component

**Files:**
- Create: `apps/master/src/components/DemoChat.tsx`

- [ ] **Step 1: Create the component with a scripted conversation**

Create `apps/master/src/components/DemoChat.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';

interface Props {
  onConnectClick: () => void;
}

/**
 * Read-only demo of what a cmd chat looks like. Hardcoded conversation so it
 * has zero runtime dependencies. CTA at the bottom routes users to the
 * "I have a VPS" branch when they're ready to use it for real.
 */
export default function DemoChat({ onConnectClick }: Props) {
  const t = useTranslations('onboarding.demo');

  const messages = [
    { role: 'user' as const, body: t('msgUser1') },
    { role: 'assistant' as const, body: t('msgAsst1') },
    { role: 'user' as const, body: t('msgUser2') },
    { role: 'assistant' as const, body: t('msgAsst2') },
  ];

  return (
    <div className="max-w-2xl mx-auto text-zinc-100">
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{t('badge')}</div>
      <h2 className="text-xl font-semibold mb-4">{t('title')}</h2>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-4 mb-6">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'pl-8' : 'pr-8'}>
            <div className="text-xs text-zinc-500 mb-1">
              {m.role === 'user' ? t('you') : 'claude'}
            </div>
            <div className="text-sm text-zinc-200 whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
      </div>

      <p className="text-sm text-zinc-400 mb-4">{t('outro')}</p>
      <button
        onClick={onConnectClick}
        className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-900 font-medium py-2"
      >
        {t('cta')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/master/src/components/DemoChat.tsx
git commit -m "feat(onboarding): DemoChat read-only scripted conversation"
```

---

## Task 11 — Implement `OnboardingWelcome` wrapper

**Files:**
- Create: `apps/master/src/components/OnboardingWelcome.tsx`

- [ ] **Step 1: Create the wrapper component**

Create `apps/master/src/components/OnboardingWelcome.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import NoVpsGuide from './NoVpsGuide';
import DemoChat from './DemoChat';

type View = 'choose' | 'noVps' | 'demo';

interface Props {
  onPickHasVps: () => void;   // parent opens DeviceAddModal(method=ssh) → on success opens ProjectCreateModal
  onDismiss: () => void;       // parent sets localStorage flag and hides this wizard
}

/**
 * 3-branch onboarding wizard. Rendered by AppShell when the user has
 * verified their email but has zero projects. The wizard is a helper, not
 * a blocker — user can dismiss it; existing empty-state CTA still works.
 */
export default function OnboardingWelcome({ onPickHasVps, onDismiss }: Props) {
  const [view, setView] = useState<View>('choose');
  const t = useTranslations('onboarding.welcome');

  if (view === 'noVps') return <NoVpsGuide onBack={() => setView('choose')} />;
  if (view === 'demo') return <DemoChat onConnectClick={() => { setView('choose'); onPickHasVps(); }} />;

  return (
    <div className="max-w-2xl mx-auto text-zinc-100">
      <h1 className="text-2xl font-semibold mb-2">{t('title')}</h1>
      <p className="text-zinc-400 mb-8">{t('subtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <button
          onClick={onPickHasVps}
          className="text-left rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900 transition"
        >
          <div className="text-2xl mb-2">🖥</div>
          <div className="font-medium mb-1">{t('hasVpsTitle')}</div>
          <div className="text-xs text-zinc-400">{t('hasVpsHint')}</div>
        </button>

        <button
          onClick={() => setView('noVps')}
          className="text-left rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900 transition"
        >
          <div className="text-2xl mb-2">📦</div>
          <div className="font-medium mb-1">{t('noVpsTitle')}</div>
          <div className="text-xs text-zinc-400">{t('noVpsHint')}</div>
        </button>

        <button
          onClick={() => setView('demo')}
          className="text-left rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 hover:bg-zinc-900 transition"
        >
          <div className="text-2xl mb-2">▶️</div>
          <div className="font-medium mb-1">{t('demoTitle')}</div>
          <div className="text-xs text-zinc-400">{t('demoHint')}</div>
        </button>
      </div>

      <button
        onClick={onDismiss}
        className="text-xs text-zinc-500 hover:text-zinc-400"
      >
        {t('skip')}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/master/src/components/OnboardingWelcome.tsx
git commit -m "feat(onboarding): OnboardingWelcome 3-branch wizard wrapper"
```

---

## Task 12 — Wire `OnboardingWelcome` into `AppShell`

**Files:**
- Modify: `apps/master/src/components/AppShell.tsx`

- [ ] **Step 1: Add import**

In `apps/master/src/components/AppShell.tsx`, near the other component imports at the top, add:
```typescript
import OnboardingWelcome from './OnboardingWelcome';
```

- [ ] **Step 2: Add dismiss state**

Near the other `useState` calls at the top of the component body, add:
```typescript
const [onboardingDismissed, setOnboardingDismissed] = useState<boolean>(() => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('cmd_onboarding_dismissed') === '1';
});
```

- [ ] **Step 3: Add show condition**

After the `projects` and `user` state are loaded (find where `projects` is used near line 633), compute:
```typescript
const showOnboarding =
  user?.email_verified === true &&
  projects.length === 0 &&
  !onboardingDismissed;
```

- [ ] **Step 4: Render the wizard**

Find the empty-state render around line 511 (`title={t('chats.emptyTitle')}`). Wrap that block so when `showOnboarding` is true, render `<OnboardingWelcome>` *instead* of the empty-state card:

```tsx
{showOnboarding ? (
  <OnboardingWelcome
    onPickHasVps={() => {
      setShowAddDevice(true); // existing modal state; check actual name in this file
    }}
    onDismiss={() => {
      localStorage.setItem('cmd_onboarding_dismissed', '1');
      setOnboardingDismissed(true);
    }}
  />
) : (
  /* existing empty-state block: <EmptyState title={t('chats.emptyTitle')} ... /> */
)}
```

Find the existing modal-opener state name. Run before editing:
```bash
grep -n "setShowAdd\|setShowDevice\|setShowProject" apps/master/src/components/AppShell.tsx | head -5
```
Use the device-add modal opener (not project-create — onboarding needs device first).

- [ ] **Step 5: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 6: Manual smoke test locally**

Run `npm run dev`. As an admin user, you have projects so wizard won't show. To test:
1. In psql, register a fresh test user manually OR temporarily set `user.email_verified` via DB
2. Open the app — wizard should appear with three cards
3. Click "Демо" → DemoChat shows → click CTA → returns to device-add modal
4. Refresh → wizard reappears (not dismissed)
5. Click "Skip" → wizard disappears, regular empty state shown
6. Refresh → wizard stays dismissed (localStorage)
7. Manually clear `cmd_onboarding_dismissed` in DevTools → refresh → wizard back

- [ ] **Step 7: Commit**

```bash
git add apps/master/src/components/AppShell.tsx
git commit -m "feat(onboarding): render OnboardingWelcome for first-time users"
```

---

## Task 13 — Add Plausible custom events

**Files:**
- Modify: `apps/master/src/components/AuthScreen.tsx` (signup_completed)
- Modify: `apps/master/src/components/AppShell.tsx` (device_connected + first_chat_sent)

- [ ] **Step 1: Fire `signup_completed` on successful registration**

In `apps/master/src/components/AuthScreen.tsx`, find the signup success handler (the success branch after `PUT /api/auth`). Add immediately after the successful response is received:
```typescript
window.plausible?.('signup_completed');
```

- [ ] **Step 2: Fire `device_connected` on first device transitioning to online**

In `apps/master/src/components/AppShell.tsx`, find where device list is fetched (likely `setInterval` or WS handler that updates `devices` state).

Add a `useEffect` that tracks whether the user has ever had an online device:
```typescript
const firedDeviceConnectedRef = useRef(false);
useEffect(() => {
  if (firedDeviceConnectedRef.current) return;
  if (devices.some(d => d.online)) {
    window.plausible?.('device_connected');
    firedDeviceConnectedRef.current = true;
  }
}, [devices]);
```

Add to imports at top: `import { useRef } from 'react';` (probably already there).

- [ ] **Step 3: Fire `first_chat_sent` on first user message ever**

Find the message-send handler in `AppShell.tsx` (search for `addMsg('user'` or similar). Add a check that fires once per session if `messages.length === 0` before adding:
```typescript
const firedFirstChatRef = useRef(false);
// inside the send handler, BEFORE pushing the new message:
if (!firedFirstChatRef.current && messages.length === 0) {
  window.plausible?.('first_chat_sent');
  firedFirstChatRef.current = true;
}
```

Note: this fires per session, not per account-lifetime. For lifetime tracking we'd need a server-side check; out of scope for MVP.

- [ ] **Step 4: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/master/src/components/AuthScreen.tsx apps/master/src/components/AppShell.tsx
git commit -m "feat(analytics): fire signup_completed, device_connected, first_chat_sent

Plausible custom events for funnel visibility. Client-side only —
plausible.js handles delivery; if blocked by adblock, silently drops."
```

---

## Task 14 — Add locale keys for onboarding (ru/en/zh)

**Files:**
- Modify: `apps/master/messages/ru.json`
- Modify: `apps/master/messages/en.json`
- Modify: `apps/master/messages/zh.json`

- [ ] **Step 1: Add `onboarding` block to `ru.json`**

Insert at the top level (alphabetically near other top-level keys; if there's no obvious alpha-ordering, add after the largest existing block):
```json
"onboarding": {
  "welcome": {
    "title": "Добро пожаловать в cmd",
    "subtitle": "Подключи устройство и начни управлять AI-агентами с телефона за пару минут.",
    "hasVpsTitle": "У меня есть VPS",
    "hasVpsHint": "Подключим по SSH и сразу создадим первый проект.",
    "noVpsTitle": "У меня нет VPS",
    "noVpsHint": "Покажу куда сходить — займёт 5 минут.",
    "demoTitle": "Сначала демо",
    "demoHint": "Посмотри как выглядит чат, потом решишь.",
    "skip": "Пропустить — я разберусь сам"
  },
  "noVps": {
    "title": "Возьми сервер за 5 минут",
    "intro": "cmd работает с твоим VPS — ты приносишь сервер, мы делаем интерфейс. Вот провайдеры которыми пользуются другие:",
    "timewebHint": "Российский, оплата картой РФ, от 200 ₽/мес",
    "begetHint": "Российский, простой кабинет, бесплатный пробный VPS",
    "hetznerHint": "Немецкий, $4/мес, для международной аудитории",
    "outro": "После регистрации сервера вернись сюда и выбери «У меня есть VPS» — дальше всё за тебя.",
    "back": "Назад"
  },
  "demo": {
    "badge": "Демо — read-only",
    "title": "Так выглядит работа с claude через cmd",
    "you": "ты",
    "msgUser1": "Откати последний деплой на prod-fra-1",
    "msgAsst1": "Делаю. Откатываюсь до коммита 7a3f1c4 и перезапускаю миграции. Если закроешь приложение — продолжу сам.",
    "msgUser2": "Покажи что упало",
    "msgAsst2": "В логах: TypeError в src/handlers/upload.ts:42 — undefined.length. Это из коммита b7e9, последний коммит этого деплоя. Откатил.",
    "outro": "Это статичная демка. Чтобы попробовать на своих файлах — подключи свой VPS.",
    "cta": "Подключить мой VPS"
  }
}
```

- [ ] **Step 2: Mirror in `en.json`**

Same structure, English copy:
```json
"onboarding": {
  "welcome": {
    "title": "Welcome to cmd",
    "subtitle": "Connect a device and start running AI agents from your phone in a few minutes.",
    "hasVpsTitle": "I have a VPS",
    "hasVpsHint": "We'll SSH in and create your first project.",
    "noVpsTitle": "I don't have a VPS",
    "noVpsHint": "Here's where to get one — takes 5 minutes.",
    "demoTitle": "Show me a demo first",
    "demoHint": "See what a chat looks like, then decide.",
    "skip": "Skip — I'll figure it out"
  },
  "noVps": {
    "title": "Get a VPS in 5 minutes",
    "intro": "cmd runs on your VPS — you bring the server, we provide the interface. Here are providers other users go with:",
    "timewebHint": "Russia, accepts RU cards, from $3/mo",
    "begetHint": "Russia, simple panel, free trial VPS available",
    "hetznerHint": "Germany, $4/mo, popular for international users",
    "outro": "Once you've signed up with a provider, come back and pick \"I have a VPS\" — we'll do the rest.",
    "back": "Back"
  },
  "demo": {
    "badge": "Demo — read-only",
    "title": "Here's what working with claude through cmd looks like",
    "you": "you",
    "msgUser1": "Roll back the last deploy on prod-fra-1",
    "msgAsst1": "On it. Reverting to commit 7a3f1c4 and re-running migrations. I'll keep going if you close the app.",
    "msgUser2": "Show me what broke",
    "msgAsst2": "Logs: TypeError in src/handlers/upload.ts:42 — undefined.length. From commit b7e9, last commit of that deploy. Rolled back.",
    "outro": "This is a static demo. To try with your own files, connect your VPS.",
    "cta": "Connect my VPS"
  }
}
```

- [ ] **Step 3: Mirror in `zh.json`**

Same structure, Chinese copy (machine-translation is fine for now, polish later):
```json
"onboarding": {
  "welcome": {
    "title": "欢迎使用 cmd",
    "subtitle": "连接设备，几分钟内开始用手机管理 AI 代理。",
    "hasVpsTitle": "我有 VPS",
    "hasVpsHint": "我们将通过 SSH 连接并创建您的第一个项目。",
    "noVpsTitle": "我没有 VPS",
    "noVpsHint": "这里告诉您去哪里获取 — 只需 5 分钟。",
    "demoTitle": "先看演示",
    "demoHint": "看看聊天界面，然后决定。",
    "skip": "跳过 — 我自己来"
  },
  "noVps": {
    "title": "5 分钟内获取 VPS",
    "intro": "cmd 在您的 VPS 上运行 — 您提供服务器，我们提供界面。其他用户常用的提供商：",
    "timewebHint": "俄罗斯，接受 RU 卡，每月 $3 起",
    "begetHint": "俄罗斯，简单面板，提供免费试用 VPS",
    "hetznerHint": "德国，$4/月，国际用户首选",
    "outro": "在提供商处注册后，回来选择「我有 VPS」 — 我们处理其余的事。",
    "back": "返回"
  },
  "demo": {
    "badge": "演示 — 只读",
    "title": "这就是通过 cmd 使用 claude 的样子",
    "you": "你",
    "msgUser1": "回滚 prod-fra-1 上的最后一次部署",
    "msgAsst1": "正在执行。回滚到提交 7a3f1c4 并重新运行迁移。如果您关闭应用，我会自己继续。",
    "msgUser2": "显示出了什么错",
    "msgAsst2": "日志：src/handlers/upload.ts:42 中的 TypeError — undefined.length。来自提交 b7e9，该部署的最后提交。已回滚。",
    "outro": "这是静态演示。要使用您自己的文件，请连接您的 VPS。",
    "cta": "连接我的 VPS"
  }
}
```

- [ ] **Step 4: Validate JSON**

Run: `for f in apps/master/messages/{ru,en,zh}.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "$f ok" || echo "$f BAD"; done`
Expected: all three "ok".

- [ ] **Step 5: Verify build picks up new strings**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/master/messages/
git commit -m "i18n(onboarding): add ru/en/zh keys for OnboardingWelcome wizard"
```

---

## Task 15 — Audit + update Privacy page

**Files:**
- Modify: `apps/master/src/app/privacy/page.tsx`

- [ ] **Step 1: Read current page**

Run: `cat apps/master/src/app/privacy/page.tsx`
Note current sections and tone. Stay consistent.

- [ ] **Step 2: Add or update sections so the page contains**

Per spec §Privacy/ToS:
1. Statement that the service is free with no paid tier
2. List of personal data collected: email, bcrypt password hash, login audit log (IP + UA + timestamp), connected agent metadata (hostname, OS, agent version)
3. Statement that we do NOT have access to: user's source code, user's CLI auth tokens, user's API keys
4. Contact email for data-deletion requests (use `fdrvaa84@gmail.com` until a dedicated address exists)
5. "Last updated" date set to today's date

Edit in-place; preserve existing visual structure.

- [ ] **Step 3: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/app/privacy/page.tsx
git commit -m "docs(privacy): audit for public free launch — disclosures + contact"
```

---

## Task 16 — Audit + update Terms page

**Files:**
- Modify: `apps/master/src/app/terms/page.tsx`

- [ ] **Step 1: Read current page**

Run: `cat apps/master/src/app/terms/page.tsx`

- [ ] **Step 2: Apply same audit list as Privacy (items 1, 3, 4, 5 — Terms doesn't need item 2)**

Make sure Terms explicitly states:
- Service is free, no payment obligations
- No SLA / "best effort" availability disclaimer (this is a free service)
- Users own their data; we hold only metadata; their source / tokens are on their VPS
- AGPL-3.0 link for the source code
- Contact: `fdrvaa84@gmail.com`
- "Last updated" today

- [ ] **Step 3: Verify build**

Run: `cd apps/master && npm run build 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/master/src/app/terms/page.tsx
git commit -m "docs(terms): audit for public free launch — no-SLA + AGPL"
```

---

## Task 17 — Pre-launch UAT (manual smoke)

This is a checklist, not code. Do each item, mark done. Find blockers, file them as new tasks before deploy.

- [ ] **Step 1: Verify SMTP works on prod**

SSH to prod, send a real verification email to a real inbox you can check:
```bash
ssh root@178.236.16.103
cd /opt/cmd/apps/master
# Use psql or a one-off node script to call createVerificationToken + sendVerificationEmail
```

If SMTP isn't configured, **this is a launch blocker** — wire `RESEND_API_KEY` or equivalent in prod `.env` before proceeding.

- [ ] **Step 2: Run all 4 vitest tests**

Locally:
```bash
cd apps/master && npm test
```
Expected: all promo.test.ts tests pass.

- [ ] **Step 3: Full local UAT**

Run `npm run dev` and walk through:
1. Sign up with a fresh email
2. Receive verification email (or use locally-printed token from logs)
3. Verify → land on app
4. Confirm `OnboardingWelcome` shows
5. Click "Демо" → see scripted chat → click CTA → return to choices → see DeviceAddModal? (per Task 12 wiring)
6. Click "У меня нет VPS" → see provider list → click back
7. Click "У меня есть VPS" → DeviceAddModal opens with SSH method pre-selected
8. Click "Skip" → wizard hidden → refresh → still hidden
9. Manually clear `cmd_onboarding_dismissed` in DevTools → reload → wizard back
10. Verify PromoCard renders with `AUTMZR_PROMOS_JSON` env set
11. Open Network tab → click promo → see plausible event fire
12. Send first chat → see `first_chat_sent` event fire
13. Check `/privacy` and `/terms` pages render with updates

- [ ] **Step 4: Confirm zero regressions for existing users**

In a separate browser/private window:
1. Log in as the existing founder account
2. Verify no `OnboardingWelcome` shows (you have projects)
3. Verify no `TrialBanner` shows
4. Verify existing flows (chat, devices, projects) all work

- [ ] **Step 5: Deploy to prod**

```bash
# Local
git push origin main

# On prod
ssh root@178.236.16.103
cd /opt/cmd
git pull --ff-only
cd apps/master
rm -rf .next
npm run build
systemctl restart cmd
sleep 5
curl -s https://claude.autmzr.ru/api/healthz
```

Expected: healthz returns `{"status":"ok","version":"0.2.0",...}`.

- [ ] **Step 6: Set prod env vars and restart**

On prod, edit `/opt/cmd/.env`:
- Add `PLAUSIBLE_DOMAIN=cmd.autmzr.com` (or whichever domain)
- Add `AUTMZR_PROMOS_JSON='[…]'` with the founder's chosen initial promo(s)

Restart: `systemctl restart cmd`.

- [ ] **Step 7: Post-deploy smoke**

From a fresh browser tab in private mode:
1. Hit `https://cmd.autmzr.com` (or claude.autmzr.ru)
2. Sign up with a test email you control
3. Verify the funnel works as locally
4. Open Plausible dashboard — confirm `signup_completed` event arrived
5. Delete test user via psql when done:
   ```bash
   ssh root@178.236.16.103 'source /opt/cmd/.env && psql "$DATABASE_URL" -c "DELETE FROM pc.users WHERE email = '\''<test-email>'\''"'
   ```

- [ ] **Step 8: Final commit (if anything changed during UAT) + announce**

If UAT surfaced no-code fixes (env, copy), commit them. Then write a short launch announcement (Telegram, X, wherever) — outside this plan's scope.

---

## Out of scope (deferred per spec)

- hCaptcha / anti-bot — add only if abuse becomes measurable
- Multi-user teams within one cmd account
- Paid tier / billing
- Server-side Plausible events for lifetime tracking (current implementation is per-session for `first_chat_sent`)
- Polishing zh.json copy beyond machine translation
