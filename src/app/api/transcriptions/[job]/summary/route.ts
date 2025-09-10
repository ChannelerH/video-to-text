import { NextRequest, NextResponse } from 'next/server';
import { getUserTier, hasFeature, UserTier } from '@/services/user-tier';
import { AIChapterService } from '@/lib/ai-chapters';
import { getUserUuid } from '@/services/user';

export async function POST(
  request: NextRequest,
  { params }: { params: { job: string } }
) {
  try {
    // Get user UUID
    const userUuid = await getUserUuid();
    
    // Get user tier
    const userTier = userUuid ? await getUserTier(userUuid) : UserTier.FREE;
    
    // Check if user has access to AI summary
    if (!hasFeature(userTier, 'aiSummary')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'AI summary generation requires Pro subscription or higher',
          requiredTier: UserTier.PRO
        },
        { status: 403 }
      );
    }

    const { segments, options } = await request.json();
    
    if (!segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { success: false, error: 'Invalid segments data' },
        { status: 400 }
      );
    }

    // Generate AI summary
    const summary = await AIChapterService.generateSummary(segments, {
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