import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type {
  FsReadRequest, FsReadReply,
  FsWriteRequest, FsWriteReply,
  FsDeleteRequest, FsDeleteReply,
  FsMkdirRequest, FsMkdirReply,
} from '@autmzr/command-protocol';

async function resolveProject(req: NextRequest, userId: string) {
  const projectId = req.nextUrl.searchParams.get('projectId') || (await safeBody(req)).projectId;
  const subPath = req.nextUrl.searchParams.get('path') || (await safeBody(req)).path;
  if (!projectId) return { err: 'projectId required', status: 400 as const };
  const project = await queryOne<any>(
    `SELECT path, device_id FROM pc.projects WHERE id = $1 AND user_id = $2`, [projectId, userId]);
  if (!project) return { err: 'project not found', status: 404 as const };
  if (!project.device_id || !project.path) return { err: 'project has no device/path', status: 400 as const };
  if (!hub().isOnline(project.device_id)) return { err: 'device offline', status: 503 as const };
  const abs = subPath ? `${project.path}/${subPath}`.replace(/\/+/g, '/') : project.path;
  return { abs, device_id: project.device_id };
}

async function safeBody(req: NextRequest): Promise<any> {
  try { return await req.clone().json(); } catch { return {}; }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const r = await resolveProject(req, user.id);
  if ('err' in r) return NextResponse.json({ error: r.err }, { status: r.status });
  const fsReq: FsReadRequest = { type: 'fs.read', id: uuidv4(), path: r.abs };
  try {
    const reply = await hub().request<FsReadReply>(r.device_id, user.id, fsReq, 'fs.read.reply', 20_000);
    if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
    return NextResponse.json({ path: reply.path, size: reply.size, binary: reply.binary, content: reply.content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const body = await req.json();
  const r = await resolveProject(req, user.id);
  if ('err' in r) return NextResponse.json({ error: r.err }, { status: r.status });

  if (body.type === 'dir') {
    const fsReq: FsMkdirRequest = { type: 'fs.mkdir', id: uuidv4(), path: r.abs, recursive: true };
    const reply = await hub().request<FsMkdirReply>(r.device_id, user.id, fsReq, 'fs.mkdir.reply', 10_000);
    if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const fsReq: FsWriteRequest = { type: 'fs.write', id: uuidv4(), path: r.abs, content: String(body.content ?? ''), create_dirs: true };
  const reply = await hub().request<FsWriteReply>(r.device_id, user.id, fsReq, 'fs.write.reply', 20_000);
  if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
  return NextResponse.json({ ok: true, size: reply.size });
}

export async function PUT(req: NextRequest) { return POST(req); }

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const r = await resolveProject(req, user.id);
  if ('err' in r) return NextResponse.json({ error: r.err }, { status: r.status });
  const fsReq: FsDeleteRequest = { type: 'fs.delete', id: uuidv4(), path: r.abs, recursive: true };
  const reply = await hub().request<FsDeleteReply>(r.device_id, user.id, fsReq, 'fs.delete.reply', 10_000);
  if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
