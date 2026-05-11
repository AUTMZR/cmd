import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { requireCsrf } from '@/lib/csrf';

/**
 * POST /api/devices/[id]/reissue-token
 *
 * Перевыпускает device-token для существующего устройства. Нужно когда юзер
 * добавил устройство, но не успел/закрыл окно с connect-командой — токен
 * в БД хранится только хэшем (одноразовый), оригинал восстановить нельзя.
 *
 * Безопасность:
 *   • рейт-лимита нет, но требуется CSRF и owner-проверка → bruteforce
 *     не получится (надо иметь session-cookie владельца).
 *   • Перевыпуск убивает старый токен (token_hash перезаписывается). Любой
 *     уже подключённый агент с прежним токеном получит 401 при reconnect.
 *
 * Возвращает: { id, token, connect_cmd } — то же что POST /api/devices.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: deviceId } = await params;

  const device = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM pc.devices WHERE id = $1 AND user_id = $2`,
    [deviceId, user.id],
  );
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

  const token = randomToken(32);
  await query(
    `UPDATE pc.devices SET token_hash = $1 WHERE id = $2`,
    [hashToken(token), deviceId],
  );

  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3100';
  const masterWs = publicUrl.replace(/^http/, 'ws');
  const connectCmd = `curl -sSL ${publicUrl}/connect.sh | \\\n  bash -s -- --master ${masterWs}/ws/agent --token ${token} --name ${device.name}`;

  return NextResponse.json({
    id: device.id,
    token,
    connect_cmd: connectCmd,
  });
}
