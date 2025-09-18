import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { getUserTier } from '@/services/user-tier';
import { getUserUsageSummary } from '@/services/user-minutes';

export async function GET(req: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user tier and usage summary
    const [userTier, usageSummary] = await Promise.all([
      getUserTier(userUuid),
      getUserUsageSummary(userUuid)
    ]);

    return NextResponse.json({
      minutesUsed: usageSummary.totalUsed,
      minutesLimit: usageSummary.subscriptionTotal === 0 ? 30 : usageSummary.subscriptionTotal,
      packBalance: usageSummary.packMinutes,
      totalAllowance: usageSummary.isUnlimited ? 'unlimited' : usageSummary.totalAvailable,
      tier: userTier,
      isUnlimited: usageSummary.isUnlimited,
      percentageUsed: usageSummary.percentageUsed
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
