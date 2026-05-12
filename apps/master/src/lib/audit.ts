/** Логирование auth-событий в БД для расследований. Не падает если DB недоступен. */
import { query } from './db';
import { log } from './log';

export type AuthEvent =
  | 'login_ok' | 'login_fail' | 'signup' | 'logout' | 'rate_limit' | 'csrf_fail'
  // device-token rotation events (B-03 in REVIEW.md)
  | 'device_token_reissued';

export async function auditAuth(params: {
  event: AuthEvent;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO pc.auth_audit (event, email, ip, user_agent, meta) VALUES ($1, $2, $3, $4, $5)`,
      [params.event, params.email || null, params.ip || null, params.userAgent || null, params.meta ? JSON.stringify(params.meta) : null],
    );
  } catch (e) {
    log.warn('audit.write failed', { event: params.event, err: String(e) });
  }
}

export function clientIpFrom(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || null;
}
