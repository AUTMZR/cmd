import { NextRequest, NextResponse } from 'next/server';
import { consumeVerificationToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendWelcomeEmail } from '@/lib/email';
import { queryOne } from '@/lib/db';
import { log } from '@/lib/log';

/**
 * GET /api/auth/verify?token=XXX
 * Подтверждает email юзера. Вызывается с /verify-email страницы.
 *
 * Возвращает { ok: true } при успехе, { ok: false, errorCode } иначе.
 * Frontend сам решает что показать пользователю.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { key: 'verify-email', max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, errorCode: 'token_required' }, { status: 400 });
  }

  const userId = await consumeVerificationToken(token);
  if (!userId) {
    return NextResponse.json({ ok: false, errorCode: 'token_invalid' }, { status: 400 });
  }

  // Достаём email/name для welcome-письма.
  const u = await queryOne<{ email: string; name: string | null }>(
    `SELECT email, name FROM pc.users WHERE id = $1`,
    [userId],
  );
  if (u) {
    sendWelcomeEmail(u.email, u.name).catch((e) =>
      log.warn('welcome email failed', { userId, err: (e as Error).message }),
    );
  }

  return NextResponse.json({ ok: true });
}
