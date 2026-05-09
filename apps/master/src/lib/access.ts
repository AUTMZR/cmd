/**
 * Access gating: trial-window enforcement.
 *
 * Логика:
 *   • is_admin === true               → unlimited (первый юзер инстанса)
 *   • trial_until === null            → unlimited (self-host без trial-attached)
 *   • trial_until > NOW()             → trial active
 *   • trial_until <= NOW()            → trial_expired → возвращаем 402
 *
 * Эта проверка идёт ПОСЛЕ getAuthUser. Если user === null — отдаём 401, не 402,
 * чтобы не путать UI (логин-флоу должен ловить только 401).
 *
 * Применяется только на «work» эндпоинтах: /api/chat, /api/exec, /api/fs,
 * /api/rfs. Лист-эндпоинты (devices, projects, sessions) и settings не блочим —
 * иначе UI после exp выглядит сломанным; пусть юзер увидит свои данные и
 * увидит баннер с upgrade.
 */

import { NextResponse } from 'next/server';
import type { User } from './auth';

export function isTrialExpired(user: User): boolean {
  if (user.is_admin) return false;
  if (user.trial_until === null) return false;
  return new Date(user.trial_until).getTime() <= Date.now();
}

/** Возвращает 402 Payment Required если trial истёк. Иначе null — продолжаем. */
export function requireActiveAccess(user: User | null): NextResponse | null {
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isTrialExpired(user)) {
    return NextResponse.json(
      { error: 'trial_expired', upgradeUrl: '/upgrade' },
      { status: 402 },
    );
  }
  return null;
}
