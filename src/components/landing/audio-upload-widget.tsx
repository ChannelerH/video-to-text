"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { useTranslations } from "next-intl";
import { useAppContext } from "@/contexts/app";

interface Props {
  locale: string;
}

// Client-only widget that preserves existing UI but wires interactions
export default function AudioUploadWidget({ locale }: Props) {
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
  
  // Check if user has high accuracy access (pro tier or high accuracy minute packs)
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

  const triggerBrowse = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handlePasteUrl = () => {
    if (busy) return;
    setShowUrlDialog(true);
  };

  const handleUrlSubmit = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setShowUrlDialog(false);
    try {
      setBusy(true);
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(url);
      const body = {
        type: isYouTube ? "youtube_url" : "audio_url",
        content: url,
        action: isAuthenticated ? "transcribe" : "preview",
        options: {
          high_accuracy: canUseHighAccuracy && highAccuracy,
          speaker_diarization: canUseDiarization && speakerDiarization,
          enableDiarizationAfterWhisper: canUseDiarization && speakerDiarization
        }
      } as any;

      const resp = await fetch("/api/transcribe/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.success || !data?.job_id) {
        throw new Error(data?.error || "Failed to start transcription");
      }
      // Navigate to history with highlight
      const dest = locale && locale !== "en"
        ? `/${locale}/dashboard/transcriptions?highlight=${encodeURIComponent(data.job_id)}`
        : `/dashboard/transcriptions?highlight=${encodeURIComponent(data.job_id)}`;
      router.push(dest);
    } catch (e: any) {
      console.error(e);
      showToast('error', t('errors.general_error'), e?.message || t('errors.general_error'));
    } finally {
      setBusy(false);
      setUrlInput(''); // Clear input after use
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      // 1) get presigned upload URL
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
      const { uploadUrl, key, publicUrl, downloadUrl } = presign.data as {
        uploadUrl: string; key: string; publicUrl: string; downloadUrl?: string;
      };

      // 2) upload file via XHR PUT to R2
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.onload = () => (xhr.status === 200 || xhr.status === 204) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload error"));
        xhr.onabort = () => reject(new Error("Upload aborted"));
        xhr.send(file);
      });

      // 3) start async transcription
      const body = {
        type: "file_upload",
        content: downloadUrl || publicUrl,
        action: isAuthenticated ? "transcribe" : "preview",
        options: { 
          r2Key: key, 
          originalFileName: file.name,
          high_accuracy: canUseHighAccuracy && highAccuracy,
          speaker_diarization: canUseDiarization && speakerDiarization,
          enableDiarizationAfterWhisper: canUseDiarization && speakerDiarization
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
      // 4) navigate to dashboard/transcriptions with highlight
      const dest = locale && locale !== "en"
        ? `/${locale}/dashboard/transcriptions?highlight=${encodeURIComponent(data.job_id)}`
        : `/dashboard/transcriptions?highlight=${encodeURIComponent(data.job_id)}`;
      router.push(dest);
    } catch (e: any) {
      console.error(e);
      showToast('error', t('errors.upload_failed'), e?.message || t('errors.general_error'));
    } finally {
      // reset input to allow selecting the same file again
      if (fileInputRef.current) fileInputRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <div className="relative rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-800/60 p-8 overflow-hidden">
      <ToastNotification 
        type={toast.type}
        title={toast.title}
        message={toast.message}
        isOpen={toast.isOpen}
        onClose={hideToast}
      />
      
      {/* Custom URL Dialog */}
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
              Supports: YouTube links
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

      <div className="relative">
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
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={busy}
        />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {[{ label: "📁 Browse Files", onClick: triggerBrowse }, { label: "📋 Paste URL", onClick: handlePasteUrl }].map((x) => (
            <button
              key={x.label}
              className="px-3 py-2 rounded-2xl text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 text-sm hover:bg-cyan-500/20 transition-colors cursor-pointer"
              onClick={x.onClick}
              disabled={busy}
              style={{ opacity: busy ? 0.7 : 1 }}
            >
              {x.label}
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-slate-400 text-sm">
          Supports: MP3, WAV, M4A, AAC, OGG, FLAC, and more
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
                {!canUseHighAccuracy && (
                  <Link
                    href="/pricing"
                    className="text-xs text-cyan-400 underline hover:text-cyan-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Upgrade
                  </Link>
                )}
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
                {!canUseDiarization && (
                  <Link
                    href="/pricing"
                    className="text-xs text-cyan-400 underline hover:text-cyan-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Upgrade
                  </Link>
                )}
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

        <div className="mt-6 flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span>Live Recording Available</span>
          </div>
          <button className="w-12 h-12 rounded-full bg-red-500/90 border-4 border-red-500/30 text-lg" disabled>
            🔴
          </button>
        </div>
      </div>
    </div>
  );
}
