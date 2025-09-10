import { NextRequest, NextResponse } from 'next/server';
import { getUserTier, hasFeature, UserTier } from '@/services/user-tier';
import { BasicSegmentationService } from '@/lib/basic-segmentation';
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
    
    // Check if user has access to segmentation features
    if (!hasFeature(userTier, 'basicSegmentation')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'This feature requires Basic subscription or higher',
          requiredTier: UserTier.BASIC
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

    let chapters;
    
    // Check if user has access to AI chapters
    if (hasFeature(userTier, 'aiChapters')) {
      // Pro/Premium users get AI-enhanced chapters
      chapters = await AIChapterService.generateAIChapters(segments, {
        language: options?.language,
        generateSummary: options?.generateSummary
      });
    } else {
      // Basic users get algorithmic chapters
      chapters = BasicSegmentationService.generateBasicChapters(segments);
    }

    return NextResponse.json({
      success: true,
      data: {
        chapters,
        tier: userTier,
        isAIGenerated: hasFeature(userTier, 'aiChapters')
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
    // Get user UUID
    const userUuid = await getUserUuid();
    
    // Get user tier
    const userTier = userUuid ? await getUserTier(userUuid) : UserTier.FREE;
    
    // Check if user has access to segmentation features
    if (!hasFeature(userTier, 'basicSegmentation')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'This feature requires Basic subscription or higher',
          requiredTier: UserTier.BASIC
        },
        { status: 403 }
      );
    }

    // TODO: Fetch saved chapters from database
    // For now, return empty array
    return NextResponse.json({
      success: true,
      data: {
        chapters: [],
        tier: userTier
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