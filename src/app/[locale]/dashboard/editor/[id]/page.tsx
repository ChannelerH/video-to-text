import { getTranslations } from "next-intl/server";
import { getUserUuid } from "@/services/user";
import { getUserTier, UserTier, hasFeature } from "@/services/user-tier";
import { POLICY, trimSegmentsToSeconds } from "@/services/policy";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transcriptions, transcription_results, transcription_edits } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import EditorWrapper from '@/components/editor-view/editor-wrapper';
import { UnifiedTranscriptionService } from '@/lib/unified-transcription';
import { AIChapterService } from '@/lib/ai-chapters';
import { BasicSegmentationService } from '@/lib/basic-segmentation';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditorPage({ 
  params 
}: PageProps) {
  // Start page load (timers removed to reduce noisy logs)
  
  // Parallelize initial setup
  const [{ locale, id }, t, userUuid] = await Promise.all([
    params,
    getTranslations(),
    getUserUuid()
  ]);
  
  // Initial setup complete
  
  if (!userUuid) {
    return null; // Layout will handle redirect
  }

  // Get user tier and calculate retention cutoff
  const userTier = await getUserTier(userUuid as string);
  const retentionDays = userTier === UserTier.PRO ? 365 : 
                       userTier === UserTier.BASIC ? 90 : 7;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  // Run all database queries in parallel for better performance
  // Run DB queries in parallel
  
  const [transcriptionResult, resultsData, editsData] = await Promise.all([
    // Query 1: Fetch transcription (only necessary fields)
    db()
      .select({
        job_id: transcriptions.job_id,
        title: transcriptions.title,
        source_url: transcriptions.source_url,
        duration_sec: transcriptions.duration_sec,
        original_duration_sec: (transcriptions as any).original_duration_sec,
        language: transcriptions.language
      })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.job_id, id),
          eq(transcriptions.user_uuid, userUuid),
          gte(transcriptions.created_at, cutoffDate)  // Check retention period
        )
      )
      .limit(1),
    
    // Query 2: Fetch only JSON result (not all formats)
    db()
      .select()
      .from(transcription_results)
      .where(
        and(
          eq(transcription_results.job_id, id),
          eq(transcription_results.format, 'json')  // Only get JSON, skip other formats
        )
      )
      .limit(1),
    
    // Query 3: Fetch edited data
    db()
      .select({ content: transcription_edits.content })
      .from(transcription_edits)
      .where(and(eq(transcription_edits.job_id, id), eq(transcription_edits.user_uuid, userUuid)))
      .limit(1)
  ]);
  
  // DB queries complete
  
  const transcription = transcriptionResult[0];

  if (!transcription) {
    return (
      <div className="text-center py-16">
        <h2 className="text-2xl font-bold text-white mb-4">
          {t('errors.transcription_not_found')}
        </h2>
        <p className="text-gray-400 mb-6">
          {t('errors.transcription_not_found_desc')}
        </p>
        <Link
          href={`/${locale}/dashboard/transcriptions`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('back_to_transcriptions')}
        </Link>
      </div>
    );
  }

  // Parse the transcription data
  let transcriptionData: any = {};
  let segments: any[] = [];
  let chapters: any[] = [];
  let speakers: any[] = [];
  let audioUrl: string | null = null;

  // Parse JSON result and edited data
  // Parse transcription data
  
  const jsonResult = resultsData[0];  // Now we only get JSON format
  if (jsonResult && jsonResult.content) {
    // Using JSON result content
    
    // Parse both JSON results in parallel if both exist
    const parsePromises = [JSON.parse(jsonResult.content)];
    if (editsData[0]) {
      parsePromises.push(JSON.parse(editsData[0].content));
    }
    
    try {
      const [parsedTranscription, editedData] = await Promise.all(parsePromises);
      // 兼容两种存储形态：
      // A) 仅存 segments 数组（多数供应商回调路径）
      // B) 存完整对象 { text, segments, language, duration }
      if (Array.isArray(parsedTranscription)) {
        segments = parsedTranscription as any[];
        transcriptionData = {
          language: (transcription as any).language || 'auto',
          duration: (transcription as any).duration_sec || 0,
          text: ''
        };
      } else {
        transcriptionData = parsedTranscription || {};
        segments = transcriptionData.segments || [];
        // 补全缺失的基础字段，避免下游 UI 为空
        if (!('duration' in transcriptionData)) {
          transcriptionData.duration = (transcription as any).duration_sec || 0;
        }
        if (!('language' in transcriptionData)) {
          transcriptionData.language = (transcription as any).language || 'auto';
        }
      }
      // Segments parsed
      
      // Use edited data if available
      if (editedData) {
          // Use edited segments if available
          if (editedData.segments) {
            segments = editedData.segments;
          }
          // Use edited chapters if available
          chapters = editedData.chapters || [];
          // Use edited speakers if available
          if (editedData.speakers) {
            speakers = editedData.speakers;
          }
      } else if (transcriptionData.chapters) {
        chapters = transcriptionData.chapters;
      } else {
        // Don't generate AI chapters on server - let client handle it asynchronously
        chapters = [{
          id: 'full',
          title: transcription.title || 'Full Transcription',
          startTime: 0,
          endTime: transcription.duration_sec || 60,
          segments: segments,
          _needsAIGeneration: true // Flag for client to auto-generate
        }];
      }
    } catch (error) {
      console.error('Failed to parse transcription JSON:', error);
    }
  }
  // Data processing complete

  // 先提取音频 URL，供后续话者叠加使用
  audioUrl = transcription.source_url || null;

  const previewWindow = POLICY.preview.freePreviewSeconds || 300;
  const computeMaxEnd = (segs: any[]): number => {
    if (!Array.isArray(segs) || segs.length === 0) return 0;
    return segs.reduce((max, seg) => {
      const end = Number(seg?.end) || 0;
      return end > max ? end : max;
    }, 0);
  };

  const originalDurationSec = Number((transcription as any).original_duration_sec) || Number(transcription.duration_sec) || 0;
  const rawSegmentMax = computeMaxEnd(segments);

  // FREE 用户且任务本身就是“预览”时才截断 5 分钟
  if (userTier === UserTier.FREE && Array.isArray(segments) && segments.length > 0) {
    const totalCandidateDuration = Math.max(originalDurationSec, rawSegmentMax);
    const looksLikePreviewJob = totalCandidateDuration > (previewWindow + 1) && rawSegmentMax <= (previewWindow + 1);
    if (looksLikePreviewJob) {
      segments = trimSegmentsToSeconds(segments as any, previewWindow) as any[];
    }
  }

  const visibleSegmentMax = computeMaxEnd(segments);

  // Page load complete
  
  // Derive preview mode flag
  // 规则：Free 用户且时长接近预览窗口（299-300秒都算，考虑浮点数舍入）
  const candidateDurations = [
    Number(transcription.duration_sec) || 0,
    originalDurationSec,
    Number((transcriptionData as any)?.duration) || 0,
    rawSegmentMax || 0
  ];
  const totalDuration = Math.max(...candidateDurations);
  // 容差 1 秒，防止浮点近似导致误判
  const isPreview = (userTier === UserTier.FREE) && (visibleSegmentMax + 1 < totalDuration);
  
  // Preview mode derived using tolerant duration check

  return (
    <div className="h-screen flex flex-col">
      {/* Simplified Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-950/80 border-b border-gray-800/50">
        <Link
          href={`/${locale}/dashboard/transcriptions`}
          className="p-1.5 hover:bg-gray-800/50 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 
            className="text-base font-medium text-gray-200 truncate"
            title={transcription.title || t('untitled_transcription')}
          >
            {transcription.title || t('untitled_transcription')}
          </h1>
        </div>
      </div>

      {/* FREE Preview Notice */}
      {/* {isPreview && (
        <div className="px-4 py-2 bg-amber-500/10 text-amber-300 text-sm border-b border-amber-500/20">
          Preview mode: showing the first 5 minutes only. <a href={`/${locale}/pricing`} className="underline hover:text-amber-200">Upgrade</a> to unlock full transcript, speaker labels, and full AI features.
        </div>
      )} */}

      {/* Editor - Full height */}
      <div className="flex-1 overflow-hidden">
        <EditorWrapper
          audioUrl={audioUrl}
          segments={segments}
          chapters={chapters}
          speakers={speakers}
          transcription={transcriptionData}
          backHref={`/${locale}/dashboard/transcriptions`}
          isPreviewMode={isPreview}
          originalDurationSec={Math.max(
            originalDurationSec,
            Number(transcription.duration_sec) || 0,
            rawSegmentMax || 0,
            visibleSegmentMax || 0
          )}
        />
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
