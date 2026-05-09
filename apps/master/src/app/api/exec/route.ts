import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { v4 as uuidv4 } from 'uuid';
import type { ExecRequest } from '@autmzr/command-protocol';

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;

  const { projectId, command } = await req.json();
  if (!command) return new Response('command required', { status: 400 });
  if (!projectId) return new Response('projectId required', { status: 400 });

  const project = await queryOne<any>(
    `SELECT p.path, p.device_id, d.name as device_name
     FROM pc.projects p LEFT JOIN pc.devices d ON d.id = p.device_id
     WHERE p.id = $1 AND p.user_id = $2`,
    [projectId, user.id],
  );
  if (!project) return new Response('project not found', { status: 404 });
  if (!project.device_id) return new Response('project has no device', { status: 400 });
  if (!hub().isOnline(project.device_id)) return new Response('device offline', { status: 503 });

  const execReq: ExecRequest = {
    type: 'exec', id: uuidv4(), cwd: project.path || '/tmp', cmd: command, timeout_ms: 60_000,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (obj: any) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const unsub = hub().send(project.device_id, user.id, execReq, (msg) => {
        if (msg.type === 'exec.stdout') push({ type: 'out', text: (msg as any).text });
        else if (msg.type === 'exec.stderr') push({ type: 'err', text: (msg as any).text });
        else if (msg.type === 'exec.exit') {
          closed = true; unsub();
          push({ type: 'exit', code: (msg as any).code });
          try { controller.close(); } catch {}
        }
      });
      // timeout guard
      setTimeout(() => { if (!closed) { closed = true; unsub(); try { controller.close(); } catch {} } }, 70_000);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
