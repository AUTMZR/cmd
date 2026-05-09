import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, fetchProfile } from '@/lib/oauth-github';
import { loginOrRegisterWithGithub } from '@/lib/auth';
import { encrypt } from '@/lib/crypto';
import { ensureCsrfCookie } from '@/lib/csrf';
import { auditAuth, clientIpFrom } from '@/lib/audit';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pc_oauth_state';

/** GET /api/auth/github/callback?code=…&state=… → set session cookie, redirect to /app */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const expected = req.cookies.get(STATE_COOKIE)?.value || '';

  const fail = (reason: string) => {
    log.warn('github oauth fail', { reason });
    return NextResponse.redirect(new URL(`/login?oauthError=${encodeURIComponent(reason)}`, url));
  };

  if (!code || !state) return fail('missing_code_or_state');
  if (state !== expected) return fail('state_mismatch');

  const redirectUri = `${url.origin}/api/auth/github/callback`;
  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(code, redirectUri);
  } catch (e: any) {
    return fail(`token_exchange:${e.message}`);
  }

  let profile;
  try {
    profile = await fetchProfile(accessToken);
  } catch (e: any) {
    return fail(`profile_fetch:${e.message}`);
  }

  if (!profile.email) return fail('no_verified_email');

  const encryptedToken = encrypt(accessToken);
  let user;
  try {
    user = await loginOrRegisterWithGithub({
      ghId: profile.id,
      ghLogin: profile.login,
      ghName: profile.name,
      ghAvatarUrl: profile.avatar_url,
      ghEmail: profile.email,
      encryptedToken,
    });
  } catch (e: any) {
    return fail(`db:${e.message}`);
  }

  await auditAuth({
    event: 'login_ok', email: user.email,
    ip: clientIpFrom(req), userAgent: req.headers.get('user-agent'),
    meta: { userId: user.id, via: 'github' },
  });
  log.info('github login ok', { userId: user.id, email: user.email });

  const res = NextResponse.redirect(new URL('/app', url));
  res.cookies.delete(STATE_COOKIE);
  await ensureCsrfCookie(res);
  return res;
}
