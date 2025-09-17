import { NextRequest, NextResponse } from 'next/server';
import { YouTubeService } from '@/lib/youtube';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    
    // 验证并解析 YouTube URL
    const videoId = YouTubeService.validateAndParseUrl(url);
    
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }
    
    console.log('[Track Detection] Detecting audio tracks for video:', videoId);
    
    // 检测音轨
    const tracks = await YouTubeService.detectAudioTracks(videoId);
    
    // 获取视频信息（标题等）
    let videoTitle = '';
    try {
      const videoInfo = await YouTubeService.getVideoInfo(videoId);
      videoTitle = videoInfo.title;
    } catch (error) {
      console.warn('[Track Detection] Failed to get video title:', error);
    }
    
    console.log(`[Track Detection] Found ${tracks.length} audio tracks`);
    
    return NextResponse.json({
      success: true,
      tracks,
      videoTitle,
      hasMultipleTracks: tracks.length > 1
    });
    
  } catch (error) {
    console.error('[Track Detection] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to detect audio tracks' },
      { status: 500 }
    );
  }
}