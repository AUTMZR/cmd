import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser, login, logout, register, hasAnyUser,
  registerWithInvite, checkPasswordPolicy, createVerificationToken,
} from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ensureCsrfCookie, requireCsrf } from '@/lib/csrf';
import { auditAuth, clientIpFrom } from '@/lib/audit';
import { log } from '@/lib/log';
import { sendVerificationEmail } from '@/lib/email';
import { isGithubOAuthEnabled } from '@/lib/oauth-github';

/** GET — текущий пользователь / нужен ли setup. Также выставляет CSRF cookie. */
export async function GET() {
  const user = await getAuthUser();
  const hasUser = await hasAnyUser();
  const githubOauth = isGithubOAuthEnabled();
  const res = NextResponse.json(user
    ? { user, githubOauth }
    : { user: null, setup: !hasUser, githubOauth });
  await ensureCsrfCookie(res);
  return res;
}

/** POST — логин */
export async function POST(req: NextRequest) {
  // 1. CSRF
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) {
    await auditAuth({ event: 'csrf_fail', ip: clientIpFrom(req), userAgent: req.headers.get('user-agent') });
    return csrfBlocked;
  }
  // 2. Rate-limit: 5 попыток в минуту с одного IP
  const limited = rateLimit(req, { key: 'login', max: 5, windowMs: 60_000 });
  if (limited) {
    await auditAuth({ event: 'rate_limit', ip: clientIpFrom(req), userAgent: req.headers.get('user-agent'), meta: { route: 'login' } });
    return limited;
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const ip = clientIpFrom(req);
  const ua = req.headers.get('user-agent');
  const user = await login(email, password);
  if (!user) {
    await auditAuth({ event: 'login_fail', email, ip, userAgent: ua });
    log.info('login fail', { email, ip });
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  await auditAuth({ event: 'login_ok', email, ip, userAgent: ua, meta: { userId: user.id } });
  log.info('login ok', { userId: user.id, email, ip });
  return NextResponse.json({ user });
}

/**
 * PUT — регистрация.
 *   - Если в системе нет ни одного юзера → создаётся первый админ (setup mode).
 *   - Иначе — публичная регистрация: email + пароль, 14-дневный trial из коробки.
 *   - Опционально можно прислать `inviteCode` (legacy): код помечается как использованный
 *     для аналитики, но обязательным больше не является.
 *
 * Все user-facing error-сообщения возвращаются как `errorCode` — фронт их локализует.
 */
export async function PUT(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) {
    await auditAuth({ event: 'csrf_fail', ip: clientIpFrom(req), userAgent: req.headers.get('user-agent') });
    return csrfBlocked;
  }
  const limited = rateLimit(req, { key: 'signup', max: 3, windowMs: 60_000 });
  if (limited) {
    await auditAuth({ event: 'rate_limit', ip: clientIpFrom(req), userAgent: req.headers.get('user-agent'), meta: { route: 'signup' } });
    return limited;
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = body.name ? String(body.name).trim() : undefined;
  const inviteCode = body.inviteCode ? String(body.inviteCode).trim() : undefined;

  if (!email) return NextResponse.json({ errorCode: 'email_required' }, { status: 400 });
  const pwErr = checkPasswordPolicy(password);
  if (pwErr) return NextResponse.json({ errorCode: pwErr }, { status: 400 });

  const ip = clientIpFrom(req);
  const ua = req.headers.get('user-agent');
  const has = await hasAnyUser();

  try {
    let user;
    let viaInvite = false;
    if (!has) {
      // Setup mode — первый юзер становится админом.
      user = await register(email, password, name, true);
      log.info('setup: first admin created', { userId: user.id, email });
    } else if (inviteCode) {
      // Legacy: invite-код — оставлен для админов, которые хотят раздавать early-access ссылки.
      user = await registerWithInvite(email, password, name, inviteCode);
      viaInvite = true;
      log.info('signup via invite', { userId: user.id, email, inviteCode });
    } else {
      // Public signup — 14-day trial проставляется в register().
      user = await register(email, password, name, false);
      log.info('public signup', { userId: user.id, email });
    }
    await login(user.email, password);
    await auditAuth({ event: 'signup', email, ip, userAgent: ua, meta: { userId: user.id, viaInvite } });

    // Шлём verification email только не-админам (админ при setup автоматически verified).
    if (!user.email_verified) {
      try {
        const token = await createVerificationToken(user.id);
        await sendVerificationEmail(user.email, user.name, token);
      } catch (e) {
        // Не валим signup из-за email-сбоя — юзер сможет запросить resend.
        log.warn('verification email failed (non-fatal)', { email, err: (e as Error).message });
      }
    }
    return NextResponse.json({ user });
  } catch (e) {
    const code = (e as Error).message;
    log.warn('signup failed', { email, ip, err: code });
    return NextResponse.json({ errorCode: code }, { status: 400 });
  }
}

/** DELETE — logout */
export async function DELETE(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const u = await getAuthUser();
  await logout();
  if (u) await auditAuth({ event: 'logout', email: u.email, ip: clientIpFrom(req), userAgent: req.headers.get('user-agent'), meta: { userId: u.id } });
  return NextResponse.json({ ok: true });
}
