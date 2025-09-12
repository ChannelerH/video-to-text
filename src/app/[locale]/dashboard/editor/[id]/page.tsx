import { getTranslations } from "next-intl/server";
import { getUserUuid } from "@/services/user";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { transcriptions, transcription_results, transcription_edits } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import EditorWrapper from '@/components/editor-view/editor-wrapper';
import { AIChapterService } from '@/lib/ai-chapters';
import { BasicSegmentationService } from '@/lib/basic-segmentation';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function EditorPage({ 
  params 
}: PageProps) {
  console.time('[EditorPage] Total Load Time');
  console.time('[EditorPage] Initial Setup');
  
  // Parallelize initial setup
  const [{ locale, id }, t, userUuid] = await Promise.all([
    params,
    getTranslations(),
    getUserUuid()
  ]);
  
  console.timeEnd('[EditorPage] Initial Setup');
  
  if (!userUuid) {
    return null; // Layout will handle redirect
  }

  // Run all database queries in parallel for better performance
  console.time('[EditorPage] All Database Queries (Parallel)');
  
  const [transcriptionResult, resultsData, editsData] = await Promise.all([
    // Query 1: Fetch transcription (only necessary fields)
    db()
      .select({
        job_id: transcriptions.job_id,
        title: transcriptions.title,
        source_url: transcriptions.source_url,
        duration_sec: transcriptions.duration_sec,
        language: transcriptions.language
      })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.job_id, id),
          eq(transcriptions.user_uuid, userUuid)
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
  
  console.timeEnd('[EditorPage] All Database Queries (Parallel)');
  
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
  console.time('[EditorPage] Data Processing');
  
  const jsonResult = resultsData[0];  // Now we only get JSON format
  if (jsonResult && jsonResult.content) {
    console.log('[EditorPage] JSON content size:', jsonResult.content.length, 'bytes');
    
    // Parse both JSON results in parallel if both exist
    const parsePromises = [JSON.parse(jsonResult.content)];
    if (editsData[0]) {
      parsePromises.push(JSON.parse(editsData[0].content));
    }
    
    try {
      const [parsedTranscription, editedData] = await Promise.all(parsePromises);
      transcriptionData = parsedTranscription;
      segments = transcriptionData.segments || [];
      console.log('[EditorPage] Segments count:', segments.length);
      
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
        console.log('[EditorPage] Skipping server-side AI generation, will generate on client');
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
  console.timeEnd('[EditorPage] Data Processing');

  // Get audio URL from source or storage
  audioUrl = transcription.source_url || null;

  console.timeEnd('[EditorPage] Total Load Time');
  
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

      {/* Editor - Full height */}
      <div className="flex-1 overflow-hidden">
        <EditorWrapper
          audioUrl={audioUrl}
          segments={segments}
          chapters={chapters}
          speakers={speakers}
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
