import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type { FsListRequest, FsListReply } from '@autmzr/command-protocol';

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;

  const projectId = req.nextUrl.searchParams.get('projectId');
  const sub = req.nextUrl.searchParams.get('path') || '';
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await queryOne<any>(
    `SELECT path, device_id FROM pc.projects WHERE id = $1 AND user_id = $2`,
    [projectId, user.id],
  );
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  if (!project.device_id) return NextResponse.json({ error: 'project has no device' }, { status: 400 });
  if (!project.path) return NextResponse.json({ error: 'project has no path' }, { status: 400 });
  if (!hub().isOnline(project.device_id)) return NextResponse.json({ error: 'device offline' }, { status: 503 });

  const absPath = sub ? `${project.path}/${sub}`.replace(/\/+/g, '/') : project.path;
  const fsReq: FsListRequest = { type: 'fs.list', id: uuidv4(), path: absPath, depth: 1 };

  try {
    const reply = await hub().request<FsListReply>(project.device_id, user.id, fsReq, 'fs.list.reply', 15_000);
    if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
    // relative paths относительно project.path
    const entries = reply.entries.map(e => ({
      ...e,
      path: e.path, // уже относительный к absPath; добавляем префикс sub
      relPath: sub ? `${sub}/${e.path}` : e.path,
    }));
    return NextResponse.json({
      root: project.path,
      relativePath: sub,
      truncated: reply.truncated,
      tree: entries.map(e => ({ name: e.name, type: e.type, size: e.size, path: e.relPath })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
