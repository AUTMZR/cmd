/**
 * Web Push helper. Тонкая обёртка над `web-push`:
 *   • init(): один раз настраивает VAPID-ключи на старте процесса
 *   • sendToUser(userId, payload): рассылает по всем подпискам юзера, чистит revoked
 *
 * Если VAPID-ключи не заданы в env — push-функционал no-op (важно для self-host
 * без HTTPS, где Web Push физически не работает).
 */

import webpush from 'web-push';
import { query } from './db';

let initialized = false;
let enabled = false;

function init(): void {
  if (initialized) return;
  initialized = true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@example.com';
  if (!pub || !priv) {
    console.warn('[push] VAPID keys not set — Web Push disabled');
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  enabled = true;
}

export function isPushEnabled(): boolean {
  init();
  return enabled;
}

export function getPublicKey(): string | null {
  init();
  return enabled ? (process.env.VAPID_PUBLIC_KEY || null) : null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Куда вести при клике. Относительный URL: '/app?session=...' */
  url?: string;
  /** Дедупликация (если приходит повторно — заменяет). */
  tag?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Шлёт push всем подпискам юзера. Не бросает при ошибках — логирует. */
export async function sendToUser(userId: number, payload: PushPayload): Promise<void> {
  init();
  if (!enabled) return;

  const subs = await query<SubRow>(
    `SELECT id, endpoint, p256dh, auth FROM pc.push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const goneEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 }, // 24h — для коротких уведомлений типа "task done"
        );
        await query(`UPDATE pc.push_subscriptions SET last_used_at = NOW() WHERE id = $1`, [s.id]);
      } catch (e: any) {
        const status = e?.statusCode;
        if (status === 404 || status === 410) {
          // Subscription gone — чистим.
          goneEndpoints.push(s.endpoint);
        } else {
          console.warn('[push] send failed', { endpoint: s.endpoint.slice(0, 60), status, msg: e?.message });
        }
      }
    }),
  );

  if (goneEndpoints.length > 0) {
    await query(
      `DELETE FROM pc.push_subscriptions WHERE endpoint = ANY($1::text[])`,
      [goneEndpoints],
    );
  }
}
