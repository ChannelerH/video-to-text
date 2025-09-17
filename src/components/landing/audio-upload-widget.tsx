"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "next-auth/react";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { useTranslations } from "next-intl";

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

  const triggerBrowse = () => {
    if (busy) return;
    fileInputRef.current?.click();
  };

  const handlePasteUrl = async () => {
    if (busy) return;
    const url = window.prompt("Paste an audio URL (MP3/M4A/WAV/OGG/FLAC)");
    if (!url) return;
    try {
      setBusy(true);
      const isYouTube = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i.test(url);
      const body = {
        type: isYouTube ? "youtube_url" : "audio_url",
        content: url,
        action: isAuthenticated ? "transcribe" : "preview",
        options: {}
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
        options: { r2Key: key, originalFileName: file.name },
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
      <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] opacity-40" aria-hidden>
        <div
          className="w-full h-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)" }}
        />
      </div>

      <div className="relative">
        <label
          className="block cursor-pointer mx-auto w-56 h-56 rounded-full border-2 border-dashed border-cyan-400/60 bg-cyan-500/10 flex flex-col items-center justify-center gap-2 text-center hover:scale-[1.02] transition-transform"
          onClick={(e) => { e.preventDefault(); triggerBrowse(); }}
        >
          <div className="absolute inset-0 rounded-full animate-[pulse_2s_ease_infinite]" />
          <div className="text-5xl">🎙️</div>
          <div className="text-sm">Upload Audio</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {[{ label: "📁 Browse Files", onClick: triggerBrowse }, { label: "📋 Paste URL", onClick: handlePasteUrl }].map((x) => (
            <span
              key={x.label}
              className="px-3 py-2 rounded-2xl text-cyan-400 border border-cyan-500/40 bg-cyan-500/10 text-sm"
              onClick={(e) => { e.preventDefault(); x.onClick(); }}
              role="button"
              aria-disabled={busy}
              style={{ opacity: busy ? 0.7 : 1, pointerEvents: busy ? "none" : "auto" }}
            >
              {x.label}
            </span>
          ))}
        </div>

        <p className="mt-4 text-center text-slate-400 text-sm">
          Supports: MP3, WAV, M4A, AAC, OGG, FLAC, and more
        </p>

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
