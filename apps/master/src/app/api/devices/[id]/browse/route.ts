import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from "@/lib/auth";
import { requireActiveAccess } from "@/lib/access";
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type { FsListRequest, FsListReply } from '@autmzr/command-protocol';

const DEFAULT_ROOTS = ['/opt', '/home', '/root', '/Users', '/tmp', '/srv', '/var'];

/**
 * GET /api/devices/[id]/browse?path=/opt
 * Листинг любой папки на устройстве через fs.list RPC.
 * Если path пусто — возвращаем "корни" (кандидаты, которые существуют на устройстве).
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

  const reqPath = req.nextUrl.searchParams.get('path') || '';

  // Без path — спрашиваем у устройства какие из DEFAULT_ROOTS существуют
  if (!reqPath) {
    const roots: string[] = [];
    for (const r of DEFAULT_ROOTS) {
      try {
        const fsReq: FsListRequest = { type: 'fs.list', id: uuidv4(), path: r, depth: 1 };
        const reply = await hub().request<FsListReply>(deviceId, user.id, fsReq, 'fs.list.reply', 5000);
        if (!reply.error) roots.push(r);
      } catch { /* root недоступен */ }
    }
    return NextResponse.json({ device: device.name, path: '', parent: null, roots, entries: [] });
  }

  const fsReq: FsListRequest = { type: 'fs.list', id: uuidv4(), path: reqPath, depth: 1 };
  try {
    const reply = await hub().request<FsListReply>(deviceId, user.id, fsReq, 'fs.list.reply', 15_000);
    if (reply.error) return NextResponse.json({ error: reply.error, path: reqPath }, { status: 400 });
    const parent = reqPath === '/' ? null : reqPath.substring(0, reqPath.lastIndexOf('/')) || '/';
    return NextResponse.json({
      device: device.name,
      path: reply.path,
      parent,
      roots: DEFAULT_ROOTS,
      entries: reply.entries.map(e => ({
        name: e.name,
        path: `${reply.path.replace(/\/$/, '')}/${e.name}`.replace(/\/+/g, '/'),
        type: e.type,
        size: e.size,
      })),
      truncated: reply.truncated,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
