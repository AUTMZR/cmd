/**
 * Access gating: authentication.
 *
 * Применяется на «work» эндпоинтах: /api/chat, /api/exec, /api/fs, /api/rfs.
 * Если user === null — отдаём 401 (логин-флоу ловит только 401).
 * Продукт бесплатный — никаких trial/payment-гейтов нет.
 */

import { NextResponse } from 'next/server';
import type { User } from './auth';

/** Возвращает 401 если пользователь не аутентифицирован. Иначе null — продолжаем. */
export function requireActiveAccess(user: User | null): NextResponse | null {
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return null;
}
