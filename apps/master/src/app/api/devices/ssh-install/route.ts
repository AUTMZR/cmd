import { NextRequest } from 'next/server';
import { getAuthUser } from "@/lib/auth";
import { requireActiveAccess } from "@/lib/access";
import { rateLimit } from '@/lib/rate-limit';
import { requireCsrf } from '@/lib/csrf';
import { queryOne, query } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { auditAuth, clientIpFrom } from '@/lib/audit';
import { log } from '@/lib/log';
import { Client } from 'ssh2';

/**
 * POST /api/devices/ssh-install
 * Подключается к удалённому серверу по SSH и выполняет там autmzr installer.
 *
 * Body: { host, port?, username, auth: { type: 'password'|'key', password?, key?, passphrase? }, deviceId }
 *
 * Безопасность (B-01 в REVIEW.md):
 *   • Клиент НЕ передаёт shell-команду — только deviceId.
 *   • Команда конструируется ИСКЛЮЧИТЕЛЬНО сервером из device.name + свежевыданного
 *     токена + PUBLIC_URL. Никакого user input в строку команды не попадает.
 *   • Скрипт передаётся на удалённый хост через stdin (`bash -s`), а не как аргумент
 *     к `bash -lc "..."` — это исключает любую возможность injection даже если
 *     device.name содержит метасимволы.
 *   • На каждый SSH install выдаётся НОВЫЙ токен (rotate). Старый перестаёт работать.
 *
 * Credentials существуют только в памяти процесса, в БД/логи не пишутся.
 */
export async function POST(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  // 1 SSH-installer на 30 секунд per-user — защита от спама/долбёжки чужих хостов.
  const limited = rateLimit(req, { key: 'ssh-install', max: 1, windowMs: 30_000, perUser: user.id });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { host, port = 22, username, auth, deviceId } = body || {};

  if (!host || !username || !auth || !deviceId) {
    return new Response('Bad request: need host, username, auth, deviceId', { status: 400 });
  }
  if (typeof host !== 'string' || typeof username !== 'string' || typeof deviceId !== 'string') {
    return new Response('Bad request: string fields required', { status: 400 });
  }

  const device = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM pc.devices WHERE id = $1 AND user_id = $2`,
    [deviceId, user.id],
  );
  if (!device) return new Response('Device not found', { status: 404 });

  // Rotate token: выдаём свежий, инвалидируем все предыдущие. Хеш пишем в БД,
  // plaintext остаётся только в памяти этого запроса и попадает в installer-скрипт.
  const token = randomToken(32);
  await query(
    `UPDATE pc.devices SET token_hash = $1, token_rotated_at = NOW() WHERE id = $2`,
    [hashToken(token), device.id],
  );

  // Audit: SSH install — это критическое действие (юзер даёт root-доступ к хосту).
  const ip = clientIpFrom(req);
  const userAgent = req.headers.get('user-agent');
  await auditAuth({
    event: 'device_token_reissued',
    email: user.email, ip, userAgent,
    meta: { userId: user.id, deviceId: device.id, deviceName: device.name, via: 'ssh-install', sshHost: host },
  });
  log.info('ssh-install start', { userId: user.id, deviceId: device.id, host, port, username, authType: auth.type });

  // Конструируем installer-скрипт. Всё user-supplied (device.name) попадает только
  // в bash single-quoted строки с экранированием `'\''` — стандартный safe-pattern.
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3100';
  const masterWs = publicUrl.replace(/^http/, 'ws');
  const bashSingleQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const installerScript = [
    `#!/bin/bash`,
    `set -e`,
    `MASTER_URL=${bashSingleQuote(`${masterWs}/ws/agent`)}`,
    `TOKEN=${bashSingleQuote(token)}`,
    `DEVICE_NAME=${bashSingleQuote(device.name)}`,
    `CONNECT_URL=${bashSingleQuote(`${publicUrl}/connect.sh`)}`,
    `curl -sSL "$CONNECT_URL" | bash -s -- --master "$MASTER_URL" --token "$TOKEN" --name "$DEVICE_NAME"`,
  ].join('\n');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const push = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      const conn = new Client();
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try { conn.end(); } catch {}
        try { controller.close(); } catch {}
      };

      conn.on('ready', () => {
        push({ type: 'connected' });
        // `bash -s` — фиксированная строка, никаких подстановок. Скрипт идёт в stdin.
        conn.exec('bash -s', (err, stream) => {
          if (err) {
            push({ type: 'error', message: `exec: ${err.message}` });
            safeClose();
            return;
          }
          stream.on('data', (data: Buffer) => push({ type: 'out', text: data.toString('utf8') }));
          stream.stderr.on('data', (data: Buffer) => push({ type: 'err', text: data.toString('utf8') }));
          stream.on('close', (code: number | null) => {
            push({ type: 'exit', code });
            safeClose();
          });
          stream.end(installerScript);
        });
      });

      conn.on('error', (err) => {
        push({ type: 'error', message: err.message });
        safeClose();
      });

      conn.on('end', () => safeClose());
      conn.on('close', () => safeClose());

      try {
        const opts: Record<string, unknown> = {
          host, port, username,
          readyTimeout: 20_000,
          tryKeyboard: false,
        };
        if (auth.type === 'password') {
          if (!auth.password) {
            push({ type: 'error', message: 'password required' });
            safeClose();
            return;
          }
          opts.password = auth.password;
        } else if (auth.type === 'key') {
          if (!auth.key) {
            push({ type: 'error', message: 'private key required' });
            safeClose();
            return;
          }
          opts.privateKey = auth.key;
          if (auth.passphrase) opts.passphrase = auth.passphrase;
        } else {
          push({ type: 'error', message: 'auth.type must be "password" or "key"' });
          safeClose();
          return;
        }
        push({ type: 'connecting', host, port, username });
        conn.connect(opts as never);
      } catch (e) {
        push({ type: 'error', message: (e as Error).message });
        safeClose();
      }

      req.signal?.addEventListener('abort', safeClose);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
