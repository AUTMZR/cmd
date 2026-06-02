/**
 * Backend for rfs-mcp.
 *
 * POST /api/rfs/:op   (op ∈ list|read|write|edit|exec)
 *   Authorization: Bearer <rfs_token>
 *   Body: JSON specific per op
 *
 * No cookie auth here — tokens are issued per claude invocation and stored in pc.rfs_tokens.
 * The rfs-mcp process on claude-device uses this token; it never holds user cookies.
 *
 * Hardenings (REVIEW.md B-04 / B-05):
 *   • Token is scoped to one project — every body.path / body.cwd must resolve
 *     INSIDE pc.projects.path for scope.project_id. Defence-in-depth against
 *     a compromised agent-side safePath.
 *   • Owning user must have active access (trial not expired) to run any op.
 *   • Per-token rate limit (60 ops/min) caps exfiltration speed if a token leaks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { resolve as resolvePath, sep as PATH_SEP } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  FsListRequest, FsListReply,
  FsReadRequest, FsReadReply,
  FsWriteRequest, FsWriteReply,
  ExecRequest,
} from '@autmzr/command-protocol';
import { hub } from '@/lib/ws-hub';
import { validateRfsToken } from '@/lib/rfs-tokens';
import { rateLimit } from '@/lib/rate-limit';
import { queryOne } from '@/lib/db';

type Op = 'list' | 'read' | 'write' | 'edit' | 'exec';
const OPS: Op[] = ['list', 'read', 'write', 'edit', 'exec'];

async function auth(req: NextRequest) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  const scope = await validateRfsToken(token);
  return scope ? { scope, token } : null;
}

/** True if `candidate` is `root` or a descendant. Both are absolute paths. */
function isInside(candidate: string, root: string): boolean {
  const rNorm = resolvePath(root);
  const cNorm = resolvePath(candidate);
  if (cNorm === rNorm) return true;
  // Append separator so `/foo/bar2` doesn't match `/foo/bar`.
  return cNorm.startsWith(rNorm.endsWith(PATH_SEP) ? rNorm : rNorm + PATH_SEP);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  const { op: opRaw } = await params;
  const op = opRaw as Op;
  if (!OPS.includes(op)) {
    return NextResponse.json({ error: 'unknown op' }, { status: 404 });
  }

  const authed = await auth(req);
  if (!authed) return NextResponse.json({ error: 'invalid or expired rfs token' }, { status: 401 });
  const { scope, token } = authed;

  // Per-token rate limit. Use SHA-256 of token so we never log the raw secret
  // (rate-limit doesn't log, but defense in depth).
  const tokenKey = createHash('sha256').update(token).digest('hex').slice(0, 32);
  const limited = rateLimit(req, { key: 'rfs', max: 60, windowMs: 60_000, perUser: tokenKey });
  if (limited) return limited;

  const deviceId = scope.fs_device_id;
  const userId = scope.user_id;

  // Reject if the user no longer exists.
  const user = await queryOne<{ id: string; is_admin: boolean; email: string; name: string | null; email_verified: boolean }>(
    `SELECT id, is_admin, email, name, email_verified FROM pc.users WHERE id = $1`,
    [userId],
  );
  if (!user) return NextResponse.json({ error: 'rfs token owner gone' }, { status: 401 });

  // Project path — the authoritative scope for any path argument.
  const project = await queryOne<{ id: string; path: string }>(
    `SELECT id, path FROM pc.projects WHERE id = $1 AND user_id = $2`,
    [scope.project_id, userId],
  );
  if (!project || !project.path) {
    return NextResponse.json({ error: 'project gone or has no path' }, { status: 404 });
  }
  const projectRoot = project.path;

  if (!hub().isOnline(deviceId)) {
    return NextResponse.json({ error: 'fs-device offline' }, { status: 503 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  // Centralised path guard — must be called for every op that consumes user-supplied paths.
  const pathOutOfScope = (p: string) =>
    NextResponse.json(
      { error: 'path outside of project root', project_root: projectRoot, attempted: p },
      { status: 403 },
    );

  try {
    switch (op) {
      case 'list': {
        if (typeof body.path !== 'string') return NextResponse.json({ error: 'path required' }, { status: 400 });
        if (!isInside(body.path, projectRoot)) return pathOutOfScope(body.path);
        const msg: FsListRequest = { type: 'fs.list', id: uuidv4(), path: body.path, depth: 1 };
        const reply = await hub().request<FsListReply>(deviceId, userId, msg, 'fs.list.reply', 15_000);
        if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
        return NextResponse.json({ path: reply.path, entries: reply.entries, truncated: reply.truncated });
      }

      case 'read': {
        if (typeof body.path !== 'string') return NextResponse.json({ error: 'path required' }, { status: 400 });
        if (!isInside(body.path, projectRoot)) return pathOutOfScope(body.path);
        const msg: FsReadRequest = {
          type: 'fs.read', id: uuidv4(), path: body.path,
          max_bytes: typeof body.max_bytes === 'number' ? body.max_bytes : undefined,
        };
        const reply = await hub().request<FsReadReply>(deviceId, userId, msg, 'fs.read.reply', 20_000);
        if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
        return NextResponse.json({
          path: reply.path, content: reply.content, binary: !!reply.binary, size: reply.size,
        });
      }

      case 'write': {
        if (typeof body.path !== 'string' || typeof body.content !== 'string') {
          return NextResponse.json({ error: 'path, content required' }, { status: 400 });
        }
        if (!isInside(body.path, projectRoot)) return pathOutOfScope(body.path);
        const msg: FsWriteRequest = {
          type: 'fs.write', id: uuidv4(), path: body.path,
          content: body.content, create_dirs: true,
        };
        const reply = await hub().request<FsWriteReply>(deviceId, userId, msg, 'fs.write.reply', 20_000);
        if (reply.error) return NextResponse.json({ error: reply.error }, { status: 400 });
        return NextResponse.json({ path: reply.path, size: reply.size });
      }

      case 'edit': {
        if (typeof body.path !== 'string' || typeof body.old_string !== 'string' || typeof body.new_string !== 'string') {
          return NextResponse.json({ error: 'path, old_string, new_string required' }, { status: 400 });
        }
        if (!isInside(body.path, projectRoot)) return pathOutOfScope(body.path);
        // Read → replace → write. Atomicity — best-effort (WS-roundtrip); acceptable for MVP.
        const readReq: FsReadRequest = { type: 'fs.read', id: uuidv4(), path: body.path };
        const readRep = await hub().request<FsReadReply>(deviceId, userId, readReq, 'fs.read.reply', 20_000);
        if (readRep.error) return NextResponse.json({ error: readRep.error }, { status: 400 });
        if (readRep.binary) return NextResponse.json({ error: 'cannot edit binary file' }, { status: 400 });

        const content = readRep.content || '';
        const { old_string, new_string, replace_all } = body;
        let newContent: string;
        let replaced = 0;
        if (replace_all) {
          newContent = content.split(old_string).join(new_string);
          replaced = newContent === content ? 0 : (content.match(new RegExp(old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        } else {
          const first = content.indexOf(old_string);
          if (first === -1) return NextResponse.json({ error: 'old_string not found' }, { status: 400 });
          const second = content.indexOf(old_string, first + old_string.length);
          if (second !== -1) return NextResponse.json({ error: 'old_string not unique; pass replace_all=true or add more context' }, { status: 400 });
          newContent = content.slice(0, first) + new_string + content.slice(first + old_string.length);
          replaced = 1;
        }
        if (replaced === 0) return NextResponse.json({ error: 'old_string not found' }, { status: 400 });

        const writeReq: FsWriteRequest = { type: 'fs.write', id: uuidv4(), path: body.path, content: newContent };
        const writeRep = await hub().request<FsWriteReply>(deviceId, userId, writeReq, 'fs.write.reply', 20_000);
        if (writeRep.error) return NextResponse.json({ error: writeRep.error }, { status: 400 });
        return NextResponse.json({ path: writeRep.path, size: writeRep.size, replaced });
      }

      case 'exec': {
        if (typeof body.cmd !== 'string') return NextResponse.json({ error: 'cmd required' }, { status: 400 });
        const cwd = typeof body.cwd === 'string' && body.cwd ? body.cwd : projectRoot;
        if (!isInside(cwd, projectRoot)) return pathOutOfScope(cwd);
        const timeout = Math.min(typeof body.timeout_ms === 'number' ? body.timeout_ms : 60_000, 300_000);
        const msg: ExecRequest = {
          type: 'exec', id: uuidv4(),
          cwd, cmd: body.cmd, timeout_ms: timeout,
        };
        let stdout = '', stderr = '', exitCode: number | null = null;
        await new Promise<void>((resolve) => {
          let done = false;
          const killer = setTimeout(() => { if (!done) { done = true; unsub(); resolve(); } }, timeout + 5_000);
          const unsub = hub().send(deviceId, userId, msg, (m) => {
            if (m.type === 'exec.stdout') stdout += (m as any).text;
            else if (m.type === 'exec.stderr') stderr += (m as any).text;
            else if (m.type === 'exec.exit') {
              if (done) return;
              done = true; exitCode = (m as any).code; clearTimeout(killer); unsub(); resolve();
            }
          });
        });
        return NextResponse.json({ stdout, stderr, exit_code: exitCode });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
