import { NextResponse } from 'next/server';
import { getPublicKey } from '@/lib/push';

/** Отдаёт VAPID public key для PushManager.subscribe() на клиенте.
 *  Публичная ручка — ключ и так публичный по своей природе. */
export async function GET() {
  const key = getPublicKey();
  if (!key) return NextResponse.json({ enabled: false }, { status: 200 });
  return NextResponse.json({ enabled: true, publicKey: key });
}
