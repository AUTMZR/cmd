import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, queryOne } from './db';

const SESSION_COOKIE = 'pc_session';

export interface User {
  id: string;
  email: string;
  name: string | null;
  is_admin: boolean;
}

export async function getAuthUser(): Promise<User | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const user = await queryOne<User>(
    `SELECT u.id, u.email, u.name, u.is_admin
     FROM pc.user_sessions s JOIN pc.users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [sid],
  );
  if (user) {
    await query(`UPDATE pc.user_sessions SET last_active = NOW() WHERE id = $1`, [sid]);
    await query(`UPDATE pc.users SET last_active = NOW() WHERE id = $1`, [user.id]);
  }
  return user;
}

export async function login(email: string, password: string): Promise<User | null> {
  const row = await queryOne<User & { password_hash: string }>(
    `SELECT id, email, name, is_admin, password_hash FROM pc.users WHERE email = $1`,
    [email],
  );
  if (!row || !row.password_hash) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  const sid = uuidv4();
  await query(`INSERT INTO pc.user_sessions (id, user_id) VALUES ($1, $2)`, [sid, row.id]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sid, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, path: '/',
  });
  return { id: row.id, email: row.email, name: row.name, is_admin: row.is_admin };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await query(`DELETE FROM pc.user_sessions WHERE id = $1`, [sid]);
  jar.delete(SESSION_COOKIE);
}

/** TTL trial для новых публичных регистраций (см. landing pricing). */
const TRIAL_DAYS = 14;

export async function register(email: string, password: string, name?: string, isAdmin = false): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  // Админы получают NULL trial (бесконечный доступ). Остальные — 14 дней с NOW().
  const trialUntil = isAdmin
    ? null
    : new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000).toISOString();
  const rows = await query<{ id: string }>(
    `INSERT INTO pc.users (email, password_hash, name, is_admin, trial_until) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash, name || null, isAdmin, trialUntil],
  );
  if (!rows[0]) throw new Error('user_exists');
  return { id: rows[0].id, email, name: name || null, is_admin: isAdmin };
}

export async function hasAnyUser(): Promise<boolean> {
  const r = await queryOne<{ c: string }>(`SELECT COUNT(*)::text as c FROM pc.users`, []);
  return Number(r?.c || '0') > 0;
}

/* ============================== INVITE CODES ============================== */

export interface InviteCode {
  code: string;
  created_by: string;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  note: string | null;
}

/** Генерит и сохраняет invite-код. Возвращает сам код (его нужно отдать инвайтеду). */
export async function createInvite(adminId: string, opts: { ttlDays?: number; note?: string } = {}): Promise<string> {
  const code = randomBytes(8).toString('base64url');
  const expiresAt = opts.ttlDays
    ? new Date(Date.now() + opts.ttlDays * 24 * 3600 * 1000).toISOString()
    : null;
  await query(
    `INSERT INTO pc.invite_codes (code, created_by, expires_at, note) VALUES ($1, $2, $3, $4)`,
    [code, adminId, expiresAt, opts.note || null],
  );
  return code;
}

export async function listInvites(adminId: string): Promise<InviteCode[]> {
  return await query<InviteCode>(
    `SELECT code, created_by, created_at, used_by, used_at, expires_at, note
     FROM pc.invite_codes WHERE created_by = $1 ORDER BY created_at DESC LIMIT 200`,
    [adminId],
  );
}

export async function revokeInvite(adminId: string, code: string): Promise<boolean> {
  const rows = await query<{ code: string }>(
    `DELETE FROM pc.invite_codes WHERE code = $1 AND created_by = $2 AND used_by IS NULL RETURNING code`,
    [code, adminId],
  );
  return rows.length > 0;
}

/**
 * Проверяет invite-код. Возвращает true если можно использовать.
 * НЕ помечает как использованный — это делает registerWithInvite.
 */
export async function validateInvite(code: string): Promise<boolean> {
  const r = await queryOne<{ used_by: string | null; expires_at: string | null }>(
    `SELECT used_by, expires_at FROM pc.invite_codes WHERE code = $1`,
    [code],
  );
  if (!r) return false;
  if (r.used_by) return false;
  if (r.expires_at && new Date(r.expires_at) < new Date()) return false;
  return true;
}

/** Регистрирует юзера и помечает invite-код как использованный. */
export async function registerWithInvite(email: string, password: string, name: string | undefined, code: string): Promise<User> {
  const valid = await validateInvite(code);
  if (!valid) throw new Error('invite_invalid');
  const user = await register(email, password, name, false);
  await query(
    `UPDATE pc.invite_codes SET used_by = $1, used_at = NOW() WHERE code = $2 AND used_by IS NULL`,
    [user.id, code],
  );
  return user;
}

/* ============================== PASSWORD POLICY =========================== */

/** Возвращает null если ок, иначе error-код для локализации на фронте. */
export function checkPasswordPolicy(pw: string): string | null {
  if (!pw || pw.length < 8) return 'password_too_short';
  if (!/[A-Za-zА-Яа-я]/.test(pw)) return 'password_needs_letters';
  if (!/[0-9]/.test(pw)) return 'password_needs_digits';
  if (pw.length > 200) return 'password_too_long';
  return null;
}
