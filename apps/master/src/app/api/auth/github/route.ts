import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { authorizeUrl, isGithubOAuthEnabled } from '@/lib/oauth-github';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pc_oauth_state';

/** GET /api/auth/github → 302 на github.com authorize. */
export async function GET(req: NextRequest) {
  if (!isGithubOAuthEnabled()) {
    return NextResponse.json({ error: 'github_oauth_not_configured' }, { status: 501 });
  }
  const state = randomBytes(16).toString('base64url');
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/github/callback`;

  const res = NextResponse.redirect(authorizeUrl(state, redirectUri));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 600, path: '/',
  });
  return res;
}
