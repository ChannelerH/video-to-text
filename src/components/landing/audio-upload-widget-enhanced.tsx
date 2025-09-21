"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/contexts/app";
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileJson, 
  Copy, 
  CheckCircle,
  AlertCircle,
  Loader2,
  Upload,
  Link2,
  Clock,
  User,
  FileAudio,
  Youtube
} from "lucide-react";

interface Props {
  locale: string;
}

interface TranscriptionResult {
  id: string;
  title: string;
  text: string;
  duration: number;
  speakers?: Array<{ id: string; label: string }>;
  segments?: Array<{
    speaker?: string;
    text: string;
    start: number;
    end: number;
  }>;
  status: 'completed' | 'processing' | 'failed';
  progress?: number;
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
  const [exportFormat, setExportFormat] = useState<'txt' | 'srt' | 'vtt' | 'json'>('txt');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [openingEditor, setOpeningEditor] = useState(false);
  
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
  };

  const triggerBrowse = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handlePasteUrl = () => {
    if (busy) return;
    setShowUrlDialog(true);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExport = async (format: 'txt' | 'srt' | 'vtt' | 'json') => {
    if (!transcriptionResult) return;

    let content = '';
    let filename = `${transcriptionResult.title || 'transcription'}.${format}`;

    switch (format) {
      case 'txt':
        content = transcriptionResult.segments 
          ? transcriptionResult.segments.map(seg => 
              seg.speaker ? `[${seg.speaker}]: ${seg.text}` : seg.text
            ).join('\n\n')
          : transcriptionResult.text;
        break;
      
      case 'srt':
        if (transcriptionResult.segments) {
          content = transcriptionResult.segments.map((seg, idx) => 
            `${idx + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.speaker ? `[${seg.speaker}]: ` : ''}${seg.text}\n`
          ).join('\n');
        }
        break;
      
      case 'vtt':
        content = 'WEBVTT\n\n';
        if (transcriptionResult.segments) {
          content += transcriptionResult.segments.map(seg => 
            `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.speaker ? `<v ${seg.speaker}>` : ''}${seg.text}\n`
          ).join('\n');
        }
        break;
      
      case 'json':
        content = JSON.stringify(transcriptionResult, null, 2);
        break;
    }

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast('success', 'Export Successful', `Downloaded as ${filename}`);
  };

  const handleCopyToClipboard = async () => {
    if (!transcriptionResult) return;

    const text = transcriptionResult.segments 
      ? transcriptionResult.segments.map(seg => 
          seg.speaker ? `[${seg.speaker}]: ${seg.text}` : seg.text
        ).join('\n\n')
      : transcriptionResult.text;

    await navigator.clipboard.writeText(text);
    setCopiedToClipboard(true);
    showToast('success', 'Copied!', 'Transcription copied to clipboard');
    
    setTimeout(() => setCopiedToClipboard(false), 3000);
  };

  const handleOpenInEditor = async () => {
    if (!transcriptionResult) return;
    
    setOpeningEditor(true);
    
    // Add a small delay to show the loading state
    setTimeout(() => {
      router.push(`/${locale}/dashboard/editor/${transcriptionResult.id}`);
    }, 500);
  };

  const handleUrlSubmit = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setShowUrlDialog(false);
    
    try {
      setBusy(true);
      setUploadStage('processing');
      setProcessingProgress(10);
      setCurrentFileName(url.split('/').pop() || 'URL Audio');
      
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(url);
      
      // Estimate time based on content type
      setEstimatedTime(isYouTube ? 30 : 20);
      
      const body = {
        type: isYouTube ? "youtube_url" : "audio_url",
        content: url,
        action: isAuthenticated ? "transcribe" : "preview",
        options: {
          high_accuracy: canUseHighAccuracy && highAccuracy,
          speaker_diarization: canUseDiarization && speakerDiarization
        }
      };

      const resp = await fetch("/api/transcribe/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      const data = await resp.json();
      
      if (!resp.ok || !data?.success || !data?.job_id) {
        throw new Error(data?.error || "Failed to start transcription");
      }

      // Simulate processing completion
      setProcessingProgress(100);
      
      // Mock result for demo
      setTimeout(() => {
        setTranscriptionResult({
          id: data.job_id,
          title: currentFileName,
          text: "This is a sample transcription result...",
          duration: 180,
          speakers: speakerDiarization ? [
            { id: '1', label: 'Speaker 1' },
            { id: '2', label: 'Speaker 2' }
          ] : undefined,
          segments: [
            { 
              speaker: speakerDiarization ? 'Speaker 1' : undefined, 
              text: "Welcome to our discussion today.", 
              start: 0, 
              end: 3 
            },
            { 
              speaker: speakerDiarization ? 'Speaker 2' : undefined, 
              text: "Thank you for having me.", 
              start: 3, 
              end: 5 
            },
          ],
          status: 'completed',
          createdAt: new Date()
        });
        setUploadStage('completed');
      }, 2000);
      
    } catch (e: any) {
      console.error(e);
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
      setUploadStage('uploading');
      
      // Get presigned upload URL
      const presignResp = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          mode: "audio",
        }),
      });
      
      const presign = await presignResp.json();
      if (!presignResp.ok || !presign?.success) {
        throw new Error(presign?.error || "Failed to get upload URL");
      }
      
      const { uploadUrl, key, publicUrl, downloadUrl } = presign.data;

      // Upload file with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(progress);
          }
        });
        
        xhr.addEventListener("load", () => {
          if (xhr.status === 200 || xhr.status === 204) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        });
        
        xhr.addEventListener("error", () => reject(new Error("Upload error")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
        
        xhr.open("PUT", uploadUrl);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setUploadStage('processing');
      setProcessingProgress(20);

      // Start async transcription
      const body = {
        type: "file_upload",
        content: downloadUrl || publicUrl,
        action: isAuthenticated ? "transcribe" : "preview",
        options: { 
          r2Key: key, 
          originalFileName: file.name,
          high_accuracy: canUseHighAccuracy && highAccuracy,
          speaker_diarization: canUseDiarization && speakerDiarization
        },
      };

      const resp = await fetch("/api/transcribe/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      const data = await resp.json();
      if (!resp.ok || !data?.success || !data?.job_id) {
        throw new Error(data?.error || "Failed to start transcription");
      }

      // Simulate processing completion
      setProcessingProgress(100);
      
      // Mock result for demo
      setTimeout(() => {
        setTranscriptionResult({
          id: data.job_id,
          title: file.name,
          text: "This is a sample transcription of your uploaded audio file...",
          duration: 240,
          speakers: speakerDiarization ? [
            { id: '1', label: 'Speaker 1' },
            { id: '2', label: 'Speaker 2' }
          ] : undefined,
          segments: [
            { 
              speaker: speakerDiarization ? 'Speaker 1' : undefined, 
              text: "This is the beginning of the transcription.", 
              start: 0, 
              end: 4 
            },
            { 
              speaker: speakerDiarization ? 'Speaker 2' : undefined, 
              text: "The audio quality is excellent.", 
              start: 4, 
              end: 7 
            },
          ],
          status: 'completed',
          createdAt: new Date()
        });
        setUploadStage('completed');
      }, 3000);
      
    } catch (e: any) {
      console.error(e);
      setUploadStage('failed');
      showToast('error', t('errors.upload_failed'), e?.message || t('errors.general_error'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
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
                <div className="text-sm font-medium">{formatTime(transcriptionResult.duration)}</div>
                <div className="text-xs text-slate-500">Duration</div>
              </div>
              {transcriptionResult.speakers && (
                <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                  <User className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                  <div className="text-sm font-medium">{transcriptionResult.speakers.length}</div>
                  <div className="text-xs text-slate-500">Speakers</div>
                </div>
              )}
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <FileText className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <div className="text-sm font-medium">
                  {transcriptionResult.segments?.length || 1}
                </div>
                <div className="text-xs text-slate-500">Segments</div>
              </div>
            </div>

            {/* Transcription Preview */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-400">Transcription Preview</h4>
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
              
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4 max-h-64 overflow-y-auto">
                <div className="space-y-3 font-mono text-sm">
                  {transcriptionResult.segments?.map((segment, idx) => (
                    <div key={idx} className="group">
                      {segment.speaker && (
                        <span className="text-cyan-400 font-semibold">
                          {segment.speaker}:
                        </span>
                      )}
                      <span className="text-slate-300 ml-2">
                        {segment.text}
                      </span>
                      <span className="text-xs text-slate-600 ml-2">
                        [{formatTime(segment.start)}]
                      </span>
                    </div>
                  )) || (
                    <p className="text-slate-300">{transcriptionResult.text}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-3">Export Options</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  onClick={() => handleExport('json')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors text-sm"
                >
                  <FileJson className="w-4 h-4" />
                  JSON
                </button>
              </div>
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
                disabled={openingEditor}
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
                    <span>Open in Editor</span>
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
              Something went wrong. Please try again.
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