/**
 * GitHub OAuth helpers.
 *
 * Flow:
 *   1. /api/auth/github → редирект на github.com/login/oauth/authorize
 *      (state — random 32 bytes, кладём в HTTP-only cookie pc_oauth_state)
 *   2. GitHub → /api/auth/github/callback?code=...&state=...
 *   3. callback меняет code на access_token, fetches /user и /user/emails,
 *      создаёт/линкует pc.users, ставит session cookie.
 *
 * Scopes:
 *   • `read:user` — нужен профиль (id, login, avatar)
 *   • `user:email` — primary email (для линкования с email-аккаунтом)
 *   • `repo` — нужен для clone-as-project (private repos). Можно
 *      сузить до `public_repo` если юзер так предпочитает — UI позже.
 */

const SCOPE = 'read:user user:email repo';

export function isGithubOAuthEnabled(): boolean {
  return !!(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('state', state);
  u.searchParams.set('allow_signup', 'true');
  return u.toString();
}

export interface GhProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`github_token_exchange_${res.status}`);
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || 'no_access_token');
  return j.access_token as string;
}

export async function fetchProfile(accessToken: string): Promise<GhProfile> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' };
  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) throw new Error(`github_user_${userRes.status}`);
  const u = await userRes.json();

  let email: string | null = u.email || null;
  if (!email) {
    // /user.email возвращает null если профиль скрывает primary — лезем в /user/emails.
    const emRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emRes.ok) {
      const list = await emRes.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = list.find((e) => e.primary && e.verified) || list.find((e) => e.verified);
      if (primary) email = primary.email;
    }
  }

  return { id: u.id, login: u.login, name: u.name, avatar_url: u.avatar_url, email };
}
