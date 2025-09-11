import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users, transcriptions } from '@/db/schema';
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

    // Get user data
    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Calculate monthly usage
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await db()
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)`
      })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.user_uuid, userUuid),
          gte(transcriptions.created_at, firstDayOfMonth)
        )
      );

    const minutesUsed = Number(monthlyUsage[0]?.totalMinutes || 0);
    
    // Determine tier limits
    const tierLimits: Record<string, number> = {
      free: 10,
      basic: 100,
      pro: 1000,
      premium: -1 // Unlimited
    };

    const userTier = (user as any).tier || 'free';
    const minutesLimit = tierLimits[userTier] || 10;

    return NextResponse.json({
      minutesUsed,
      minutesLimit,
      tier: userTier,
      isUnlimited: minutesLimit === -1,
      percentageUsed: minutesLimit > 0 ? (minutesUsed / minutesLimit) * 100 : 0
    });
  } catch (error) {
    console.error('Failed to fetch usage data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update usage after transcription
export async function POST(req: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { minutes } = await req.json();
    
    if (!minutes || minutes <= 0) {
      return NextResponse.json(
        { error: 'Invalid minutes value' },
        { status: 400 }
      );
    }

    // Check if user has enough minutes
    const usageResponse = await GET(req);
    const usageData = await usageResponse.json();
    
    if (!usageData.isUnlimited && usageData.minutesUsed + minutes > usageData.minutesLimit) {
      return NextResponse.json(
        { 
          error: 'Usage limit exceeded',
          minutesUsed: usageData.minutesUsed,
          minutesLimit: usageData.minutesLimit,
          required: minutes
        },
        { status: 403 }
      );
    }

    // Usage will be tracked when transcription is created
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update usage:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}