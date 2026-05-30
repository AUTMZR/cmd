import { NextResponse } from 'next/server';
import { getActivePromos } from '@/lib/promo';

export async function GET() {
  return NextResponse.json({ promos: getActivePromos() });
}
