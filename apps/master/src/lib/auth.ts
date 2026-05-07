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
  /** ISO-8601 timestamp; null = unrestricted (admin или self-host). */
  trial_until: string | null;
  email_verified: boolean;
}

export async function getAuthUser(): Promise<User | null> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const user = await queryOne<User>(
    `SELECT u.id, u.email, u.name, u.is_admin, u.trial_until, u.email_verified
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
    `SELECT id, email, name, is_admin, trial_until, email_verified, password_hash
     FROM pc.users WHERE email = $1`,
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
  return {
    id: row.id, email: row.email, name: row.name, is_admin: row.is_admin,
    trial_until: row.trial_until, email_verified: row.email_verified,
  };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await query(`DELETE FROM pc.user_sessions WHERE id = $1`, [sid]);
  jar.delete(SESSION_COOKIE);
}

/** TTL trial для новых публичных регистраций (см. landing pricing). */
const TRIAL_DAYS = 14;
/** TTL для verification token. */
const VERIFY_TOKEN_TTL_HOURS = 24;

export async function register(email: string, password: string, name?: string, isAdmin = false): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  // Админы получают NULL trial (бесконечный доступ). Остальные — 14 дней с NOW().
  const trialUntil = isAdmin
    ? null
    : new Date(Date.now() + TRIAL_DAYS * 24 * 3600 * 1000).toISOString();
  // Админ — первый в инстансе, считаем verified автоматически. Публичные регистрации
  // должны подтвердить email через ссылку.
  const emailVerified = isAdmin;
  const rows = await query<{ id: string }>(
    `INSERT INTO pc.users (email, password_hash, name, is_admin, trial_until, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, hash, name || null, isAdmin, trialUntil, emailVerified],
  );
  if (!rows[0]) throw new Error('user_exists');
  return {
    id: rows[0].id, email, name: name || null, is_admin: isAdmin,
    trial_until: trialUntil, email_verified: emailVerified,
  };
}

/* ============================== EMAIL VERIFICATION ========================= */

/** Создаёт verification-токен для юзера. Возвращает сам token (его шлём в email). */
export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600 * 1000).toISOString();
  // Удаляем старые pending-токены этого юзера, чтобы не разводить мусор.
  await query(`DELETE FROM pc.email_verifications WHERE user_id = $1`, [userId]);
  await query(
    `INSERT INTO pc.email_verifications (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt],
  );
  return token;
}

/** Проверяет токен, помечает email как verified, удаляет токен. Возвращает userId либо null. */
export async function consumeVerificationToken(token: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string; expires_at: string }>(
    `SELECT user_id, expires_at FROM pc.email_verifications WHERE token = $1`,
    [token],
  );
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await query(`DELETE FROM pc.email_verifications WHERE token = $1`, [token]);
    return null;
  }
  await query(`UPDATE pc.users SET email_verified = true WHERE id = $1`, [row.user_id]);
  await query(`DELETE FROM pc.email_verifications WHERE token = $1`, [token]);
  return row.user_id;
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
