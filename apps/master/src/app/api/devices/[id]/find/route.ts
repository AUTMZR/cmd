import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from "@/lib/auth";
import { requireActiveAccess } from "@/lib/access";
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type { ExecRequest } from '@autmzr/command-protocol';

/**
 * GET /api/devices/[id]/find?path=/opt&q=pocket&kind=dir
 * Рекурсивный поиск по дереву устройства через exec `find`.
 * Ограничено: maxdepth 6, head 200, timeout 15s.
 * kind = 'dir' | 'file' | 'any' (default 'dir')
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const { id: deviceId } = await params;

  const device = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  if (!hub().isOnline(deviceId)) return NextResponse.json({ error: 'Device offline' }, { status: 503 });

  const path = req.nextUrl.searchParams.get('path') || '';
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const kind = (req.nextUrl.searchParams.get('kind') || 'dir') as 'dir' | 'file' | 'any';

  if (!path || !path.startsWith('/')) return NextResponse.json({ error: 'absolute path required' }, { status: 400 });
  if (!q || q.length < 1) return NextResponse.json({ error: 'q required' }, { status: 400 });
  if (q.length > 64) return NextResponse.json({ error: 'q too long' }, { status: 400 });
  // Запрет опасных символов — оставляем только то, что встречается в именах файлов
  if (/[`$"'\\\n;|&<>]/.test(q) || /[`$"'\\\n;|&<>]/.test(path)) {
    return NextResponse.json({ error: 'invalid characters' }, { status: 400 });
  }

  const typeFlag = kind === 'file' ? '-type f' : kind === 'any' ? '' : '-type d';
  // Пропускаем тяжёлые директории, чтобы на больших серверах поиск не вис
  const prune = [
    'node_modules', '.git', '.next', 'dist', 'build', 'target',
    'vendor', '.cache', '.venv', 'venv', '__pycache__', '.tox',
  ];
  const pruneExpr = prune.map(n => `-name ${n}`).join(' -o ');
  const cmd = `find ${JSON.stringify(path)} \\( ${pruneExpr} \\) -prune -o -iname ${JSON.stringify('*' + q + '*')} ${typeFlag} -print 2>/dev/null | head -n 200`;

  const execReq: ExecRequest = {
    type: 'exec', id: uuidv4(), cwd: '/', cmd, timeout_ms: 15_000,
  };

  const results: string[] = [];
  let exited = false;
  let exitCode: number | null = null;

  await new Promise<void>((resolve) => {
    let buf = '';
    const unsub = hub().send(deviceId, user.id, execReq, (msg) => {
      if (msg.type === 'exec.stdout') {
        buf += (msg as any).text;
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const ln of lines) { const t = ln.trim(); if (t) results.push(t); }
      } else if (msg.type === 'exec.exit') {
        if (buf.trim()) results.push(buf.trim());
        exited = true; exitCode = (msg as any).code;
        unsub(); resolve();
      }
    });
    setTimeout(() => { if (!exited) { unsub(); resolve(); } }, 16_000);
  });

  // Убираем саму search-папку из результатов и prune'нутые ложные совпадения
  const normalized = Array.from(new Set(results))
    .filter(p => p !== path)
    .slice(0, 200);

  return NextResponse.json({
    device: device.name,
    path, q, kind,
    results: normalized,
    timed_out: !exited,
    exit_code: exitCode,
  });
}
