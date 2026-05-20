import { NextResponse } from 'next/server';
import pkg from '../../../../package.json';
import { query } from '@/lib/db';
import { hub } from '@/lib/ws-hub';

export async function GET() {
  // process.uptime() reflects the Node.js process lifetime, unlike a
  // module-level `startedAt` which only counts from first lazy module load.
  const uptimeSeconds = Math.floor(process.uptime());

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
