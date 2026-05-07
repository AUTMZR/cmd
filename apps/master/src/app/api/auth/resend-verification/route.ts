import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createVerificationToken } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { requireCsrf } from '@/lib/csrf';
import { sendVerificationEmail } from '@/lib/email';
import { log } from '@/lib/log';

/**
 * POST /api/auth/resend-verification
 * Перевыпускает verification token и шлёт email повторно для текущего юзера.
 * Только если email_verified === false.
 */
export async function POST(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // 1 запрос в 60 сек — этого хватает чтобы юзер не спамил, но достаточно для retry.
  const limited = rateLimit(req, { key: 'resend-verification', max: 1, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, errorCode: 'unauthorized' }, { status: 401 });
  if (user.email_verified) {
    return NextResponse.json({ ok: false, errorCode: 'already_verified' }, { status: 400 });
  }

  try {
    const token = await createVerificationToken(user.id);
    const result = await sendVerificationEmail(user.email, user.name, token);
    return NextResponse.json({ ok: true, delivered: result.delivered });
  } catch (e) {
    log.warn('resend-verification failed', { userId: user.id, err: (e as Error).message });
    return NextResponse.json({ ok: false, errorCode: 'send_failed' }, { status: 500 });
  }
}
