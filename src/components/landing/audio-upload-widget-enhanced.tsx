"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/contexts/app";
import { DocumentExportService } from "@/lib/export-document";
import type { TranscriptionSegment } from "@/lib/replicate";
import {
  FileText,
  FileSpreadsheet,
  FileType,
  FileOutput,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  Link2,
  Clock,
  User
} from "lucide-react";

interface Props {
  locale: string;
}

interface PreviewSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface TranscriptionResult {
  id?: string;
  title: string;
  text: string;
  duration: number;
  segments: PreviewSegment[];
  srt?: string;
  language?: string;
  createdAt: Date;
}

type UploadStage = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

export default function AudioUploadWidgetEnhanced({ locale }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  const t = useTranslations('tool_interface');
  const { userTier } = useAppContext();
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [speakerDiarization, setSpeakerDiarization] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  
  // New states for enhanced features
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  
  // Check if user has high accuracy access
  const normalizedTier = String(userTier || 'free').toLowerCase();
  const canUseHighAccuracy = isAuthenticated && normalizedTier === 'pro';
  const canUseDiarization = isAuthenticated && ['basic', 'pro', 'premium'].includes(normalizedTier);
  const diarizationTierEligible = ['basic', 'pro', 'premium'].includes(normalizedTier);

  useEffect(() => {
    if (!canUseHighAccuracy && highAccuracy) {
      setHighAccuracy(false);
    }
  }, [canUseHighAccuracy, highAccuracy]);

  useEffect(() => {
    if (!canUseDiarization && speakerDiarization) {
      setSpeakerDiarization(false);
    }
  }, [canUseDiarization, speakerDiarization]);

  // Simulate processing progress
  useEffect(() => {
    if (uploadStage === 'processing') {
      const interval = setInterval(() => {
        setProcessingProgress(prev => {
          if (prev >= 95) return prev;
          return prev + Math.random() * 5;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [uploadStage]);

  const resetState = () => {
    setUploadStage('idle');
    setUploadProgress(0);
    setProcessingProgress(0);
    setCurrentFileName('');
    setEstimatedTime(0);
    setOpeningEditor(false);
    setTranscriptionResult(null);
    setCurrentJobId(null);
    setPreviewError(null);
    setCopiedToClipboard(false);
  };

  const triggerBrowse = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handlePasteUrl = () => {
    if (busy) return;
    setShowUrlDialog(true);
  };

  const formatDuration = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatTimestamp = (seconds: number): string => {
    const sign = seconds < 0 ? '-' : '';
    const value = Math.abs(seconds);
    const mins = Math.floor(value / 60);
    const secs = Math.floor(value % 60);
    const millis = Math.round((value - Math.floor(value)) * 1000);
    return `${sign}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const isChineseText = (language?: string, text?: string) => {
    if (language && language.toLowerCase().includes('zh')) return true;
    if (!text) return false;
    return /[\u4e00-\u9fff]/.test(text);
  };

  const enhanceChineseText = (raw: string) => {
    let text = (raw || '').trim();
    if (!text) return '';
    text = text.replace(/[\t\r\f]+/g, ' ').replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ');
    text = text.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1');
    text = text
      .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
    text = text
      .replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，')
      .replace(/([\u4e00-\u9fff])\s*\.\s*/g, '$1。')
      .replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！')
      .replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？')
      .replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：')
      .replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；');
    return text;
  };

  const previewIsChinese = transcriptionResult ? isChineseText(transcriptionResult.language, transcriptionResult.text) : false;

  const handleExport = async (format: 'txt' | 'srt' | 'vtt' | 'docx' | 'pdf') => {
    if (!transcriptionResult) return;

    const filenameBase = (transcriptionResult.title || 'transcription').replace(/\s+/g, '_');
    const segments = transcriptionResult.segments || [];
    const plainText = transcriptionResult.text || segments.map(seg => seg.text).join('\n\n');

    const downloadBlob = (blob: Blob | ArrayBuffer | Buffer, filename: string, mime = 'application/octet-stream') => {
      const fileBlob = blob instanceof Blob ? blob : new Blob([blob as ArrayBuffer], { type: mime });
      const url = URL.createObjectURL(fileBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    try {
      if (format === 'docx' || format === 'pdf') {
        const exportSegments: TranscriptionSegment[] = segments.map((segment, index) => ({
          id: index,
          seek: 0,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          tokens: [],
          temperature: 0,
          avg_logprob: 0,
          compression_ratio: 0,
          no_speech_prob: 0
        }));

        const exportOptions = {
          metadata: {
            title: transcriptionResult.title || 'Transcription Preview',
            date: new Date().toLocaleDateString(),
            language: transcriptionResult.language || 'auto',
            duration: transcriptionResult.duration
          },
          includeTimestamps: true,
          includeChapters: false,
          includeSummary: false
        };

        if (format === 'docx') {
          const blob = await DocumentExportService.exportToWord(
            {
              text: plainText,
              segments: exportSegments,
              language: transcriptionResult.language,
              duration: transcriptionResult.duration
            },
            [],
            '',
            exportOptions
          );
          downloadBlob(blob, `${filenameBase}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } else {
          const blob = await DocumentExportService.exportToPDF(
            {
              text: plainText,
              segments: exportSegments,
              language: transcriptionResult.language,
              duration: transcriptionResult.duration
            },
            [],
            '',
            exportOptions
          );
          downloadBlob(blob, `${filenameBase}.pdf`, 'application/pdf');
        }
      } else {
        let content = '';
        let mime = 'text/plain';
        let extension = format;

        if (format === 'txt') {
          content = plainText;
        } else if (format === 'srt') {
          content = transcriptionResult.srt && transcriptionResult.srt.trim().length > 0
            ? transcriptionResult.srt
            : buildSRTFromSegments(segments);
        } else if (format === 'vtt') {
          content = buildVTTFromSegments(segments);
          mime = 'text/vtt';
        }

        const blob = new Blob([content], { type: mime });
        downloadBlob(blob, `${filenameBase}.${extension}`, mime);
      }

      showToast('success', 'Export Successful', `Downloaded as ${filenameBase}.${format}`);
    } catch (error) {
      console.error('[Export] Failed to generate file:', error);
      showToast('error', 'Export Failed', 'Unable to generate file. Please try again.');
    }
  };

  const handleCopyToClipboard = async () => {
    if (!transcriptionResult) return;

    const text = transcriptionResult.segments.length > 0
      ? transcriptionResult.segments
          .map(seg => {
            const payload = previewIsChinese ? enhanceChineseText(seg.text) : seg.text;
            return `[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}] ${payload}`;
          })
          .join('\n\n')
      : (previewIsChinese ? enhanceChineseText(transcriptionResult.text || '') : transcriptionResult.text || '');

    await navigator.clipboard.writeText(text);
    setCopiedToClipboard(true);
    showToast('success', 'Copied!', 'Transcription copied to clipboard');
    
    setTimeout(() => setCopiedToClipboard(false), 3000);
  };

  const handleOpenInEditor = async () => {
    if (!isAuthenticated) {
      showToast('error', 'Sign in required', 'Please sign in to open the full editor.');
      return;
    }

    if (!currentJobId) {
      showToast('error', 'Job not ready', 'We are still processing the full transcription. Please try again shortly.');
      return;
    }

    setOpeningEditor(true);

    setTimeout(() => {
      router.push(`/${locale}/dashboard/editor/${currentJobId}`);
    }, 400);
  };

  const handleUrlSubmit = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setShowUrlDialog(false);
    
    try {
      setBusy(true);
      setPreviewError(null);
      setTranscriptionResult(null);
      setUploadStage('processing');
      setProcessingProgress(12);

      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(url);
      const urlType: 'youtube_url' | 'audio_url' = isYouTube ? 'youtube_url' : 'audio_url';

      const derivedTitle = url.split('/').pop() || (isYouTube ? 'YouTube Video' : 'Audio URL');
      setCurrentFileName(derivedTitle);

      setEstimatedTime(isYouTube ? 30 : 20);

      let jobId: string | undefined;

      if (isAuthenticated) {
        try {
          const asyncBody = {
            type: urlType,
            content: url,
            action: 'transcribe',
            options: {
              high_accuracy: canUseHighAccuracy && highAccuracy,
              speaker_diarization: canUseDiarization && speakerDiarization
            }
          };

          const resp = await fetch('/api/transcribe/async', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(asyncBody)
          });

          const data = await resp.json();
          if (!resp.ok || !data?.success || !data?.job_id) {
            throw new Error(data?.error || 'Failed to start transcription job');
          }
          jobId = data.job_id;
          setCurrentJobId(jobId);
        } catch (error) {
          console.error('[Async] Failed to enqueue job:', error);
          showToast('error', t('errors.general_error'), error instanceof Error ? error.message : t('errors.general_error'));
        }
      } else {
        setCurrentJobId(null);
      }

      setProcessingProgress(45);

      const previewBody = {
        type: urlType,
        content: url,
        action: 'preview',
        options: {
          highAccuracyMode: canUseHighAccuracy && highAccuracy,
          enableDiarizationAfterWhisper: canUseDiarization && speakerDiarization
        }
      };

      const previewResp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewBody)
      });
      const previewJson = await previewResp.json();

      if (!previewResp.ok || !previewJson?.success || !previewJson?.preview) {
        throw new Error(previewJson?.error || 'Preview generation failed');
      }

      const preview = previewJson.preview as { text?: string; srt?: string; duration?: number; language?: string };
      const segments = preview.srt ? parseSRT(preview.srt) : [];
      const previewText = preview.text && preview.text.trim().length > 0
        ? preview.text
        : (segments.length > 0 ? segments.map(seg => seg.text).join(' ') : 'Preview unavailable.');

      setTranscriptionResult({
        id: jobId,
        title: derivedTitle,
        text: previewText,
        duration: Math.max(preview.duration || 0, segments.length > 0 ? segments[segments.length - 1].end : 0),
        segments,
        srt: preview.srt,
        language: preview.language,
        createdAt: new Date()
      });

      setProcessingProgress(100);
      setUploadStage('completed');
    } catch (e: any) {
      console.error(e);
      setPreviewError(e?.message || 'Preview unavailable');
      setUploadStage('failed');
      showToast('error', t('errors.general_error'), e?.message || t('errors.general_error'));
    } finally {
      setBusy(false);
      setUrlInput('');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCurrentFileName(file.name);
    setEstimatedTime(Math.ceil(file.size / (1024 * 1024)) * 3); // Estimate based on file size
    
    try {
      setBusy(true);
      setPreviewError(null);
      setTranscriptionResult(null);
      setUploadStage('uploading');

      const presignResp = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          mode: 'audio'
        })
      });

      const presign = await presignResp.json();
      if (!presignResp.ok || !presign?.success) {
        throw new Error(presign?.error || 'Failed to get upload URL');
      }

      const { uploadUrl, key, publicUrl, downloadUrl } = presign.data as { uploadUrl: string; key: string; publicUrl: string; downloadUrl?: string };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(progress);
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 204) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        xhr.open('PUT', uploadUrl);
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      setUploadStage('processing');
      setProcessingProgress(35);

      const fileUrl = downloadUrl || publicUrl;

      let jobId: string | undefined;
      if (isAuthenticated) {
        try {
          const body = {
            type: 'file_upload' as const,
            content: fileUrl,
            action: 'transcribe',
            options: {
              r2Key: key,
              originalFileName: file.name,
              high_accuracy: canUseHighAccuracy && highAccuracy,
              speaker_diarization: canUseDiarization && speakerDiarization
            }
          };

          const resp = await fetch('/api/transcribe/async', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await resp.json();
          if (!resp.ok || !data?.success || !data?.job_id) {
            throw new Error(data?.error || 'Failed to start transcription');
          }
          jobId = data.job_id;
          setCurrentJobId(jobId);
        } catch (error) {
          console.error('[Async] Failed to enqueue job:', error);
          showToast('error', t('errors.general_error'), error instanceof Error ? error.message : t('errors.general_error'));
        }
      } else {
        setCurrentJobId(null);
      }

      setProcessingProgress(65);

      const previewBody = {
        type: 'file_upload' as const,
        content: fileUrl,
        action: 'preview',
        options: {
          r2Key: key,
          originalFileName: file.name,
          highAccuracyMode: canUseHighAccuracy && highAccuracy,
          enableDiarizationAfterWhisper: canUseDiarization && speakerDiarization
        }
      };

      const previewResp = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewBody)
      });
      const previewJson = await previewResp.json();

      if (!previewResp.ok || !previewJson?.success || !previewJson?.preview) {
        throw new Error(previewJson?.error || 'Preview generation failed');
      }

      const preview = previewJson.preview as { text?: string; srt?: string; duration?: number; language?: string };
      const segments = preview.srt ? parseSRT(preview.srt) : [];
      const previewText = preview.text && preview.text.trim().length > 0
        ? preview.text
        : (segments.length > 0 ? segments.map(seg => seg.text).join(' ') : 'Preview unavailable.');

      setTranscriptionResult({
        id: jobId,
        title: file.name,
        text: previewText,
        duration: Math.max(preview.duration || 0, segments.length > 0 ? segments[segments.length - 1].end : 0),
        segments,
        srt: preview.srt,
        language: preview.language,
        createdAt: new Date()
      });

      setProcessingProgress(100);
      setUploadStage('completed');
    } catch (e: any) {
      console.error(e);
      setPreviewError(e?.message || 'Preview unavailable');
      setUploadStage('failed');
      showToast('error', t('errors.upload_failed'), e?.message || t('errors.general_error'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-800/60 overflow-hidden">
      <ToastNotification 
        type={toast.type}
        title={toast.title}
        message={toast.message}
        isOpen={toast.isOpen}
        onClose={hideToast}
      />
      
      {/* URL Input Dialog */}
      {showUrlDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowUrlDialog(false)} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <button
              onClick={() => setShowUrlDialog(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <h3 className="text-xl font-semibold mb-2">Paste Audio URL</h3>
            <p className="text-sm text-slate-400 mb-4">
              Enter a direct link to an audio file or YouTube video
            </p>
            
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              placeholder="https://example.com/audio.mp3"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors text-white placeholder-slate-500"
              autoFocus
            />
            
            <div className="mt-2 text-xs text-slate-500">
              Supports: MP3, M4A, WAV, OGG, FLAC, YouTube links
            </div>
            
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowUrlDialog(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-slate-900 font-medium"
              >
                Start Transcription
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-40" aria-hidden>
        <div
          className="w-full h-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)" }}
        />
      </div>

      <div className="relative p-8">
        {/* Main Upload Area - Show when idle */}
        {uploadStage === 'idle' && (
          <>
            <div
              className="cursor-pointer mx-auto w-56 h-56 rounded-full border-2 border-dashed border-cyan-400/60 bg-cyan-500/10 flex flex-col items-center justify-center gap-2 text-center hover:scale-[1.02] transition-transform relative"
              onClick={triggerBrowse}
            >
              <div className="absolute inset-0 rounded-full animate-[pulse_2s_ease_infinite]" />
              <div className="text-5xl">🎙️</div>
              <div className="text-sm">Upload Audio</div>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={busy}
            />

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                className="px-4 py-2.5 rounded-xl text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 text-sm hover:bg-cyan-500/20 transition-colors cursor-pointer flex items-center gap-2"
                onClick={triggerBrowse}
                disabled={busy}
              >
                <Upload className="w-4 h-4" />
                Browse Files
              </button>
              <button
                className="px-4 py-2.5 rounded-xl text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 text-sm hover:bg-cyan-500/20 transition-colors cursor-pointer flex items-center gap-2"
                onClick={handlePasteUrl}
                disabled={busy}
              >
                <Link2 className="w-4 h-4" />
                Paste URL
              </button>
            </div>

            <p className="mt-4 text-center text-slate-400 text-sm">
              Supports: MP3, WAV, M4A, AAC, OGG, FLAC, MP4, and more
            </p>

            {/* Transcription Options */}
            <div className="mt-6 space-y-3">
              <label className={`flex items-center justify-between px-4 py-3 rounded-xl border ${canUseHighAccuracy ? 'border-slate-800 bg-slate-900/60 hover:border-cyan-500/50 cursor-pointer' : 'border-slate-800/50 bg-slate-900/30 cursor-not-allowed opacity-60'} transition-colors`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      High Accuracy Mode
                      {!canUseHighAccuracy && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                          {isAuthenticated ? 'Pro plan required' : 'Sign in to enable'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {canUseHighAccuracy ? 'Best for professional use' : 'Unlock higher accuracy with Pro plan'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={highAccuracy && canUseHighAccuracy}
                  onChange={(e) => canUseHighAccuracy && setHighAccuracy(e.target.checked)}
                  disabled={!canUseHighAccuracy}
                  className="w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>

              <label className={`flex items-center justify-between px-4 py-3 rounded-xl border ${canUseDiarization ? 'border-slate-800 bg-slate-900/60 hover:border-cyan-500/50 cursor-pointer' : 'border-slate-800/50 bg-slate-900/30 cursor-not-allowed opacity-60'} transition-colors`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">👥</span>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      Speaker Detection
                      {!canUseDiarization && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                          {diarizationTierEligible ? 'Sign in to enable' : 'Basic plan or higher required'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {canUseDiarization ? 'Identify different speakers' : 'Upgrade to unlock speaker detection'}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={speakerDiarization && canUseDiarization}
                  onChange={(e) => canUseDiarization && setSpeakerDiarization(e.target.checked)}
                  disabled={!canUseDiarization}
                  className="w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>
            </div>
          </>
        )}

        {/* Upload Progress */}
        {uploadStage === 'uploading' && (
          <div className="py-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/20 mb-4">
                <Upload className="w-10 h-10 text-cyan-400 animate-pulse" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Uploading File</h3>
              <p className="text-sm text-slate-400">{currentFileName}</p>
            </div>

            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>Upload Progress</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              {estimatedTime > 0 && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Clock className="w-4 h-4" />
                  <span>Estimated time: {estimatedTime}s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Processing Stage */}
        {uploadStage === 'processing' && (
          <div className="py-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/20 mb-4">
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Processing Audio</h3>
              <p className="text-sm text-slate-400">Transcribing your audio with AI</p>
            </div>

            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-sm text-slate-400 mb-2">
                <span>Processing</span>
                <span>{Math.round(processingProgress)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-purple-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
              
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl mb-1">🎯</div>
                  <div className="text-xs text-slate-400">
                    {highAccuracy ? 'High Accuracy' : 'Standard'}
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <div className="text-2xl mb-1">👥</div>
                  <div className="text-xs text-slate-400">
                    {speakerDiarization ? 'Speaker Detection' : 'Single Speaker'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completed State with Results */}
        {uploadStage === 'completed' && transcriptionResult && (
          <div className="py-4">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-4">
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Transcription Complete!</h3>
              <p className="text-sm text-slate-400">{transcriptionResult.title}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <Clock className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <div className="text-sm font-medium">{formatDuration(transcriptionResult.duration)}</div>
                <div className="text-xs text-slate-500">Preview Length</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <User className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <div className="text-sm font-medium">5 min</div>
                <div className="text-xs text-slate-500">Free Limit</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <FileText className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <div className="text-sm font-medium">
                  {transcriptionResult.segments.length || 1}
                </div>
                <div className="text-xs text-slate-500">Segments</div>
              </div>
            </div>

            {/* Timestamped Segments Preview */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-400">Timestamped Segments</h4>
                <button
                  onClick={handleCopyToClipboard}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  {copiedToClipboard ? (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 max-h-72 overflow-y-auto">
                {transcriptionResult.segments.length > 0 ? (
                  <div className="space-y-3 text-sm">
                    {transcriptionResult.segments.map((segment, idx) => (
                      <div key={idx} className="border-b border-slate-800/80 pb-2 last:border-none last:pb-0">
                        <div className="text-sm">
                          <span className="font-mono text-xs text-slate-400">
                            [{formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}]
                          </span>
                          <span className="ml-2 text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {previewIsChinese ? enhanceChineseText(segment.text) : segment.text}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{transcriptionResult.text}</p>
                )}
              </div>
            </div>

            {/* Export Options */}
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-3">Export Options</h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  onClick={() => handleExport('txt')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileText className="w-4 h-4" />
                  TXT
                </button>
                <button
                  onClick={() => handleExport('srt')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  SRT
                </button>
                <button
                  onClick={() => handleExport('vtt')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  VTT
                </button>
                <button
                  onClick={() => handleExport('docx')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileType className="w-4 h-4" />
                  WORD
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileOutput className="w-4 h-4" />
                  PDF
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Free preview exports the first 5 minutes. Sign in for full-length transcripts and advanced features.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={resetState}
                disabled={openingEditor}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                New Transcription
              </button>
              <button
                onClick={handleOpenInEditor}
                disabled={openingEditor || !currentJobId}
                className="flex-1 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-500/70 disabled:cursor-not-allowed transition-colors text-slate-900 font-medium text-sm flex items-center justify-center gap-2"
              >
                {openingEditor ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Opening Editor...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>{currentJobId ? 'Open in Editor' : 'Preparing Full Job...'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Failed State */}
        {uploadStage === 'failed' && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 mb-4">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Transcription Failed</h3>
            <p className="text-sm text-slate-400 mb-6">
              {previewError || 'Something went wrong. Please try again.'}
            </p>
            <button
              onClick={resetState}
              className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-600 transition-colors text-slate-900 font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Live Recording (disabled for now) */}
        {uploadStage === 'idle' && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span>Live Recording Available</span>
            </div>
            <button className="w-12 h-12 rounded-full bg-red-500/90 border-4 border-red-500/30 text-lg" disabled>
              🔴
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseSRT(srt: string): PreviewSegment[] {
  const sanitized = srt.replace(/\r/g, '').trim();
  if (!sanitized) return [];

  const blocks = sanitized.split(/\n\n+/);
  const segments: PreviewSegment[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length < 2) continue;

    let timeLineIndex = 0;
    if (/^\d+$/.test(lines[0].trim())) {
      timeLineIndex = 1;
    }

    const timingLine = lines[timeLineIndex];
    const timingMatch = timingLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!timingMatch) continue;

    const start = srtTimestampToSeconds(timingMatch[1]);
    const end = srtTimestampToSeconds(timingMatch[2]);
    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join(' ').trim();
    if (!text) continue;

    segments.push({ start, end, text });
  }

  return segments;
}

function srtTimestampToSeconds(timestamp: string): number {
  const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  const [, hh, mm, ss, ms] = match;
  return parseInt(hh, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(ss, 10) + parseInt(ms, 10) / 1000;
}

function buildSRTFromSegments(segments: PreviewSegment[]): string {
  if (!segments.length) return '';
  return segments
    .map((segment, idx) => {
      const start = secondsToSrtTime(segment.start);
      const end = secondsToSrtTime(segment.end);
      return `${idx + 1}\n${start} --> ${end}\n${segment.text}\n`;
    })
    .join('\n');
}

function buildVTTFromSegments(segments: PreviewSegment[]): string {
  if (!segments.length) return 'WEBVTT';
  const body = segments
    .map((segment) => `${secondsToVttTime(segment.start)} --> ${secondsToVttTime(segment.end)}\n${segment.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`.trim();
}

function secondsToSrtTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSeconds = Math.floor(seconds);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function secondsToVttTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSeconds = Math.floor(seconds);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const base = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${base}.${ms.toString().padStart(3, '0')}`;
}
