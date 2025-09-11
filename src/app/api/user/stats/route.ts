import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get total transcriptions count
    const totalCount = await db()
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(transcriptions)
      .where(eq(transcriptions.user_uuid, userUuid));

    // Get total minutes transcribed
    const totalMinutes = await db()
      .select({
        minutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)`
      })
      .from(transcriptions)
      .where(eq(transcriptions.user_uuid, userUuid));

    // Get this month's count
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const thisMonthCount = await db()
      .select({
        count: sql<number>`COUNT(*)`
      })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.user_uuid, userUuid),
          gte(transcriptions.created_at, firstDayOfMonth)
        )
      );

    return NextResponse.json({
      totalTranscriptions: Number(totalCount[0]?.count || 0),
      totalMinutes: Number(totalMinutes[0]?.minutes || 0),
      thisMonth: Number(thisMonthCount[0]?.count || 0)
    });
  } catch (error) {
    console.error('Failed to fetch user stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}