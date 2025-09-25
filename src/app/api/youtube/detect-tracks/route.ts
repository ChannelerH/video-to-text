import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
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
    
    const tracks = [{
      languageCode: 'default',
      trackType: 'original' as const,
      displayName: 'Default (Original)',
      formats: 1,
    }];

    let videoTitle = '';
    let downloadLink: string | null = null;
    let durationSec: number | null = null;

    // Try to reuse existing transcription (no RapidAPI call needed)
    const suffixes = [':ha0', ':ha1'];
    for (const suffix of suffixes) {
      const [existing] = await db()
        .select({
          processedUrl: transcriptions.processed_url,
          title: transcriptions.title,
          duration: transcriptions.original_duration_sec,
          createdAt: transcriptions.created_at,
        })
        .from(transcriptions)
        .where(
          eq(transcriptions.source_hash, `${videoId}${suffix}`)
        )
        .orderBy(desc(transcriptions.created_at), desc(transcriptions.id))
        .limit(1);

      if (existing && existing.processedUrl) {
        downloadLink = existing.processedUrl;
        videoTitle = existing.title || '';
        durationSec = existing.duration || null;
        break;
      }
    }

    if (!videoTitle) {
      // Fallback to lightweight oEmbed request for title (no RapidAPI usage)
      try {
        const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
        const oembedResp = await fetch(oembedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (oembedResp.ok) {
          const data = await oembedResp.json();
          if (typeof data.title === 'string') {
            videoTitle = data.title;
          }
        }
      } catch (error) {
        console.warn('[Track Detection] oEmbed fetch failed:', error);
      }
    }

    return NextResponse.json({
      success: true,
      tracks,
      videoTitle,
      hasMultipleTracks: false,
      download: downloadLink ? {
        videoId,
        link: downloadLink,
        title: videoTitle,
        duration: durationSec ?? undefined,
      } : undefined,
    });
    
  } catch (error) {
    console.error('[Track Detection] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to detect audio tracks' },
      { status: 500 }
    );
  }
}
