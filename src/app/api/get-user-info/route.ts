import { NextRequest, NextResponse } from 'next/server';
import { getUserInfoWithTier } from '@/services/user';
import { auth } from '@/auth';

// simple 60s in-memory cache keyed by user_uuid
const cache = new Map<string, { ts: number; data: any }>();

export async function POST(_req: NextRequest) {
  try {
    const data = await getUserInfoWithTier();
    // derive key
    const key = data?.user?.uuid || 'anon';
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && (now - cached.ts) < 60_000) {
      return NextResponse.json({ code: 0, message: 'ok', data: cached.data });
    }
    cache.set(key, { ts: now, data });
    return NextResponse.json({ code: 0, message: 'ok', data });
  } catch (e: any) {
    // Fallback to NextAuth session to keep UI stable (avatar, nickname)
    try {
      const session = await auth();
      if (session && (session as any).user) {
        return NextResponse.json({ code: 0, message: 'ok', data: { user: (session as any).user, userTier: 'free' } });
      }
    } catch {}
    return NextResponse.json({ code: 1, message: e?.message || 'failed' }, { status: 500 });
  }
}
