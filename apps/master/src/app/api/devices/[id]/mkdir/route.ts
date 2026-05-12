import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from "@/lib/auth";
import { requireActiveAccess } from "@/lib/access";
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type { FsMkdirRequest, FsMkdirReply } from '@autmzr/command-protocol';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const { id: deviceId } = await params;
  const { path: parent, name } = await req.json();
  if (!parent || !name) return NextResponse.json({ error: 'path and name required' }, { status: 400 });
  if (!/^[\w.\- @]+$/.test(String(name))) return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });

  const device = await queryOne<{ id: string }>(
    `SELECT id FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  if (!hub().isOnline(deviceId)) return NextResponse.json({ error: 'Device offline' }, { status: 503 });

  const full = `${String(parent).replace(/\/$/, '')}/${name}`.replace(/\/+/g, '/');
  const fsReq: FsMkdirRequest = { type: 'fs.mkdir', id: uuidv4(), path: full, recursive: true };
  const reply = await hub().request<FsMkdirReply>(deviceId, user.id, fsReq, 'fs.mkdir.reply', 10_000);
  if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
  return NextResponse.json({ ok: true, path: full });
}
