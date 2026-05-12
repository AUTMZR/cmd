import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { queryOne, query } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { requireCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { auditAuth, clientIpFrom } from '@/lib/audit';
import { sendToUser } from '@/lib/push';
import { log } from '@/lib/log';

/**
 * POST /api/devices/[id]/reissue-token
 *
 * Перевыпускает device-token для существующего устройства. Нужно когда юзер
 * закрыл окно с connect-командой и хочет показать её ещё раз.
 *
 * Безопасность (B-03 в REVIEW.md):
 *   • CSRF + owner-check защищают от классической атаки
 *   • Rate-limit: 5 запросов в час на юзера — чтобы leak'нутая сессия
 *     не могла перевыпустить токены всему флоту молниеносно
 *   • Audit row + push-уведомление владельцу — «device token rotated, не ты?»
 *   • token_rotated_at сохраняется в БД и показывается на карточке устройства
 *   • Trial gate — expired-юзер не должен иметь возможность подменять токены
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'reissue-token', max: 5, windowMs: 3600_000, perUser: user.id });
  if (limited) return limited;
  const { id: deviceId } = await params;

  const device = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM pc.devices WHERE id = $1 AND user_id = $2`,
    [deviceId, user.id],
  );
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

  const token = randomToken(32);
  await query(
    `UPDATE pc.devices SET token_hash = $1, token_rotated_at = NOW() WHERE id = $2`,
    [hashToken(token), deviceId],
  );

  const ip = clientIpFrom(req);
  const userAgent = req.headers.get('user-agent');
  await auditAuth({
    event: 'device_token_reissued',
    email: user.email, ip, userAgent,
    meta: { userId: user.id, deviceId: device.id, deviceName: device.name },
  });
  log.info('device token reissued', { userId: user.id, deviceId: device.id, ip });

  // Push-уведомление — не блокирующее: если юзер не подписан, no-op.
  void sendToUser(user.id, {
    title: `🔐 Device token rotated`,
    body: `New connect command issued for ${device.name}. Wasn't you? Revoke now.`,
    url: '/app',
    tag: `device-rotated-${device.id}`,
  }).catch(() => { /* logged in push.ts */ });

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3100';
  const masterWs = publicUrl.replace(/^http/, 'ws');
  const connectCmd = `curl -sSL ${publicUrl}/connect.sh | \\\n  bash -s -- --master ${masterWs}/ws/agent --token ${token} --name ${device.name}`;

  return NextResponse.json({
    id: device.id,
    token,
    connect_cmd: connectCmd,
  });
}
