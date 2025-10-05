import { NextRequest, NextResponse } from 'next/server';
import { AIChapterService } from '@/lib/ai-chapters';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier, hasFeature } from '@/services/user-tier';
import { POLICY, trimSegmentsToSeconds, getMonthlyUsage, incMonthlyUsage } from '@/services/policy';
import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { and, eq, gte, count } from 'drizzle-orm';
import { readJson } from '@/lib/read-json';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    await params;
    const { segments, options } = await readJson<{ segments?: any[]; options?: any }>(request);
    
    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { success: false, error: 'Invalid segments data' },
        { status: 400 }
      );
    }

    // Determine user tier
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ success: false, error: 'authentication required', authRequired: true }, { status: 401 });
    }
    const tier = await getUserTier(userUuid);

    // Process segments for FREE users (might already be trimmed by frontend)
    let workingSegments = segments;
    
    // For FREE users, ensure content doesn't exceed 5 minutes
    // Note: Frontend might have already trimmed it, but we trim again to be safe
    if (tier === UserTier.FREE) {
      const maxSeconds = POLICY.preview.freePreviewSeconds || 300;
      workingSegments = trimSegmentsToSeconds(segments, maxSeconds);
    }
    
    // Check limits and record usage based on mode
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    if (tier === UserTier.FREE) {
      // FREE users always use the same type (content is always <=5 min after trimming)
      const recordType = 'ai_chapters';  // Single type for FREE users
      
      // Check monthly limit
      const [row] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, recordType)));
      const used = Number(row?.count || 0);
      const limit = POLICY.preview.freeMonthlyAiChapters;
      
      if (used >= limit) {
        return NextResponse.json({ 
          success: false, 
          error: `Monthly AI chapters limit reached (${used}/${limit})`, 
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
      
    } else if (tier === UserTier.BASIC) {
      // BASIC users: check feature and daily limit
      if (!hasFeature(tier, 'aiChapters')) {
        return NextResponse.json({ 
          success: false, 
          error: 'AI chapters not available for your plan', 
          requiredTier: UserTier.PRO 
        }, { status: 403 });
      }
      
      // Check daily limit
      const [day] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, dayStart), eq(usage_records.model_type, 'ai_chapters')));
      const usedToday = Number(day?.count || 0);
      const dailyLimit = 10;
      
      if (usedToday >= dailyLimit) {
        return NextResponse.json({ 
          success: false, 
          error: 'Daily AI chapters limit reached', 
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
        model_type: 'ai_chapters', 
        created_at: new Date() 
      }).catch(() => {});
      
    } else if (!hasFeature(tier, 'aiChapters')) {
      // PRO/PREMIUM: just check feature
      return NextResponse.json({ 
        success: false, 
        error: 'AI chapters not available for your plan' 
      }, { status: 403 });
    }
    // PRO/PREMIUM with feature: no limits, no recording

    const chapters = await AIChapterService.generateAIChapters(workingSegments, {
      language: options?.language,
      generateSummary: options?.generateSummary
    });

    return NextResponse.json({
      success: true,
      data: {
        chapters,
        isAIGenerated: true
      }
    });
  } catch (error) {
    console.error('Error generating chapters:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate chapters' 
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    await params;
    // TODO: Fetch saved chapters from database
    // For now, return empty array
    return NextResponse.json({
      success: true,
      data: {
        chapters: []
      }
    });
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch chapters' 
      },
      { status: 500 }
    );
  }
}
