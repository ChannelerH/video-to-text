import { NextRequest, NextResponse } from 'next/server';
import { getUserTier, hasFeature, UserTier } from '@/services/user-tier';
import { AIChapterService } from '@/lib/ai-chapters';
import { getUserUuid } from '@/services/user';
import { POLICY, trimSegmentsToSeconds } from '@/services/policy';
import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { and, eq, gte, count } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    await params;
    // Get user UUID
    const userUuid = await getUserUuid();
    
    // Get user tier (require login)
    if (!userUuid) {
      return NextResponse.json({ success: false, error: 'authentication required', authRequired: true }, { status: 401 });
    }
    const userTier = await getUserTier(userUuid);

    const { segments, options } = await request.json();
    
    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { success: false, error: 'Invalid segments data' },
        { status: 400 }
      );
    }

    // Process segments for FREE users (might already be trimmed by frontend)
    let workingSegments = segments;
    
    // For FREE users, ensure content doesn't exceed 5 minutes
    // Note: Frontend might have already trimmed it, but we trim again to be safe
    if (userTier === UserTier.FREE) {
      const maxSeconds = POLICY.preview.freePreviewSeconds || 300;
      workingSegments = trimSegmentsToSeconds(segments, maxSeconds);
    }
    
    // Check limits and record usage based on mode
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    if (userTier === UserTier.FREE) {
      // FREE users always use the same type (content is always <=5 min after trimming)
      const recordType = 'ai_summary';  // Single type for FREE users
      
      // Check monthly limit
      const [row] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, recordType)));
      const used = Number(row?.count || 0);
      const limit = POLICY.preview.freeMonthlyAiSummary;
      
      if (used >= limit) {
        return NextResponse.json({ 
          success: false, 
          error: `Monthly AI summary limit reached (${used}/${limit})`, 
          requiredTier: UserTier.BASIC, 
          limit, 
          used 
        }, { status: 403 });
      }
      
      // Record usage
      await db().insert(usage_records).values({ 
        user_id: userUuid, 
        date: new Date().toISOString().slice(0,10), 
        minutes: '0', 
        model_type: recordType, 
        created_at: new Date() 
      }).catch(() => {});
      
    } else if (userTier === UserTier.BASIC) {
      // BASIC users: check feature and daily limit
      if (!hasFeature(userTier, 'aiSummary')) {
        return NextResponse.json({ 
          success: false, 
          error: 'AI summary not available for your plan', 
          requiredTier: UserTier.PRO 
        }, { status: 403 });
      }
      
      // Check daily limit
      const [day] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, dayStart), eq(usage_records.model_type, 'ai_summary')));
      const usedToday = Number(day?.count || 0);
      const dailyLimit = 10;
      
      if (usedToday >= dailyLimit) {
        return NextResponse.json({ 
          success: false, 
          error: 'Daily AI summary limit reached', 
          requiredTier: UserTier.PRO, 
          limit: dailyLimit, 
          used: usedToday, 
          isDaily: true 
        }, { status: 403 });
      }
      
      // Record usage
      await db().insert(usage_records).values({ 
        user_id: userUuid || '', 
        date: new Date().toISOString().slice(0,10), 
        minutes: '0', 
        model_type: 'ai_summary', 
        created_at: new Date() 
      }).catch(() => {});
      
    } else if (!hasFeature(userTier, 'aiSummary')) {
      // PRO/PREMIUM: just check feature
      return NextResponse.json({ 
        success: false, 
        error: 'AI summary not available for your plan' 
      }, { status: 403 });
    }
    // PRO/PREMIUM with feature: no limits, no recording

    // Generate AI summary
    const summary = await AIChapterService.generateSummary(workingSegments, {
      language: options?.language,
      maxLength: options?.maxLength || 200
    });

    if (!summary) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate summary' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        summary,
        tier: userTier,
        language: options?.language || 'auto'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate summary' 
      },
      { status: 500 }
    );
  }
}
