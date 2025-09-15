import { NextRequest, NextResponse } from 'next/server';
import { AIChapterService } from '@/lib/ai-chapters';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier, hasFeature } from '@/services/user-tier';
import { POLICY, trimSegmentsToSeconds, getMonthlyUsage, incMonthlyUsage } from '@/services/policy';
import { db } from '@/db';
import { usage_records } from '@/db/schema';
import { and, eq, gte, count } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: { job: string } }
) {
  try {
    const { segments, options } = await request.json();
    
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

    // FREE preview gating: enforce monthly limit and trim to first 5 minutes
    let workingSegments = segments;
    if (tier === UserTier.FREE) {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [row] = await db().select({
        count: count()
      }).from(usage_records).where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'preview_ai_chapters')));
      const used = Number(row?.count || 0);
      const limit = POLICY.preview.freeMonthlyAiChapters;
      if (used >= limit) {
        return NextResponse.json({ success: false, error: 'AI 章节（预览）本月次数已用尽（按功能分别计数）', requiredTier: UserTier.BASIC, limit, used }, { status: 403 });
      }
      workingSegments = trimSegmentsToSeconds(segments, POLICY.preview.freePreviewSeconds);
      await db().insert(usage_records).values({ user_id: userUuid, date: new Date().toISOString().slice(0,10), minutes: '0', model_type: 'preview_ai_chapters', created_at: new Date() }).catch(() => {});
    }

    // BASIC/PRO: ensure feature is enabled (BASIC and above)
    if (tier !== UserTier.FREE && !hasFeature(tier, 'aiChapters')) {
      return NextResponse.json({ success: false, error: 'AI chapters not available for your plan', requiredTier: UserTier.BASIC }, { status: 403 });
    }

    // BASIC: daily limit (e.g., <= 10 per day)
    if (tier === UserTier.BASIC) {
      const now = new Date();
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const [day] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, dayStart), eq(usage_records.model_type, 'ai_chapters')));
      const usedToday = Number(day?.count || 0);
      const dailyLimit = 10;
      if (usedToday >= dailyLimit) {
        return NextResponse.json({ success: false, error: 'AI 章节今日次数已达上限（10 次/天，按功能分别计数）', requiredTier: UserTier.PRO, limit: dailyLimit, used: usedToday }, { status: 403 });
      }
      await db().insert(usage_records).values({ user_id: userUuid || '', date: new Date().toISOString().slice(0,10), minutes: '0', model_type: 'ai_chapters', created_at: new Date() }).catch(() => {});
    }

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
  { params }: { params: { job: string } }
) {
  try {
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
