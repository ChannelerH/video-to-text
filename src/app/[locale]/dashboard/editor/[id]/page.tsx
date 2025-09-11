import { getTranslations } from "next-intl/server";
import { getUserUuid } from "@/services/user";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transcriptions, transcription_results, transcription_edits } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import EditorWrapper from '@/components/editor-view/editor-wrapper';
import { BasicSegmentationService } from '@/lib/basic-segmentation';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditorPage({ 
  params 
}: PageProps) {
  const { locale, id } = await params;
  const t = await getTranslations();
  const userUuid = await getUserUuid();
  
  if (!userUuid) {
    return null; // Layout will handle redirect
  }

  // Fetch transcription data
  const [transcription] = await db()
    .select()
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.job_id, id),
        eq(transcriptions.user_uuid, userUuid)
      )
    )
    .limit(1);

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

  // Fetch transcription results
  const results = await db()
    .select()
    .from(transcription_results)
    .where(eq(transcription_results.job_id, id));

  // Parse the transcription data
  let transcriptionData: any = {};
  let segments: any[] = [];
  let chapters: any[] = [];
  let audioUrl: string | null = null;

  // Find and parse the JSON result
  const jsonResult = results.find(r => r.format === 'json');
  if (jsonResult && jsonResult.content) {
    try {
      transcriptionData = JSON.parse(jsonResult.content);
      segments = transcriptionData.segments || [];
      
      // Prefer edited data if user has saved any
      const edits = await db()
        .select({ content: transcription_edits.content })
        .from(transcription_edits)
        .where(and(eq(transcription_edits.job_id, id), eq(transcription_edits.user_uuid, userUuid)))
        .limit(1);

      if (edits[0]) {
        try { 
          const editedData = JSON.parse(edits[0].content);
          // Use edited segments if available
          if (editedData.segments) {
            segments = editedData.segments;
          }
          // Use edited chapters if available
          chapters = editedData.chapters || [];
        } catch {}
      } else if (transcriptionData.chapters) {
        chapters = transcriptionData.chapters;
      } else {
        // Try a basic segmentation as a good default
        try {
          chapters = BasicSegmentationService.generateBasicChapters(segments);
        } catch {
          chapters = [{
            id: 'full',
            title: transcription.title || 'Full Transcription',
            startTime: 0,
            endTime: transcription.duration_sec || 60,
            segments: segments
          }];
        }
      }
    } catch (error) {
      console.error('Failed to parse transcription JSON:', error);
    }
  }

  // Get audio URL from source or storage
  audioUrl = transcription.source_url || null;
  
  // Debug: Log what we have
  console.log('[Page Debug] Transcription data:', {
    job_id: transcription.job_id,
    source_type: transcription.source_type,
    source_url: transcription.source_url,
    source_hash: transcription.source_hash,
    final_audioUrl: audioUrl
  });
  
  // If no audio URL, show warning
  if (!audioUrl) {
    console.warn('[Page Debug] No audio URL available for transcription:', transcription.job_id);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/dashboard/transcriptions`}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {transcription.title || t('untitled_transcription')}
            </h1>
            <p className="text-sm text-gray-400">
              {transcription.created_at ? new Date(transcription.created_at).toLocaleDateString() : ''} • {formatDuration(transcription.duration_sec || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl border border-purple-500/20 overflow-hidden">
        <EditorWrapper
          audioUrl={audioUrl}
          segments={segments}
          chapters={chapters}
          transcription={transcriptionData}
          backHref={`/${locale}/dashboard/transcriptions`}
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
