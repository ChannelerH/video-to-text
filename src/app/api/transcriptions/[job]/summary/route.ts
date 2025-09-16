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
  { params }: { params: { job: string } }
) {
  try {
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

    // FREE: preview-only for first 5 minutes, with monthly limit
    let workingSegments = segments;
    if (userTier === UserTier.FREE) {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [row] = await db().select({ count: count() }).from(usage_records)
        .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'preview_ai_summary')));
      const used = Number(row?.count || 0);
      const limit = POLICY.preview.freeMonthlyAiSummary;
      if (used >= limit) {
        return NextResponse.json({ success: false, error: 'AI 总结（预览）本月次数已用尽（按功能分别计数）', requiredTier: UserTier.BASIC, limit, used }, { status: 403 });
      }
      workingSegments = trimSegmentsToSeconds(segments, POLICY.preview.freePreviewSeconds);
      await db().insert(usage_records).values({ user_id: userUuid, date: new Date().toISOString().slice(0,10), minutes: '0', model_type: 'preview_ai_summary', created_at: new Date() }).catch(() => {});
    } else {
      // BASIC/PRO must have feature
      if (!hasFeature(userTier, 'aiSummary')) {
        return NextResponse.json({ success: false, error: 'AI summary not available for your plan', requiredTier: UserTier.BASIC }, { status: 403 });
      }
      // FREE: monthly limit (from policy)
      if (userTier === UserTier.FREE) {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const [month] = await db().select({ count: count() }).from(usage_records)
          .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, monthStart), eq(usage_records.model_type, 'ai_summary')));
        const usedThisMonth = Number(month?.count || 0);
        const monthlyLimit = POLICY.preview.freeMonthlyAiSummary;
        if (usedThisMonth >= monthlyLimit) {
          return NextResponse.json({ success: false, error: 'Monthly AI summary limit reached', requiredTier: UserTier.BASIC, limit: monthlyLimit, used: usedThisMonth }, { status: 403 });
        }
        await db().insert(usage_records).values({ user_id: userUuid || '', date: new Date().toISOString().slice(0,10), minutes: '0', model_type: 'ai_summary', created_at: new Date() }).catch(() => {});
      }
      
      // BASIC: daily limit (e.g., <= 10 per day)
      if (userTier === UserTier.BASIC) {
        const now = new Date();
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const [day] = await db().select({ count: count() }).from(usage_records)
          .where(and(eq(usage_records.user_id, userUuid || ''), gte(usage_records.created_at, dayStart), eq(usage_records.model_type, 'ai_summary')));
        const usedToday = Number(day?.count || 0);
        const dailyLimit = 10;
        if (usedToday >= dailyLimit) {
          return NextResponse.json({ success: false, error: 'Daily AI summary limit reached', requiredTier: UserTier.PRO, limit: dailyLimit, used: usedToday, isDaily: true }, { status: 403 });
        }
        await db().insert(usage_records).values({ user_id: userUuid || '', date: new Date().toISOString().slice(0,10), minutes: '0', model_type: 'ai_summary', created_at: new Date() }).catch(() => {});
      }
    }

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
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate summary' 
      },
      { status: 500 }
    );
  }
}
