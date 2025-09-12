import { NextRequest, NextResponse } from 'next/server';
import { AIChapterService } from '@/lib/ai-chapters';

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

    // Always use AI-enhanced chapters for all users
    const chapters = await AIChapterService.generateAIChapters(segments, {
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