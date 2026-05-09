import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireActiveAccess } from '@/lib/access';
import { queryOne } from '@/lib/db';
import { hub } from '@/lib/ws-hub';
import { decrypt } from '@/lib/crypto';
import { requireCsrf } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import type { GitCloneRequest, GitCloneProgress, GitCloneReply } from '@autmzr/command-protocol';

export const dynamic = 'force-dynamic';

/**
 * POST /api/devices/[id]/git-clone
 * body: { repo_url, parent_path, folder_name, useGithubToken? }
 *
 * Стримит прогресс git clone как SSE: { type: 'out'|'done'|'error', ... }.
 * Если useGithubToken=true — берём из pc.users.github_access_token (для приватных).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;
  const user = await getAuthUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const blocked = requireActiveAccess(user);
  if (blocked) return blocked;
  const limited = rateLimit(req, { key: 'git-clone', max: 5, windowMs: 60_000, perUser: user.id });
  if (limited) return limited;

  const { id: deviceId } = await params;
  const body = await req.json().catch(() => ({}));
  const repo_url = String(body.repo_url || '');
  const parent_path = String(body.parent_path || '');
  const folder_name = String(body.folder_name || '');
  const useGithubToken = !!body.useGithubToken;

  if (!repo_url || !parent_path || !folder_name) {
    return new Response('repo_url, parent_path, folder_name required', { status: 400 });
  }

  const device = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM pc.devices WHERE id = $1 AND user_id = $2`, [deviceId, user.id]);
  if (!device) return new Response('Device not found', { status: 404 });
  if (!hub().isOnline(deviceId)) return new Response('Device offline', { status: 503 });

  let token: string | undefined;
  if (useGithubToken) {
    const row = await queryOne<{ github_access_token: string | null }>(
      `SELECT github_access_token FROM pc.users WHERE id = $1`, [user.id]);
    if (row?.github_access_token) {
      try { token = decrypt(row.github_access_token); }
      catch { /* ignore — для public repo fallback */ }
    }
  }

  const cloneId = uuidv4();
  const cloneMsg: GitCloneRequest = {
    type: 'git.clone', id: cloneId, repo_url, parent_path, folder_name, token, depth: 1,
  };
  const deviceIdSafe = device.id;
  const userIdSafe = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      push({ type: 'start' });

      const killer = setTimeout(() => {
        try { unsub(); } catch {}
        push({ type: 'error', message: 'timeout' });
        try { controller.close(); } catch {}
      }, 5 * 60_000); // 5 min — для крупных репо при медленной сети

      const unsub = hub().send(deviceIdSafe, userIdSafe, cloneMsg, (reply) => {
        if (reply.type === 'git.clone.progress') {
          push({ type: 'out', text: (reply as GitCloneProgress).text });
        } else if (reply.type === 'git.clone.reply') {
          const r = reply as GitCloneReply;
          clearTimeout(killer);
          if (r.ok) push({ type: 'done', path: r.path });
          else push({ type: 'error', message: r.error || 'clone failed' });
          unsub();
          try { controller.close(); } catch {}
        }
      });
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
