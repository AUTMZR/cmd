import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { requireCsrf } from '@/lib/csrf';
import { query } from '@/lib/db';

/** POST — сохранить PushSubscription для текущего юзера.
 *  Тело: { endpoint, keys: { p256dh, auth } } (формат PushSubscription.toJSON). */
export async function POST(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }
  const ua = req.headers.get('user-agent') || null;

  await query(
    `INSERT INTO pc.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           last_used_at = NOW()`,
    [user.id, endpoint, p256dh, auth, ua],
  );
  return NextResponse.json({ ok: true });
}

/** DELETE — отписать. Тело: { endpoint } */
export async function DELETE(req: NextRequest) {
  const csrfBlocked = await requireCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  if (!endpoint) return NextResponse.json({ error: 'endpoint_required' }, { status: 400 });

  await query(
    `DELETE FROM pc.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [user.id, endpoint],
  );
  return NextResponse.json({ ok: true });
}
