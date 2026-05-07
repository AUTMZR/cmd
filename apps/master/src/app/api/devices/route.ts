import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { hashToken, randomToken } from '@/lib/crypto';
import { hub } from '@/lib/ws-hub';
import { parseIntent } from '@/lib/device-intent';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await query<any>(
    `SELECT id, name, kind, hostname, os, arch, capabilities, last_online, last_version,
            agent_logged_in, agent_installed, agent_version, agent_kind,
            gemini_logged_in, gemini_installed, gemini_version, preferred_agent,
            codex_logged_in, codex_installed, codex_version,
            root_path, intent, created_at
     FROM pc.devices WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.id],
  );
  const onlineIds = new Set(hub().onlineDeviceIds());
  const withStatus = rows.map(r => ({ ...r, online: onlineIds.has(r.id) }));
  return NextResponse.json({ devices: withStatus });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, name, root_path, intent, preferred_agent } = await req.json();
  // Валидация preferred_agent — только известные значения
  const validPreferred = preferred_agent && ['claude-code', 'gemini-cli', 'codex-cli'].includes(preferred_agent)
    ? preferred_agent
    : null;
  await query(
    `UPDATE pc.devices SET
       name            = COALESCE($1, name),
       root_path       = COALESCE($2, root_path),
       intent          = COALESCE($3, intent),
       preferred_agent = COALESCE($4, preferred_agent)
     WHERE id = $5 AND user_id = $6`,
    [name ?? null, root_path ?? null, intent ? parseIntent(intent) : null, validPreferred, id, user.id],
  );
  return NextResponse.json({ ok: true });
}

/** POST — создать устройство, вернуть одноразовый токен */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name = 'new device', kind = 'server', intent = 'auto' } = await req.json();
  const token = randomToken(32);
  const role = parseIntent(intent);
  const rows = await query<{ id: string }>(
    `INSERT INTO pc.devices (user_id, name, kind, token_hash, intent)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, String(name).trim(), String(kind), hashToken(token), role],
  );
  const masterWs = (process.env.PUBLIC_URL || '').replace(/^http/, 'ws') || 'ws://localhost:3100';
  return NextResponse.json({
    id: rows[0].id,
    intent: role,
    token, // показываем один раз
    connect_cmd: `curl -sSL ${process.env.PUBLIC_URL || 'http://localhost:3100'}/connect.sh | \\\n  bash -s -- --master ${masterWs}/ws/agent --token ${token} --name ${name}`,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  await query(`DELETE FROM pc.devices WHERE id = $1 AND user_id = $2`, [id, user.id]);
  return NextResponse.json({ ok: true });
}
