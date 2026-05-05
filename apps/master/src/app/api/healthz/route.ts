import { NextResponse } from 'next/server';
import pkg from '../../../../package.json';
import { query } from '@/lib/db';
import { hub } from '@/lib/ws-hub';

const startedAt = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);

  try {
    await query('SELECT 1');
    return NextResponse.json({
      status: 'ok',
      version: pkg.version,
      uptime_seconds: uptimeSeconds,
      db: 'ok',
      agents_connected: hub().onlineAgentCount(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        version: pkg.version,
        uptime_seconds: uptimeSeconds,
        db: 'error',
        agents_connected: hub().onlineAgentCount(),
      },
      { status: 503 },
    );
  }
}
