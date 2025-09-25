"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Check, Code, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import PyramidLoader from "@/components/ui/pyramid-loader";
import { useRouter, Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useAppContext } from "@/contexts/app";
import { isAuthEnabled } from "@/lib/auth";
import { MultipartUploader } from "@/lib/multipart-upload";
import { UpgradeModal } from "@/components/upgrade-modal";
import { ToastNotification, useToast } from "@/components/toast-notification";
import { DocumentExportService } from "@/lib/export-document";
import { usePlayerStore } from "@/stores/player-store";
import dynamic from 'next/dynamic';
import AudioTrackSelector from '@/components/audio-track-selector';
import type { AudioTrack } from '@/components/audio-track-selector';
import { callApiWithRetry, pollStatus, getErrorType } from "@/lib/api-utils";
import { ErrorDialog } from '@/components/error-dialog';
import TurnstileModal from '@/components/turnstile-modal';

function isMediaFileType(mime: string): boolean {
  return typeof mime === 'string' && (mime.startsWith('audio') || mime.startsWith('video'));
}

async function measureFileDuration(file: File): Promise<number | null> {
  if (typeof document === 'undefined') return null;
  if (!isMediaFileType(file.type)) return null;

  return new Promise((resolve) => {
    let media: HTMLMediaElement | null = null;
    let objectUrl = '';
    let settled = false;

    const cleanup = () => {
      if (media) {
        media.removeEventListener('loadedmetadata', onLoaded);
        media.removeEventListener('error', onError);
        if (media.parentNode) {
          media.parentNode.removeChild(media);
        }
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const onLoaded = () => {
      if (!media) return finish(null);
      const duration = Number(media.duration);
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };

    const onError = () => finish(null);

    try {
      objectUrl = URL.createObjectURL(file);
      const tagName = file.type.startsWith('video') ? 'video' : 'audio';
      media = document.createElement(tagName);
      media.preload = 'metadata';
      media.muted = true;
      media.playsInline = true;
      media.src = objectUrl;
      media.style.position = 'absolute';
      media.style.opacity = '0';
      media.style.pointerEvents = 'none';
      media.style.width = '1px';
      media.style.height = '1px';

      media.addEventListener('loadedmetadata', onLoaded, { once: true });
      media.addEventListener('error', onError, { once: true });
      document.body.appendChild(media);
      media.load();

      setTimeout(() => finish(null), 7000);
    } catch (error) {
      console.warn('[DEBUG] Unable to create media element for duration probing:', error);
      finish(null);
    }
  });
}

// Lazy load editor views
const EditorView = dynamic(() => import('@/components/editor-view'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96"><PyramidLoader size="medium" /></div>
});

const ModernEditor = dynamic(() => import('@/components/editor-view/modern-editor'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96"><PyramidLoader size="medium" /></div>
});

const CleanEditor = dynamic(() => import('@/components/editor-view/clean-editor'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96"><PyramidLoader size="medium" /></div>
});

const ThreeColumnEditor = dynamic(() => import('@/components/editor-view/three-column-editor'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-96"><PyramidLoader size="medium" /></div>
});

interface ToolInterfaceProps {
  mode?: "video" | "audio";
}

export default function ToolInterface({ mode = "video" }: ToolInterfaceProps) {
  const t = useTranslations("tool_interface");
  
  // Authentication state
  const { data: session } = isAuthEnabled() ? useSession() : { data: null };
  const { user, userTier } = useAppContext();
  const isFreeTier = (userTier || 'free') === 'free';
  const isAuthenticated = !!(session?.user || user);
  const tier = (userTier || (user as any)?.userTier || 'free') as string;
  const normalizedTier = String(tier || 'free').toLowerCase();
  const canUseHighAccuracy = isAuthenticated && (normalizedTier === 'pro');
  const canUseDiarization = isAuthenticated && ['basic', 'pro', 'premium'].includes(normalizedTier);
  const diarizationTierEligible = ['basic', 'pro', 'premium'].includes(normalizedTier);
  
  // Debug logging
  const [enableDiarizationAfterWhisper, setEnableDiarizationAfterWhisper] = useState(false);
  
  useEffect(() => {
    console.log('[HighAccuracy Debug]', {
      isAuthenticated,
      tier,
      userTier,
      userFromContext: user,
      canUseHighAccuracy,
      canUseDiarization
    });
  }, [isAuthenticated, tier, userTier, user, canUseHighAccuracy, canUseDiarization]);
  
  useEffect(() => {
    if (!canUseDiarization && enableDiarizationAfterWhisper) {
      setEnableDiarizationAfterWhisper(false);
    }
  }, [canUseDiarization, enableDiarizationAfterWhisper]);
  
  const [url, setUrl] = useState("");
  const [selectedFormats, setSelectedFormats] = useState(["txt", "srt", "vtt", "md", "json"]);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string | React.ReactNode>("");
  const [result, setResult] = useState<any>(null);
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    requiredTier: 'basic' | 'pro';
    feature: string;
  }>({ isOpen: false, requiredTier: 'basic', feature: '' });
  const [isNavigatingToHistory, setIsNavigatingToHistory] = useState(false);
  const { toast, showToast, hideToast } = useToast();
  // Progress tracking
  const [progressInfo, setProgressInfo] = useState<{
    stage: 'upload' | 'download' | 'transcribe' | 'process' | null;
    percentage: number;
    message: string;
    estimatedTime?: string;
  }>({ stage: null, percentage: 0, message: '' });
  const [uploadProgress, setUploadProgress] = useState(0);
  // AI refine button removed; backend runs optional refinement automatically for Chinese
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<any>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [downloadingFormats, setDownloadingFormats] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const isAbortingRef = useRef<boolean>(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  
  // Error handling state
  const [errorState, setErrorState] = useState<{
    type: 'api_error' | 'timeout' | 'network' | 'server' | null;
    message: ReactNode;
    canRetry: boolean;
    retryAction?: () => void;
  }>({ type: null, message: '', canRetry: false });
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingTranscriptionRef = useRef<{ preferredLanguage?: string } | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const sessionExpiryRef = useRef<number>(0);
  
  // Audio track selection state
  const [showTrackSelector, setShowTrackSelector] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<AudioTrack[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [trackVideoTitle, setTrackVideoTitle] = useState<string>('');
  // Prefetch dashboard editor + transcriptions routes when jobId is available
  useEffect(() => {
    try {
      const id = (result as any)?.data?.jobId;
      if (id) {
        router.prefetch?.(`/${locale}/dashboard/editor/${id}`);
        router.prefetch?.(`/${locale}/dashboard/transcriptions?highlight=${id}`);
      }
    } catch {}
  }, [result, locale, router]);
  // Early banner when Chinese is detected via probe
  const [showChineseUpgrade, setShowChineseUpgrade] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Avoid duplicate Chinese upgrade toast per run
  const [zhBannerShown, setZhBannerShown] = useState(false);
  const [generatedChapters, setGeneratedChapters] = useState<any[]>([]);
  const [generatedSummary, setGeneratedSummary] = useState<string>("");
  const [copiedChapters, setCopiedChapters] = useState<boolean>(false);
  
  // Turnstile state
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number>(0);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [copiedSegments, setCopiedSegments] = useState<boolean>(false);
  const [generatingChapters, setGeneratingChapters] = useState<boolean>(false);
  const [isNavigatingToEditor, setIsNavigatingToEditor] = useState<boolean>(false);
  const [generatingSummary, setGeneratingSummary] = useState<boolean>(false);
  const [exportingDocument, setExportingDocument] = useState<boolean>(false);
  const [exportingWord, setExportingWord] = useState<boolean>(false);
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const viewMode = usePlayerStore((state) => state.viewMode);
  const setViewMode = usePlayerStore((state) => state.setViewMode);
  useEffect(() => { setMounted(true); }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear any polling timeouts
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Helper to display and auto-hide the Chinese upgrade toast (disabled)
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const showChineseToast = () => {
    // Disabled - no longer showing Chinese detection banner
    return;
    // if (zhBannerShown) return;
    // setZhBannerShown(true);
    // setShowChineseUpgrade(true);
    // if (timerRef.current) clearTimeout(timerRef.current);
    // timerRef.current = setTimeout(() => setShowChineseUpgrade(false), 10000);
  };

  // Estimate processing time based on duration
  const estimateProcessingTime = (durationInSeconds: number): string => {
    // Based on experience:
    // - Download: ~0.5-1 second per minute of video
    // - Transcription: ~0.2-0.3 second per minute for Deepgram
    // - Post-processing: ~2-5 seconds fixed
    const minutes = durationInSeconds / 60;
    const downloadTime = minutes * 0.7; // Average download time
    const transcribeTime = minutes * 0.25; // Average transcription time
    const processTime = 3; // Fixed post-processing
    const totalSeconds = Math.ceil(downloadTime + transcribeTime + processTime);
    
    if (totalSeconds < 60) {
      return `${totalSeconds} seconds`;
    } else {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins} minutes`;
    }
  };
  
  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);


  // Helpers: Chinese detection and formatting
  const isChineseLangOrText = (lang?: string, text?: string) => {
    if (lang && lang.toLowerCase().includes('zh')) return true;
    if (!text) return false;
    return /[\u4e00-\u9fff]/.test(text);
  };
  type Segment = { start: number; end: number; text: string; speaker?: string | number };
  const groupSegmentsToParagraphs = (segments: Segment[]) => {
    const groups: { start: number; end: number; text: string }[] = [];
    if (!segments || segments.length === 0) return groups;
    let current: { start: number; end: number; texts: string[] } | null = null;
    const maxCharsPerPara = 80; // 更短的段落，便于阅读
    const maxGapSeconds = 3;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!current) {
        current = { start: seg.start, end: seg.end, texts: [seg.text.trim()] };
        continue;
      }
      const prevEnd = current.end;
      const gap = seg.start - prevEnd;
      const currentLen = current.texts.join('').length;
      if (gap > maxGapSeconds || currentLen > maxCharsPerPara) {
        groups.push({ start: current.start, end: current.end, text: current.texts.join('') });
        current = { start: seg.start, end: seg.end, texts: [seg.text.trim()] };
      } else {
        current.end = seg.end;
        const prev = current.texts[current.texts.length - 1] || '';
        const prevEndsWithPunct = /[。！？…]$/.test(prev) || /[”’）】]$/.test(prev) || /[.!?]$/.test(prev);
        // 更积极：当停顿>=1.0s 时，在拼接处补一个逗号（仅显示层，不改源数据）
        if (!prevEndsWithPunct && gap >= 1.0) {
          current.texts[current.texts.length - 1] = prev + '，';
        }
        current.texts.push(seg.text.trim());
      }
    }
    if (current) groups.push({ start: current.start, end: current.end, text: current.texts.join('') });
    return groups;
  };
  const formatTs = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  };

  const formatSpeakerLabel = (value: string | number | undefined | null) => {
    if (value === undefined || value === null) return '';
    const str = String(value).trim();
    if (!str) return '';
    const num = Number(str);
    if (!Number.isNaN(num)) {
      return `Speaker ${num + 1}`;
    }
    return str;
  };
  const punctuateChineseParagraph = (raw: string) => {
    let text = (raw || '').trim();
    if (!text) return '';
    // 1) 统一空白
    text = text.replace(/[\t\r\f]+/g, ' ').replace(/\u00A0/g, ' ').replace(/\s{2,}/g, ' ');
    // 2) 将中文内部多余空格去除
    text = text.replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1');
    // 3) 英文/数字与中文之间加空格（pangu 风格）
    text = text
      .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2');
    // 4) ASCII 标点 -> 中文标点（仅在中字符邻域）
    text = text
      .replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，')
      .replace(/([\u4e00-\u9fff])\s*\.\s*/g, '$1。')
      .replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；')
      .replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：')
      .replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！')
      .replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？');
    // 5) 引号与括号归一
    text = text
      .replace(/"([^"]+)"/g, '“$1”')
      .replace(/'([^']+)'/g, '‘$1’')
      .replace(/\(/g, '（').replace(/\)/g, '）');
    // 6) 压缩重复标点
    text = text.replace(/，{2,}/g, '，').replace(/。{2,}/g, '。').replace(/！{2,}/g, '！').replace(/？{2,}/g, '？');
    // 7) 去除标点两侧空格
    text = text.replace(/\s*([，。！？；：、“”‘’（）：])\s*/g, '$1');
    // 8) 保守策略：不按纯长度随机注入标点；句末不强制补标点
    return text;
  };

  // Split Chinese text into one sentence per line using punctuation boundaries
  const splitChineseSentences = (raw: string) => {
    let t = (raw || '').trim();
    if (!t) return '';
    // Insert line breaks after sentence-ending punctuation with optional closing quotes/brackets
    t = t.replace(/([。！？；])(”|’|）|】)?/g, (_m, p1, p2) => `${p1}${p2 || ''}\n`);
    // Collapse excessive blank lines
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    return t;
  };

  // Derived display text for the main transcription panel (punctuated for Chinese)
  const displayText = useMemo(() => {
    const data = (result && result.type === 'full' && result.data) ? result.data : null;
    if (!data) return '';
    const lang = data.transcription.language as string | undefined;
    const rawText = data.transcription.text as string;
    const segments = (data.transcription.segments || []) as Segment[];
    const isZh = isChineseLangOrText(lang, rawText);
    if (!isZh) return rawText || '';
    // 后端已做本地断句与规范化，这里直接按句分行展示后端文本
    return splitChineseSentences(rawText || '');
  }, [result]);

  const goToHistory = () => {
    setIsNavigatingToHistory(true);
    const href = locale && locale !== 'en' ? `/${locale}/dashboard/transcriptions` : `/dashboard/transcriptions`;
    try {
      router.push(href);
      // 保险兜底：如果 SPA 跳转被阻塞，fallback 到硬跳转
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.assign(href);
        }
        // 如果 2 秒后还在这个页面，说明跳转可能失败了，移除 loading
        setTimeout(() => {
          setIsNavigatingToHistory(false);
        }, 2000);
      }, 400);
    } catch {
      if (typeof window !== 'undefined') {
        window.location.assign(href);
      }
    }
  };

  const handleFormatToggle = (format: string) => {
    setSelectedFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | null } }) => {
    const selectedFile = event.target.files?.[0] || null;
    
    console.log('[DEBUG] handleFileChange called, file:', selectedFile?.name);
    
    if (selectedFile) {
      let detectedDurationSec: number | null = null;
      try {
        detectedDurationSec = await measureFileDuration(selectedFile);
        if (detectedDurationSec) {
          console.log('[DEBUG] Detected media duration (sec):', detectedDurationSec);
        }
      } catch (err) {
        console.warn('[DEBUG] Failed to detect media duration:', err);
      }

      // 如果有正在进行的上传，先中断它（静默处理，不报错）
      if (uploadXhrRef.current) {
        console.log('[DEBUG] Aborting previous upload');
        isAbortingRef.current = true; // 标记为主动中断
        try {
          uploadXhrRef.current.abort();
        } catch (e) {
          // 忽略中断错误
        }
        uploadXhrRef.current = null;
      }
      
      setFile(selectedFile);
      setUrl("");
      setUploadedFileInfo(null); // 清除之前的上传信息
      setResult(null); // 清除之前的转录结果
      setProgressInfo({ stage: null, percentage: 0, message: '' }); // 清除进度信息
      
      // 立即上传文件到 R2（使用预签名URL直接上传）
      setProgress(t("progress.uploading"));
      setUploadProgress(0);
      
      // 显示上传进度
      setProgressInfo({
        stage: 'upload',
        percentage: 0,
        message: 'Uploading file...',
        estimatedTime: estimateUploadTime(selectedFile.size)
      });
      
      try {
        // 判断是否使用分片上传（50MB以上）
        if (MultipartUploader.shouldUseMultipart(selectedFile.size)) {
          console.log('[DEBUG] Using multipart upload for large file:', selectedFile.name);
          
          // 使用分片上传
          const uploader = new MultipartUploader();
          const abortController = new AbortController();
          const startTime = Date.now();
          
          // 保存abort controller以便能够取消
          uploadXhrRef.current = { abort: () => abortController.abort() } as any;
          
          try {
            const uploadResult = await uploader.upload({
            file: selectedFile,
            abortSignal: abortController.signal,
            onProgress: (percentage, uploadedBytes, totalBytes) => {
              setUploadProgress(Math.round(percentage * 100) / 100); // 保留两位小数
              setProgressInfo({
                stage: 'upload',
                percentage: Math.round(percentage * 100) / 100, // 保留两位小数
                message: `Uploading: ${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}`,
                estimatedTime: percentage > 0 ? 
                  estimateRemainingUploadTime(uploadedBytes, totalBytes, Date.now() - startTime) : 
                  'Calculating...'
              });
            },
            onPartComplete: (partNumber, totalParts) => {
              console.log(`[Multipart] Part ${partNumber}/${totalParts} completed`);
            }
            });
            
            // 清除引用
            uploadXhrRef.current = null;
            
            // 保存上传结果
            setUploadedFileInfo({
              key: uploadResult.key,
              replicateUrl: uploadResult.replicateUrl,
              r2Key: uploadResult.key,
              originalName: selectedFile.name,
              fileType: selectedFile.type,
              fileSize: selectedFile.size,
              uploadMethod: 'multipart',
              durationSec: detectedDurationSec ?? null
            });
            
            setProgress(t("progress.upload_success"));
            setProgressInfo({ stage: null, percentage: 0, message: '' });
            setUploadProgress(0);
            console.log('[DEBUG] Multipart upload success');
          
            // 清除文件输入
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            
            return; // 分片上传完成，返回
          } catch (multipartError) {
            // 清除引用
            uploadXhrRef.current = null;
            
            // 检查是否是用户取消
            if (isAbortingRef.current || (multipartError instanceof Error && multipartError.message === 'Upload aborted')) {
              console.log('[DEBUG] Multipart upload cancelled by user');
              isAbortingRef.current = false;
              setProgress("");
              setProgressInfo({ stage: null, percentage: 0, message: '' });
              setUploadProgress(0);
              return;
            }
            
            // 其他错误
            console.error('[DEBUG] Multipart upload error:', multipartError);
            setProgress(`Upload failed: ${multipartError instanceof Error ? multipartError.message : 'Unknown error'}`);
            setFile(null);
            setProgressInfo({ stage: null, percentage: 0, message: '' });
            setUploadProgress(0);
            
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            return;
          }
        }
        
        // 小文件使用原来的直接上传方式
        // Step 1: 获取预签名上传URL
        const presignedResponse = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
            mode: mode
          })
        });

        if (!presignedResponse.ok) {
          throw new Error(`Failed to get upload URL: ${presignedResponse.statusText}`);
        }

        const presignedData = await presignedResponse.json();
        
        if (!presignedData.success) {
          throw new Error(presignedData.error || 'Failed to get upload URL');
        }

        const { uploadUrl, key, publicUrl, downloadUrl } = presignedData.data;
        
        setProgressInfo({
          stage: 'upload',
          percentage: 5,
          message: 'Uploading file...',
          estimatedTime: estimateUploadTime(selectedFile.size)
        });

        // Step 2: 使用预签名URL直接上传到R2
        const xhr = new XMLHttpRequest();
        uploadXhrRef.current = xhr; // 保存引用以便能够中断
        isAbortingRef.current = false; // 重置中断标志
        
        // 先定义startTime，这样进度事件处理器才能访问到
        const startTime = Date.now();
        
        // 创建一个 Promise 来处理异步上传
        const uploadPromise = new Promise((resolve, reject) => {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const uploadPercent = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(uploadPercent);
              
              // 直接上传到R2，显示真实进度
              if (uploadPercent === 100) {
                setProgressInfo({
                  stage: 'upload',
                  percentage: 100,
                  message: 'Upload completed!',
                  estimatedTime: '0s'
                });
                setProgress('Upload completed!');
              } else {
                // 从5%开始（因为前5%用于获取URL）
                const adjustedPercent = 5 + Math.round((event.loaded / event.total) * 95);
                setProgressInfo({
                  stage: 'upload',
                  percentage: adjustedPercent,
                  message: `Uploading: ${formatBytes(event.loaded)} / ${formatBytes(event.total)}`,
                  estimatedTime: estimateRemainingUploadTime(event.loaded, event.total, Date.now() - startTime)
                });
              }
            }
          });

          xhr.addEventListener("load", () => {
            // R2上传成功（200或204）
            if (xhr.status === 200 || xhr.status === 204) {
              setProgressInfo({
                stage: 'upload',
                percentage: 100,
                message: 'Upload completed!',
                estimatedTime: '0s'
              });
              resolve({ success: true });
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => {
            console.error('Direct upload failed, likely CORS issue');
            reject(new Error("CORS error - Please configure R2 CORS policy"));
          });
          xhr.addEventListener("abort", () => reject(new Error("USER_CANCELLED")));
          xhr.addEventListener("timeout", () => reject(new Error("Upload timeout")));
        });

        // 配置直接上传到R2
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", selectedFile.type);
        
        // 设置超时时间为10分钟（对于大文件）
        xhr.timeout = 600000; // 10 minutes
        
        // 直接发送文件内容
        xhr.send(selectedFile);

        // 等待上传完成
        try {
          await uploadPromise;
          console.log('[DEBUG] Direct upload to R2 successful');
          
          // 上传成功，清除XHR引用
          uploadXhrRef.current = null;
          
          // 上传成功，保存文件信息
          const uploadedInfo = {
            key: key,
            replicateUrl: downloadUrl || publicUrl, // 使用预签名下载URL（如果可用）用于转录
            r2Key: key,
            originalName: selectedFile.name,
            fileType: selectedFile.type,
            fileSize: selectedFile.size,
            uploadMethod: 'presigned-url',
            durationSec: detectedDurationSec ?? null
          };
          
          setUploadedFileInfo(uploadedInfo);
          setProgress(t("progress.upload_success"));
          setProgressInfo({ stage: null, percentage: 0, message: '' });
          setUploadProgress(0);
          console.log('[DEBUG] Upload success, uploadedFileInfo set:', uploadedInfo);
          
          // 注意：不要清除 setFile(selectedFile)，因为我们需要显示文件信息
          // 只清除文件输入控件的值，以便可以重新选择同一个文件
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (uploadError) {
          // 清除XHR引用
          uploadXhrRef.current = null;
          
          // 如果是用户主动取消（通过标志判断），不显示错误，只清理状态
          if (isAbortingRef.current || (uploadError instanceof Error && uploadError.message === 'USER_CANCELLED')) {
            console.log('[DEBUG] Upload cancelled by user (silent)');
            isAbortingRef.current = false; // 重置标志
            setProgress("");
            setProgressInfo({ stage: null, percentage: 0, message: '' });
            setUploadProgress(0);
            return;
          }
          
          console.error('[DEBUG] Direct upload error:', uploadError);
          
          // 如果是CORS错误，尝试回退到传统上传方式
          if (uploadError instanceof Error && uploadError.message.includes('CORS')) {
            console.log('CORS error detected, falling back to traditional upload...');
            setProgress('Uploading file...');
            
            // 回退到传统上传
            try {
              setProgressInfo({
                stage: 'upload',
                percentage: 10,
                message: 'Uploading file...',
                estimatedTime: estimateUploadTime(selectedFile.size) 
              });
              
              const formData = new FormData();
              formData.append("file", selectedFile);
              formData.append("mode", mode);
              
              const uploadResponse = await fetch("/api/upload", {
                method: "POST",
                body: formData
              });
              
              const uploadResult = await uploadResponse.json();
              
              if (uploadResult.success) {
                setUploadedFileInfo({
                  ...uploadResult.data,
                  durationSec: detectedDurationSec ?? uploadResult.data?.durationSec ?? null
                });
                setProgress(t("progress.upload_success"));
                setProgressInfo({ stage: null, percentage: 0, message: '' });
                setUploadProgress(0);
                console.log('[DEBUG] Fallback upload success');
                
                // 保持file状态，只清除input的值
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              } else {
                throw new Error(uploadResult.error || 'Fallback upload failed');
              }
            } catch (fallbackError) {
              console.error('Fallback upload also failed:', fallbackError);
              setProgress('Upload failed. Please try again.');
              setFile(null);
              setProgressInfo({ stage: null, percentage: 0, message: '' });
              setUploadProgress(0);
              
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
              return;
            }
          } else {
            // 其他错误
            if (uploadError instanceof Error) {
              if (uploadError.message.includes('timeout')) {
                setProgress('Upload timed out. The file might be too large or your connection is slow.');
              } else {
                setProgress(`Upload failed: ${uploadError.message}`);
              }
            }
            setFile(null);
            setProgressInfo({ stage: null, percentage: 0, message: '' });
            setUploadProgress(0);
            
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            return;
          }
        }
      } catch (error) {
        console.error("Upload error:", error);
        setProgress(t("errors.upload_failed"));
        setFile(null); // 清除文件选择
        setProgressInfo({ stage: null, percentage: 0, message: '' });
        setUploadProgress(0);
        
        // 出错后重置文件输入控件
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleTranscribe = async () => {
    
    // 检查是否有URL或已上传的文件
    if (!url && !uploadedFileInfo) {
      // 如果有选择的文件但还没上传完成，提示等待
      if (file) {
        setProgress(t("errors.wait_for_upload"));
      } else {
        setProgress(t("upload_required"));
      }
      return;
    }

    if (!isAuthenticated) {
      const now = Date.now();
      const token = sessionTokenRef.current;
      const expiry = sessionExpiryRef.current;
      const hasValidSession = token && (!expiry || now < expiry);

      if (!hasValidSession) {
        sessionTokenRef.current = null;
        sessionExpiryRef.current = 0;
        if (sessionToken) setSessionToken(null);
        if (sessionExpiry) setSessionExpiry(0);
        console.log('[ToolInterface] Anonymous user without valid session, prompting Turnstile');
        pendingTranscriptionRef.current = { preferredLanguage: undefined };
        setShowTurnstile(true);
        return;
      }
    }

    // 如果是 YouTube URL，先检测音轨
    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
      try {
        setProgress(t("detecting_audio_tracks") || "Detecting audio tracks...");
        
        const detectResponse = await fetch('/api/youtube/detect-tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        
        if (detectResponse.ok) {
          const response = await detectResponse.json();
          console.log('[YouTube] Detect tracks response:', response);
          const { tracks, videoTitle, hasMultipleTracks } = response;
          
          console.log('[YouTube] Track detection result:', {
            hasMultipleTracks,
            tracksLength: tracks?.length,
            shouldShowSelector: hasMultipleTracks && tracks?.length > 1
          });
          
          if (hasMultipleTracks && tracks.length > 1) {
            // 显示音轨选择对话框
            console.log('[YouTube] Showing track selector with tracks:', tracks);
            setAvailableTracks(tracks);
            setTrackVideoTitle(videoTitle);
            setShowTrackSelector(true);
            setProgress("");
            return; // 等待用户选择
          } else {
            console.log('[YouTube] Not showing track selector, proceeding with default');
          }
        }
      } catch (error) {
        console.warn('Failed to detect audio tracks, continuing with default:', error);
      }
    }
    
    // 没有多音轨或检测失败，直接进行转录
    await performTranscription();
  };
  
  // 音轨选择后继续转录
  const handleTrackSelected = async (languageCode: string) => {
    console.log('[AudioTrack] User selected language:', languageCode);
    setSelectedLanguage(languageCode);
    setShowTrackSelector(false);
    
    // 继续转录流程
    await performTranscription(languageCode);
  };
  
  // Handle Turnstile verification success
  const handleTurnstileSuccess = async (token: string) => {
    console.log('[ToolInterface] Turnstile verification success, verifying token with backend');

    try {
      const response = await fetch('/api/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.success && data.sessionToken) {
        setTurnstileToken(token);
        setSessionToken(data.sessionToken);
        setSessionExpiry(data.sessionExpiry || 0);
        sessionTokenRef.current = data.sessionToken;
        sessionExpiryRef.current = data.sessionExpiry || 0;
        setShowTurnstile(false);

        const pending = pendingTranscriptionRef.current;
        pendingTranscriptionRef.current = null;

        setTimeout(async () => {
          if (pending) {
            console.log('[ToolInterface] Resuming pending transcription after verification', pending);
            await performTranscription(pending.preferredLanguage);
            return;
          }

          if (url || uploadedFileInfo) {
            console.log('[ToolInterface] Continuing transcription after verification');
            await performTranscription();
          }
        }, 100);
      } else {
        console.warn('[ToolInterface] Verification failed:', data.error);
        showToast('error', 'Verification Failed', data.error || 'Please try again.');
        setShowTurnstile(false);
      }
    } catch (error) {
      console.error('[ToolInterface] Verification error:', error);
      showToast('error', 'Verification Error', 'Please try again.');
      setShowTurnstile(false);
    }
  };

  // 抽取实际的转录逻辑
  const performTranscription = async (preferredLanguage?: string) => {
    if (!isAuthenticated) {
      const now = Date.now();
      const token = sessionTokenRef.current;
      const expiry = sessionExpiryRef.current;
      const hasValidSession = token && (!expiry || now < expiry);

      if (!hasValidSession) {
        sessionTokenRef.current = null;
        sessionExpiryRef.current = 0;
        if (sessionToken) setSessionToken(null);
        if (sessionExpiry) setSessionExpiry(0);
        console.log('[ToolInterface] Missing or expired Turnstile session, requesting verification');
        pendingTranscriptionRef.current = { preferredLanguage };
        setShowTurnstile(true);
        return;
      }
    }

    if (pendingTranscriptionRef.current) {
      pendingTranscriptionRef.current = null;
    }

    setIsProcessing(true);  // 开启加载动画
    setProgress(t("progress.starting"));
    setResult(null);
    // 设置初始进度状态，显示进度条
    setProgressInfo({ 
      stage: 'process', 
      percentage: 0, 
      message: t("progress.starting") || 'Starting transcription...' 
    });
    setGeneratedChapters([]);
    setGeneratedSummary("");

    try {
      // Determine action based on authentication status
      const action = isAuthenticated ? "transcribe" : "preview";
      console.log(`Using action: ${action} (authenticated: ${isAuthenticated})`);
      
      let requestData: any;
      if (url) {
        // 检测URL类型
        const isYouTubeUrl = url.includes('youtube.com/watch') || 
                           url.includes('youtu.be/') || 
                           url.includes('youtube.com/shorts/') ||
                           url.includes('m.youtube.com/watch');
        
        const urlType = isYouTubeUrl ? "youtube_url" : "audio_url";
        
        const progressText = isYouTubeUrl 
          ? (action === "preview" ? t("progress.generating_preview") : t("progress.processing_youtube"))
          : (action === "preview" ? t("progress.generating_preview") : t("progress.processing_audio_url"));
        
        setProgress(progressText);
        // 更新进度条显示
        setProgressInfo({
          stage: 'download',
          percentage: 10,
          message: progressText
        });
        requestData = {
          type: urlType,
          content: url,
          action: action,
          options: { formats: selectedFormats }
        };
        // 向后端传递用户等级，以便控制诸如说话人分离等特性
        requestData.options.userTier = tier;
        if (canUseHighAccuracy && action === 'transcribe' && highAccuracy) {
          requestData.options.highAccuracyMode = true;
        }
        if (canUseDiarization && enableDiarizationAfterWhisper) {
          (requestData.options as any).enableDiarizationAfterWhisper = true;
        }
        // 已移除语言探针：仅在拿到模型结果后再判定是否显示中文润色提示
      } else if (uploadedFileInfo) {
        const progressText = action === "preview" 
          ? t("progress.generating_preview")
          : t("progress.processing_file");
        setProgress(progressText);
        if (!isAuthenticated) {
          // 匿名预览提示（速记）
          setProgress(`${progressText} · Anonymous preview limit: ${process.env.NEXT_PUBLIC_ANON_PREVIEW_DAILY_LIMIT || 10}/day · Max file size: 100MB`);
        }
        requestData = {
          type: "file_upload",
          content: uploadedFileInfo.publicUrl || uploadedFileInfo.replicateUrl,
          action: action,
          options: { 
            formats: selectedFormats, 
            r2Key: uploadedFileInfo.r2Key, 
            originalFileName: uploadedFileInfo.originalName  // 改为 originalFileName 以匹配后端
          }
        };
        requestData.options.userTier = tier;
        if (uploadedFileInfo.durationSec) {
          requestData.options.estimatedDurationSec = uploadedFileInfo.durationSec;
        }
        if (canUseHighAccuracy && action === 'transcribe' && highAccuracy) {
          requestData.options.highAccuracyMode = true;
        }
        if (canUseDiarization && enableDiarizationAfterWhisper) {
          (requestData.options as any).enableDiarizationAfterWhisper = true;
        }
        // 已移除语言探针：仅在拿到模型结果后再判定是否显示中文润色提示
      } else {
        setProgress(t("errors.wait_for_upload"));
        setIsProcessing(false);
        return;
      }

      // Add streamProgress flag for authenticated users
      if (isAuthenticated && requestData) {
        requestData.options = { ...requestData.options, streamProgress: true };
      }

      if (!isAuthenticated && requestData) {
        const anonSessionToken = sessionTokenRef.current;
        const anonExpiry = sessionExpiryRef.current;
        const sessionPayload: { sessionToken?: string } =
          anonSessionToken && (!anonExpiry || Date.now() < anonExpiry)
            ? { sessionToken: anonSessionToken }
            : {};

        requestData = {
          ...requestData,
          ...sessionPayload,
          ...(turnstileToken ? { turnstileToken } : {}),
        };

        console.log('[performTranscription] Using anonymous verification tokens', {
          hasSession: !!sessionPayload.sessionToken,
          hasTurnstile: !!turnstileToken,
          sessionPrefix: sessionPayload.sessionToken?.slice(0, 8) || null,
        });
      }

      // Add preferred language if provided
      console.log('[performTranscription] preferredLanguage:', preferredLanguage);
      if (preferredLanguage) {
        requestData.options = { ...requestData.options, preferred_language: preferredLanguage };
        console.log('[performTranscription] Added preferred_language to options:', requestData.options.preferred_language);
      }
      
      // Send request with SSE support for authenticated users
      let result: any = null;
      
      // Use async transcription for authenticated users
      if (isAuthenticated) {
        // Import async helper
        const { transcribeAsync } = await import('@/lib/async-transcribe');
        
        // Create abort controller for cancellation
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        try {
          result = await transcribeAsync(
            requestData,
            (stage, percentage, message, warning) => {
              const uiStage: 'upload' | 'download' | 'transcribe' | 'process' | null =
                stage === 'downloading' ? 'download' :
                stage === 'transcribing' ? 'transcribe' :
                stage === 'refining' ? 'process' : null;
              setProgressInfo({
                stage: uiStage,
                percentage,
                message,
                estimatedTime: uiStage === 'transcribe' ? '≈2m' : undefined
              });
              setProgress(message);
              
              // Handle staging warning
              if (warning === 'staging_failed') {
                showToast(
                  'warning',
                  t("warnings.staging_failed_title") || "Processing Notice",
                  t("warnings.staging_failed_message") || "The video is being processed through an alternative method. This may take slightly longer."
                );
              }
              
              // Store job ID if available for retry
              if (stage === 'processing' && (result as any)?.job_id) {
                setCurrentJobId((result as any).job_id);
              }
            },
            abortController.signal
          );
        } catch (error) {
          console.error('[Async Transcribe] Error:', error);
          const rawMessage = error instanceof Error ? error.message : 'Transcription failed';
          const errorType = getErrorType(error as Error);
          const errorCode = (error as any)?.errorCode || rawMessage;

          const defaultTitle = t("errors.transcription_failed_title") || "Transcription Failed";
          const retrySuggestion = t("errors.retry_suggestion") || "Click Retry to try again.";

          let displayTitle = defaultTitle;
          let displayMessage = rawMessage;
          let canRetry = errorType !== 'cancelled';

          if (errorCode === 'youtube_manual_upload_required') {
            displayTitle = t("errors.youtube_manual_upload_required_title") || "Manual Upload Needed";
            displayMessage = t("errors.youtube_manual_upload_required_message") 
              || "We couldn't download this YouTube video automatically. Please download it manually and upload the file for transcription.";
            canRetry = false;
          } else if (canRetry) {
            displayMessage = `${rawMessage}. ${retrySuggestion}`;
          }

          const dialogType = errorType === 'timeout' ? 'timeout'
            : errorType === 'server' ? 'server'
            : errorType === 'network' ? 'network'
            : 'api_error';

          setErrorState({
            type: dialogType,
            message: displayMessage,
            canRetry,
            retryAction: canRetry ? () => performTranscription(preferredLanguage) : undefined
          });

          showToast('error', displayTitle, displayMessage);

          setProgress("");
          setIsProcessing(false);
          setProgressInfo({ stage: null, percentage: 0, message: '' });
          return;
        } finally {
          abortControllerRef.current = null;
        }
      } else {
        // 未登录也走异步提交 + 轮询（供应商异步 + 回调）
        const { transcribeAsync } = await import('@/lib/async-transcribe');
        
        // Create abort controller for cancellation
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        try {
          result = await transcribeAsync(
            requestData,
            (stage, percentage, message, warning) => {
              const uiStage: 'upload' | 'download' | 'transcribe' | 'process' | null =
                stage === 'downloading' ? 'download' :
                stage === 'transcribing' ? 'transcribe' :
                stage === 'refining' ? 'process' : null;
              setProgressInfo({
                stage: uiStage,
                percentage,
                message,
                estimatedTime: uiStage === 'transcribe' ? '≈2m' : undefined
              });
              setProgress(message);
              
              // Handle staging warning
              if (warning === 'staging_failed') {
                showToast(
                  'warning',
                  t("warnings.staging_failed_title") || "Processing Notice",
                  t("warnings.staging_failed_message") || "The video is being processed through an alternative method. This may take slightly longer."
                );
              }
              
              // Store job ID if available for retry
              if (stage === 'processing' && (result as any)?.job_id) {
                setCurrentJobId((result as any).job_id);
              }
            },
            abortController.signal
          );
        } catch (error) {
          console.error('[Async Transcribe Anon] Error:', error);
          const rawMessage = error instanceof Error ? error.message : 'Transcription failed';
          const errorType = getErrorType(error as Error);
          const errorCode = (error as any)?.errorCode || rawMessage;

          const defaultTitle = t("errors.transcription_failed_title") || "Transcription Failed";
          const retrySuggestion = t("errors.retry_suggestion") || "Click Retry to try again.";

          let displayTitle = defaultTitle;
          let displayMessage = rawMessage;
          let canRetry = errorType !== 'cancelled';

          if (errorCode === 'youtube_manual_upload_required') {
            displayTitle = t("errors.youtube_manual_upload_required_title") || "Manual Upload Needed";
            displayMessage = t("errors.youtube_manual_upload_required_message") 
              || "We couldn't download this YouTube video automatically. Please download it manually and upload the file for transcription.";
            canRetry = false;
          } else if (canRetry) {
            displayMessage = `${rawMessage}. ${retrySuggestion}`;
          }

          const dialogType = errorType === 'timeout' ? 'timeout'
            : errorType === 'server' ? 'server'
            : errorType === 'network' ? 'network'
            : 'api_error';

          setErrorState({
            type: dialogType,
            message: displayMessage,
            canRetry,
            retryAction: canRetry ? () => performTranscription(preferredLanguage) : undefined
          });

          showToast('error', displayTitle, displayMessage);

          setProgress("");
          setIsProcessing(false);
          setProgressInfo({ stage: null, percentage: 0, message: '' });
          return;
        } finally {
          abortControllerRef.current = null;
        }
      }

      if (result.success && result.data) {
        try {
          const lang = result.data?.transcription?.language as string;
          const raw = result.data?.transcription?.text as string;
          const isZh = (lang && lang.toLowerCase().includes('zh')) || /[\u4e00-\u9fff]/.test(raw || '');
          if (isZh) showChineseToast(); else setShowChineseUpgrade(false);
        } catch {}
        setResult({ type: "full", data: result.data });
        // Set audio URL for editor view
        if (uploadedFileInfo?.publicUrl) {
          setAudioUrl(uploadedFileInfo.publicUrl);
        } else if (uploadedFileInfo?.replicateUrl) {
          setAudioUrl(uploadedFileInfo.replicateUrl);
        } else if (url) {
          setAudioUrl(url);
        }
        setProgress(t("progress.completed"));
        setShowSuccess(true);
        // Clear progress bar after completion
        setTimeout(() => {
          setProgressInfo({ stage: null, percentage: 0, message: '' });
        }, 1000);
      } else if (result.success && result.preview) {
        try {
          const lang = (result.preview as any)?.language as string;
          const raw = (result.preview as any)?.text as string;
          const isZh = (lang && lang.toLowerCase().includes('zh')) || /[\u4e00-\u9fff]/.test(raw || '');
          if (isZh) showChineseToast(); else setShowChineseUpgrade(false);
        } catch {}
        setResult({ type: "preview", data: result.preview, authRequired: result.authRequired });
        setProgress(t("progress.preview_ready"));
      } else if (result?.success && !result?.data && !result?.preview) {
        setProgress('Received empty success response. Please try again or refresh.');
      } else {
        console.error('Transcription API error:', result.error);
        let userFriendlyError = '';
        
        if (result.error.includes('null response')) {
          userFriendlyError = 'The audio file appears to be invalid or corrupted. Please try uploading a valid audio/video file.';
        } else if (result.error.includes('No transcription content')) {
          userFriendlyError = 'No speech was detected in the file. Please ensure your audio contains clear speech.';
        } else if (result.error.includes('Invalid YouTube URL')) {
          userFriendlyError = 'Invalid YouTube URL. Please check the URL format and try again.';
        } else if (result.error.includes('Unable to access URL')) {
          userFriendlyError = 'Cannot access the audio URL. The file may not exist, require authentication, or the link may have expired.';
        } else if (result.error.includes('Unsupported content type')) {
          userFriendlyError = 'Unsupported file format. Please use MP3, WAV, OGG, AAC, M4A, or FLAC files.';
        } else if (result.error.includes('File too large')) {
          userFriendlyError = 'Audio file is too large. Please use files smaller than 100MB.';
        } else if (result.error.includes('timeout')) {
          userFriendlyError = 'Request timeout. The audio file may be too large or the connection is slow. Please try again.';
        } else {
          // Check if error contains "Upgrade" to make it a link
          if (result.error.includes('Upgrade')) {
            // Parse the error message to make "Upgrade" clickable
            const errorParts = result.error.split('Upgrade');
            setProgress(
              <span>
                {`Transcription failed: ${errorParts[0]}`}
                <Link href="/pricing" className="text-blue-400 hover:text-blue-300 underline">
                  Upgrade
                </Link>
                {errorParts[1] || ''}
              </span>
            );
          } else {
            userFriendlyError = `Transcription failed: ${result.error}`;
            setProgress(userFriendlyError);
          }
        }
      }
    } catch (error) {
      console.error("Transcription error:", error);
      
      // Show user-friendly error with retry suggestion
      const errorMessage = error instanceof Error ? error.message : t("errors.general_error");
      showToast(
        'error',
        t("errors.transcription_failed_title") || "Transcription Failed",
        `${errorMessage}. ${t("errors.please_try_again") || "Please try again."}`
      );
      
      // Reset all UI states to allow retry
      setProgress("");
      setProgressInfo({ stage: null, percentage: 0, message: '' });
    } finally {
      // Always reset processing state to re-enable the button
      setIsProcessing(false);
    }
  };

  const extractFileNameFromUrl = (value?: string | null): string => {
    if (!value) return '';
    try {
      const url = new URL(value);
      const parts = url.pathname.split('/');
      return decodeURIComponent(parts.filter(Boolean).pop() || '');
    } catch {
      return '';
    }
  };

  const stripExtension = (name: string): string => {
    if (!name) return '';
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) return name;
    return name.substring(0, lastDot);
  };

  const sanitizeFileBase = (name: string): string => {
    if (!name) return '';
    return name
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim();
  };

  const resolveDownloadBaseName = (): string => {
    const transcription = result?.data?.transcription || {};
    const detectedSourceType = transcription.source_type || result?.data?.sourceType;
    const sourceType = detectedSourceType || (uploadedFileInfo ? 'file_upload' : '');
    const videoTitle = result?.data?.videoInfo?.title || '';
    const transcriptionTitle = transcription.title || '';
    const urlDerived = extractFileNameFromUrl(transcription.source_url || audioUrl || '');
    const uploadName = uploadedFileInfo?.originalName || '';

    if (sourceType === 'file_upload') {
      const urlName = urlDerived;
      const titleName = transcriptionTitle;

      const preferred = uploadName || urlName || titleName;
      const base = stripExtension(preferred) || titleName || urlName;
      const sanitized = sanitizeFileBase(base || 'transcription') || 'transcription';
      return sanitized;
    }

    const baseCandidate = videoTitle || transcriptionTitle || stripExtension(urlDerived) || urlDerived;
    const sanitized = sanitizeFileBase(baseCandidate || 'transcription');
    return sanitized || 'transcription';
  };

  const buildDownloadFileName = (format: string): string => {
    const cleanFormat = (format || '').replace(/^\./, '').toLowerCase();
    const base = resolveDownloadBaseName();
    return `${base}.${cleanFormat || 'txt'}`;
  };

  const fetchAndDownload = async (url: string, fallbackName: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download_failed_${res.status}`);
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const filename = m ? decodeURIComponent(m[1]) : fallbackName;
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(obj);
  };

  const downloadFormat = async (format: string) => {
    if (!result?.data || result.type !== 'full') return;

    // Set loading state for this format
    setDownloadingFormats(prev => ({ ...prev, [format]: true }));

    try {
      const jobId = result.data.jobId as string | undefined;
      if (jobId) {
        // 统一走后端导出（Free 自动裁到 5 分钟并去 speaker）
        await fetchAndDownload(`/api/transcriptions/${jobId}/file?format=${format}`, buildDownloadFileName(format));
        return;
      }
      // 无 jobId（极少），前端兜底
      let content = result.data.formats[format];
      // Enforce Free preview trimming when falling back client-side
      if (isFreeTier) {
        const maxSec = 300;
        const orig = result.data.transcription;
        const trimmedSegments = (orig.segments || [])
          .filter((s: any) => s.start < maxSec)
          .map((s: any) => ({ ...s, end: Math.min(s.end, maxSec) }));
        if (format === 'srt' || format === 'vtt') {
          // Best-effort line/time trimming on existing content
          const str = String(content || '');
          if (format === 'srt') {
            const blocks = str.split(/\n\n+/);
            const kept: string[] = [];
            for (const b of blocks) {
              const lines = b.split(/\n/);
              const timeLine = lines.find(l => l.includes('-->')) || '';
              const endMatch = timeLine.match(/-->\s*(\d{2}:\d{2}:\d{2})[,.](\d{3})/);
              let keep = true;
              if (endMatch) {
                const [hh, mm, ss] = endMatch[1].split(':').map(Number);
                const endSec = hh * 3600 + mm * 60 + ss;
                keep = endSec <= maxSec;
              }
              if (keep) kept.push(b);
            }
            content = kept.join('\n\n');
          } else {
            const lines = str.split(/\n/);
            const out: string[] = [];
            for (let i = 0; i < lines.length; i++) {
              const ln = lines[i];
              const m = ln.match(/(\d{2}:\d{2}:\d{2})\.(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2})\.(\d{3})/);
              if (m) {
                const [hh, mm, ss] = m[3].split(':').map(Number);
                const endSec = hh * 3600 + mm * 60 + ss;
                if (endSec > maxSec) break;
              }
              out.push(ln);
            }
            content = out.join('\n');
          }
        } else if (format === 'json') {
          try {
            const obj = JSON.parse(String(content || '{}'));
            obj.segments = trimmedSegments;
            obj.duration = Math.min(orig.duration || maxSec, maxSec);
            delete obj.speakers;
            content = JSON.stringify(obj, null, 2);
          } catch {
            const obj = { text: trimmedSegments.map((s: any) => s.text).join(' '), segments: trimmedSegments, duration: Math.min(orig.duration || maxSec, maxSec) };
            content = JSON.stringify(obj, null, 2);
          }
        } else if (format === 'txt' || format === 'md') {
          const txt = trimmedSegments.length > 0 ? trimmedSegments.map((s: any) => s.text).join(' ') : (orig.text || '');
          content = txt;
        }
      }
      const fileName = buildDownloadFileName(format);
      const blob = new Blob([content], { type: getContentType(format) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      // Clear loading state for this format
      setDownloadingFormats(prev => ({ ...prev, [format]: false }));
    }
  };

  const downloadPreview = async () => {
    if (!result?.data || result.type !== 'preview') return;
    try {
      const previewMarker = `[PREVIEW - First 5 minutes only]\n[完整版预览 - 仅前5分钟]\n\n`;
      const watermark = `\n\n---\n[This is a preview of the first 5 minutes. Sign in for full transcription.]\n[这是前5分钟的预览。登录以获取完整转录。]`;
      const content = previewMarker + (result.data.text || '') + watermark;
      const resp = await fetch('/api/preview/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: content, filename: 'preview_5min' }) });
      if (!resp.ok) throw new Error('download_failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'preview_5min.txt'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Preview download error:', error);
    }
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const getContentType = (format: string): string => {
    const contentTypes: Record<string, string> = {
      txt: 'text/plain',
      srt: 'application/x-subrip',
      vtt: 'text/vtt',
      json: 'application/json',
      md: 'text/markdown'
    };
    return contentTypes[format] || 'text/plain';
  };

  const getAcceptTypes = () => (mode === "video" 
    ? ".mp4,.mov,.webm,.avi,video/mp4,video/quicktime,video/webm,video/x-msvideo" 
    : ".mp3,.m4a,.mp4,.wav,.ogg,.flac,audio/mpeg,audio/mp3,audio/mp4,video/mp4,audio/m4a,audio/wav,audio/ogg,audio/flac,audio/x-m4a,audio/webm");

  const getPlaceholder = () =>
    mode === "video"
      ? t("url_placeholder")
      : t("audio_url_placeholder");

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    // 保留2位小数，但如果是整数则不显示小数
    const formatted = value % 1 === 0 ? value.toString() : value.toFixed(2);
    return formatted + ' ' + sizes[i];
  };

  // Estimate upload time based on file size (assume 5 Mbps upload speed)
  const estimateUploadTime = (fileSize: number): string => {
    const uploadSpeedBytesPerSecond = 5 * 1024 * 1024 / 8; // 5 Mbps = 0.625 MB/s
    const seconds = Math.ceil(fileSize / uploadSpeedBytesPerSecond);
    
    if (seconds < 60) {
      return `~${seconds}s`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `~${minutes}m ${remainingSeconds}s` : `~${minutes}m`;
    }
  };

  // Estimate remaining upload time based on progress
  const estimateRemainingUploadTime = (loaded: number, total: number, elapsedMs: number): string => {
    if (loaded === 0 || elapsedMs === 0) return 'Calculating...';
    
    const uploadSpeed = loaded / (elapsedMs / 1000); // bytes per second
    const remaining = total - loaded;
    let secondsRemaining = Math.ceil(remaining / uploadSpeed);
    
    // 加上服务器处理时间的估算（约10秒）
    if (loaded / total > 0.8) {
      secondsRemaining += 10; // 接近完成时，加上R2上传时间
    }
    
    if (secondsRemaining < 60) {
      return `~${secondsRemaining}s`;
    } else {
      const minutes = Math.floor(secondsRemaining / 60);
      const seconds = secondsRemaining % 60;
      return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
    }
  };

  // Format duration from seconds to human-readable format
  const formatDuration = (seconds: number): string => {
    const totalSeconds = Math.round(seconds);
    
    if (totalSeconds < 60) {
      return `${totalSeconds} seconds`;
    } else if (totalSeconds < 3600) {
      const minutes = Math.floor(totalSeconds / 60);
      const remainingSeconds = totalSeconds % 60;
      if (remainingSeconds === 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      }
      return `${minutes}min ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const remainingSeconds = totalSeconds % 60;
      
      let result = `${hours}h`;
      if (minutes > 0) result += ` ${minutes}min`;
      if (remainingSeconds > 0 && minutes === 0) result += ` ${remainingSeconds}s`;
      
      return result;
    }
  };

  // Build visualizer bars once with stable heights for SSR
  const bars = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    height: 30 + (i % 20), // 预定义高度避免SSR不匹配
    delay: i * 0.06
  })), []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visualizerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Performance optimization: Pause animations when not visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
          // Pause/resume CSS animations
          if (entry.isIntersecting) {
            container.style.animationPlayState = 'running';
            container.querySelectorAll('*').forEach((el) => {
              if (el instanceof HTMLElement) {
                el.style.animationPlayState = 'running';
              }
            });
          } else {
            container.style.animationPlayState = 'paused';
            container.querySelectorAll('*').forEach((el) => {
              if (el instanceof HTMLElement) {
                el.style.animationPlayState = 'paused';
              }
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Elastic/parallax effect for the whole upload container on hover
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isVisible) return;

    let isHovering = false;
    let rect = container.getBoundingClientRect();
    let raf: number | null = null;

    const onResize = () => {
      rect = container.getBoundingClientRect();
    };

    let lastMoveTime = 0;
    const throttleMs = 32; // ~30fps instead of 60fps
    
    const onMouseMove = (e: MouseEvent) => {
      if (!isHovering) return;
      
      const now = Date.now();
      if (now - lastMoveTime < throttleMs) return;
      lastMoveTime = now;
      
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 400;
        const strength = Math.min(distance / maxDistance, 1);
        const translateX = dx * 0.008 * strength;  // 减小位移：0.015 -> 0.008
        const translateY = dy * 0.008 * strength;  // 减小位移：0.015 -> 0.008
        const rotateX = -(dy * 0.004) * strength;  // 减小倾斜：0.008 -> 0.004
        const rotateY = (dx * 0.004) * strength;   // 减小倾斜：0.008 -> 0.004
        const scale = 1 + strength * 0.005;        // 减小缩放：0.008 -> 0.005
        container.style.transform = `perspective(1200px) translate(${translateX}px, ${translateY}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
      });
    };

    const onEnter = () => {
      isHovering = true;
      rect = container.getBoundingClientRect();
      container.style.transition = "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      window.addEventListener("mousemove", onMouseMove);
    };

    const onLeave = () => {
      isHovering = false;
      if (raf) cancelAnimationFrame(raf);
      container.style.transition = "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      container.style.transform = "perspective(1200px) translate(0, 0) rotateX(0) rotateY(0) scale(1)";
      window.removeEventListener("mousemove", onMouseMove);
    };

    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".upload-zone, .url-input, button")) return;
      container.style.transition = "transform 0.1s ease";
      container.style.transform = "perspective(1200px) scale(0.995)";
    };
    const onUp = () => {
      container.style.transition = "transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      container.style.transform = "perspective(1200px) scale(1)";
    };

    window.addEventListener("resize", onResize);
    container.addEventListener("mouseenter", onEnter);
    container.addEventListener("mouseleave", onLeave);
    container.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("resize", onResize);
      container.removeEventListener("mouseenter", onEnter);
      container.removeEventListener("mouseleave", onLeave);
      container.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  // Interactive visualizer reactions (hover changes bar heights)
  useEffect(() => {
    const visualizer = visualizerRef.current;
    if (!visualizer) return;
    const onEnter = () => {
      const barElements = visualizer.querySelectorAll(".audio-bar") as NodeListOf<HTMLDivElement>;
      barElements.forEach((bar, i) => {
        // 使用基于索引的伪随机值确保一致性
        const height = 20 + (i * 7 % 40) + (i % 3 === 0 ? 10 : 0);
        bar.style.height = `${height}px`;
        bar.style.transitionDelay = `${i * 0.01}s`;
      });
    };
    const onLeave = () => {
      const barElements = visualizer.querySelectorAll(".audio-bar") as NodeListOf<HTMLDivElement>;
      barElements.forEach((bar, i) => {
        // 使用原始的预定义高度
        bar.style.height = `${30 + (i % 20)}px`;
        bar.style.transitionDelay = `${i * 0.01}s`;
      });
    };
    visualizer.addEventListener("mouseenter", onEnter);
    visualizer.addEventListener("mouseleave", onLeave);
    return () => {
      visualizer.removeEventListener("mouseenter", onEnter);
      visualizer.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // drag & drop handlers
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange({ target: { files } });
    }
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove("dragover");
  };

  // Spotlight effect: update CSS vars for radial gradient center
  const onMouseMoveZone = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    (e.currentTarget as HTMLDivElement).style.setProperty('--mx', x + '%');
    (e.currentTarget as HTMLDivElement).style.setProperty('--my', y + '%');
  };

  // Only expose formats supported by backend to keep functionality unchanged
  const formats = useMemo(() => (
    [
      { id: "txt", label: t("formats.txt"), icon: FileText },
      { id: "srt", label: t("formats.srt"), icon: Download },
      { id: "vtt", label: t("formats.vtt"), icon: Download },
      { id: "md", label: t("formats.md"), icon: FileText },
      { id: "json", label: t("formats.json"), icon: Code },
    ]
  ), [t]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Main Tool Interface - Styled to match provided design, behavior unchanged */}
      <div className="upload-container" ref={containerRef}>
        {/* Audio visualizer */}
        <div className="audio-visualizer" ref={visualizerRef}>
          {bars.map((bar, i) => (
            <div 
              key={i} 
              className="audio-bar" 
              style={{ 
                '--bar-height': `${bar.height}px`,
                height: `${bar.height}px`,
                animationDelay: `${bar.delay}s` 
              } as React.CSSProperties} 
            />
          ))}
        </div>

        {/* Upload Zone */}
        <div className="relative">
          <div
            className={`upload-zone ${url ? 'disabled' : ''}`}
            onDrop={url ? undefined : onDrop}
            onDragOver={url ? undefined : onDragOver}
            onDragLeave={url ? undefined : onDragLeave}
            onMouseMove={url ? undefined : onMouseMoveZone}
            onClick={() => !url && fileInputRef.current?.click()}
            style={{ 
              opacity: url ? 0.5 : 1,
              cursor: url ? 'not-allowed' : 'pointer'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={getAcceptTypes()}
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <div className="upload-icon">📊</div>
            <div className="upload-title">
              {url ? t("upload_disabled_url") : file ? t("click_to_replace") : t("upload_tip")}
            </div>
            <div className="upload-desc">
              {file ? `${file.name} • ${(file.size / (1024 * 1024)).toFixed(1)} MB` : t(mode === "video" ? "supported_formats_video" : "supported_formats_audio")}
            </div>
          </div>
          
          {/* Clear file button - as a small X icon in corner */}
          {file && !url && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                
                // 如果有正在进行的上传，中断它
                if (uploadXhrRef.current) {
                  isAbortingRef.current = true; // 标记为主动中断
                  uploadXhrRef.current.abort();
                  uploadXhrRef.current = null;
                }
                
                setFile(null);
                setUploadedFileInfo(null);
                setUrl("");
                setResult(null);
                setProgress("");
                setProgressInfo({ stage: null, percentage: 0, message: '' });
                setUploadProgress(0);
                // 重置文件输入框的值，这样可以重新选择同一个文件
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
              type="button"
              aria-label={t("clear_file")}
            >
              ×
            </button>
          )}
        </div>

        {/* Subtle separator (remove heavy divider) */}
        <p className="my-4 text-center text-sm opacity-80">{t("or")}</p>

        {/* URL input */}
        <div className="url-section" style={{ opacity: file ? 0.5 : 1 }}>
          <div className="relative">
            <input
              type="text"
              className="url-input"
              placeholder={file ? t("url_disabled_file") : getPlaceholder()}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (e.target.value) {
                  setFile(null); // Clear file when URL is entered
                  setUploadedFileInfo(null); // Clear upload info
                  setResult(null); // Clear previous results
                  setProgressInfo({ stage: null, percentage: 0, message: '' });
                }
              }}
              disabled={!!file} // Disable URL input when file is selected
              style={{ cursor: file ? 'not-allowed' : 'text', paddingRight: url ? '60px' : '16px' }}
            />
            {url && !file && (
              <button
                onClick={() => {
                  setUrl("");
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 text-sm"
                type="button"
              >
                {t("clear")}
              </button>
            )}
          </div>
          <div className="url-help-text">
            <span className="text-xs text-gray-400">{t(mode === "video" ? "url_help_text_video" : "url_help_text_audio")}</span>
            <span className="text-xs text-gray-500 ml-2">•</span>
            <span className="text-xs text-gray-500 ml-2">{t("url_not_supported")}</span>
          </div>
        </div>

        {/* Export Format Selection */}
        <div className="format-section">
          <div className="format-label">{t("export_formats")}</div>
          <div className="format-grid">
            {formats.map((format) => (
              <div
                key={format.id}
                role="button"
                aria-pressed={selectedFormats.includes(format.id)}
                className={`format-chip ${selectedFormats.includes(format.id) ? "selected" : ""}`}
                onClick={(e) => {
                  handleFormatToggle(format.id);
                  // Add a lightweight ripple
                  const target = e.currentTarget as HTMLElement;
                  const rect = target.getBoundingClientRect();
                  const ripple = document.createElement("span");
                  const size = Math.max(rect.width, rect.height);
                  ripple.style.position = "absolute";
                  ripple.style.width = ripple.style.height = `${size}px`;
                  ripple.style.left = `${(e.clientX - rect.left) - size / 2}px`;
                  ripple.style.top = `${(e.clientY - rect.top) - size / 2}px`;
                  ripple.style.borderRadius = "50%";
                  ripple.style.background = "rgba(255,255,255,0.5)";
                  ripple.style.pointerEvents = "none";
                  ripple.style.animation = "ripple 0.6s ease-out";
                  target.style.position = "relative";
                  target.style.overflow = "hidden";
                  target.appendChild(ripple);
                  setTimeout(() => ripple.remove(), 600);
                }}
              >
                <span className={`fmt-icon fmt-${format.id}`}>
                  <format.icon className="fmt-icon-svg" />
                </span>
                {format.label}
              </div>
            ))}
          </div>
        </div>

        {/* Advanced Options Section */}
        <div className="advanced-options-section">
          <h3 className="advanced-options-title">Advanced Options</h3>
          <div className="advanced-options-grid">
            {/* High Accuracy Toggle */}
            <div className="high-accuracy-container">
              <div
                className={`high-accuracy-toggle ${highAccuracy ? 'active' : ''} ${!canUseHighAccuracy ? 'locked' : ''}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.classList.contains('toggle-link') || target.closest('.toggle-link')) {
                    return;
                  }

                  if (!canUseHighAccuracy) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }

                  setHighAccuracy(!highAccuracy);
                }}
                role="button"
                aria-pressed={highAccuracy}
                aria-label={t('high_accuracy.label')}
                style={{ cursor: canUseHighAccuracy ? 'pointer' : 'default' }}
              >
                <div
                  className="toggle-switch"
                  onClick={(e) => {
                    if (!canUseHighAccuracy) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={highAccuracy}
                    onChange={() => {}}
                    disabled={!canUseHighAccuracy}
                    style={{ display: 'none' }}
                  />
                  <div className="toggle-slider">
                    <div className="toggle-handle" />
                  </div>
                </div>
                <div className="toggle-content">
                  <span className="toggle-icon">{canUseHighAccuracy ? '✨' : '🔒'}</span>
                  <div className="toggle-text">
                    <span className="toggle-label">{t('high_accuracy.label')}</span>
                    <span className="toggle-hint">
                      {canUseHighAccuracy ? t('high_accuracy.speed_hint') : 'Pro plan required'}
                    </span>
                  </div>
                  {!canUseHighAccuracy && (
                    <a
                      className="toggle-link upgrade-link"
                      href="/pricing"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push('/pricing');
                      }}
                    >
                      {t('high_accuracy.pricing_link')}
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Speaker Diarization Toggle */}
            <div className="high-accuracy-container">
              <div
                className={`high-accuracy-toggle ${enableDiarizationAfterWhisper ? 'active' : ''} ${!canUseDiarization ? 'locked' : ''}`}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.classList.contains('toggle-link') || target.closest('.toggle-link')) {
                    return;
                  }

                  if (!canUseDiarization) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }

                  setEnableDiarizationAfterWhisper(prev => !prev);
                }}
                role="button"
                aria-pressed={enableDiarizationAfterWhisper}
                aria-label="Speaker diarization"
                style={{ cursor: canUseDiarization ? 'pointer' : 'default' }}
              >
                <div
                  className="toggle-switch"
                  onClick={(e) => {
                    if (!canUseDiarization) {
                      e.stopPropagation();
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enableDiarizationAfterWhisper}
                    onChange={() => {}}
                    disabled={!canUseDiarization}
                    style={{ display: 'none' }}
                  />
                  <div className="toggle-slider">
                    <div className="toggle-handle" />
                  </div>
                </div>
                <div className="toggle-content">
                  <span className="toggle-icon">{canUseDiarization ? '🗣️' : '🔒'}</span>
                  <div className="toggle-text">
                    <span className="toggle-label">Speaker diarization</span>
                    <span className="toggle-hint">
                      {canUseDiarization
                        ? 'Identify speakers with Deepgram diarization'
                        : diarizationTierEligible
                          ? 'Sign in to enable speaker identification'
                          : 'Basic plan or higher required'}
                    </span>
                  </div>
                  {!canUseDiarization && (
                    <a
                      className="toggle-link upgrade-link"
                      href="/pricing"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push('/pricing');
                      }}
                    >
                      {t('high_accuracy.pricing_link')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="balloon-button-container">
          <button
            className="balloon-button"
            onClick={handleTranscribe}
            disabled={isProcessing}
            style={{ opacity: isProcessing ? 0.7 : 1 }}
          >
            {isProcessing ? t("processing") : t("start_transcription")}
          </button>
        </div>

        {/* Social proof under primary action */}
        {!isProcessing && (
          <div className="mt-2 text-center text-xs text-muted-foreground">
            {t("social_proof")}
          </div>
        )}

        {/* Chinese detection toast - Disabled */}

        {progress && (
          <div className="mt-8 flex flex-col items-center space-y-6 p-6 rounded-lg" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)" }}>
            {isProcessing && <PyramidLoader size="medium" />}
            
            {/* Progress Bar */}
            {progressInfo.stage && progressInfo.percentage > 0 && (
              <div className="w-full max-w-md space-y-3">
                <div className="flex justify-between text-sm" style={{ color: "#94A3B8" }}>
                  <span>{progressInfo.message}</span>
                  <span className="flex items-center gap-2">
                    <span>{progressInfo.percentage.toFixed(2)}%</span>
                    {progressInfo.estimatedTime && (
                      <span className="text-xs opacity-75">(Est. {progressInfo.estimatedTime})</span>
                    )}
                  </span>
                </div>
                <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "rgba(30,41,59,0.5)" }}>
                  <div 
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: `${progressInfo.percentage}%`,
                      background: "linear-gradient(90deg, #3B82F6, #A855F7)"
                    }}
                  >
                    <div className="absolute inset-0 opacity-30" style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                      animation: "shimmer 2s infinite"
                    }} />
                  </div>
                </div>
                {progressInfo.estimatedTime && (
                  <div className="text-center text-xs" style={{ color: "#64748B" }}>
                    Estimated time remaining: {progressInfo.estimatedTime}
                  </div>
                )}
              </div>
            )}
            
            <p className="text-sm text-center" style={{ color: "#BFDBFE" }}>{progress}</p>
          </div>
        )}

        {/* Results Display */}
          {result && result.type === 'full' && result.data && (
            <>
            {/* Simple Action Button */}
            {result.data.transcription.segments && result.data.transcription.segments.length > 0 && (
              <div className="mt-12 mb-8">
                {isAuthenticated ? (
                  <>
                    {/* Single primary action */}
                    {result.data.jobId && (
                      <div className="text-center">
                        <button
                          onClick={() => {
                            setIsNavigatingToEditor(true);
                            router.push(`/${locale}/dashboard/editor/${result.data.jobId}`);
                          }}
                          disabled={isNavigatingToEditor}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-70 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                        >
                          {isNavigatingToEditor ? (
                            <>
                              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>{t('loading')}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span>{t('edit_transcription')}</span>
                              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 px-6 bg-gray-800/20 rounded-xl border border-gray-700/50">
                    <p className="text-gray-400 mb-4">{t('sign_in_to_access_features')}</p>
                    <button
                      onClick={() => router.push('/auth/signin')}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:opacity-90 transition-all hover:scale-105 font-medium"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      {t('sign_in_to_save')}
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Three Column Editor - Shows when in editor mode */}
            {viewMode === 'editor' && result.data.transcription.segments && (
              <div className="mt-4 -mx-12 px-4">
                <ThreeColumnEditor
                  audioUrl={audioUrl || uploadedFileInfo?.publicUrl || uploadedFileInfo?.replicateUrl}
                  segments={result.data.transcription.segments || []}
                  chapters={generatedChapters.length > 0 ? generatedChapters : [
                    {
                      id: 'full',
                      title: 'Full Transcription',
                      startTime: 0,
                      endTime: result.data.transcription.duration || 60,
                      segments: result.data.transcription.segments
                    }
                  ]}
                  transcription={result.data.transcription}
                  onClose={() => setViewMode('simple')}
                />
              </div>
            )}
            
            {/* Main Content - Only visible in simple view */}
            {viewMode === 'simple' && (
              <div className="mt-4 space-y-4">
              <div className="p-4 rounded-lg" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <h3 className="font-semibold mb-4" style={{ color: "#D1FAE5" }}>
                  {t("results.transcription_complete")}
                </h3>
                
                <div className="space-y-4">
                  {/* Early banner moved to progress area; no banner here */}
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">{t("results.language")}</span> {result.data.transcription.language}
                    </div>
                    <div>
                      <span className="font-medium">{t("results.duration")}</span> {formatDuration(result.data.transcription.duration)}
                    </div>
                  </div>

                  {/* Transcription Text */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium" style={{ color: "#A7F3D0" }}>{t("results.transcription_text")}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(displayText || result.data.transcription.text)}
                        className=""
                      >
                        {copiedText ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            {t("results.copied")}
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-1" />
                            {t("results.copy")}
                          </>
                        )}
                      </Button>
                      {/* AI refine button removed: backend runs optional refine automatically */}
                    </div>
                    <div className="p-4 rounded-lg max-h-60 overflow-y-auto" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.25)" }}>
                      {displayText.split('\n\n').map((p, i) => (
                        <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap mb-2">{p}</p>
                      ))}
                    </div>
                  </div>

                  {/* Segments with Timestamps - Organized by Chapters if available */}
                  {result.data.transcription.segments && result.data.transcription.segments.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium" style={{ color: "#A7F3D0" }}>
                          {generatedChapters.length > 0 ? t("results.chapters_with_timestamps") : t("results.timestamped_segments")}
                        </h4>
                        <button
                          onClick={() => {
                            let segmentsText = '';
                            
                            if (generatedChapters.length > 0) {
                              // Export with chapter organization
                              generatedChapters.forEach((chapter) => {
                                const chapterTime = `${Math.floor(chapter.startTime / 60)}:${String(Math.floor(chapter.startTime % 60)).padStart(2, '0')}`;
                                segmentsText += `\n=== ${chapterTime} - ${chapter.title} ===\n`;
                                
                                chapter.segments?.forEach((seg: any) => {
                                  const startTime = `${Math.floor(seg.start / 60).toString().padStart(2, '0')}:${(seg.start % 60).toFixed(3).padStart(6, '0')}`;
                                  const endTime = `${Math.floor(seg.end / 60).toString().padStart(2, '0')}:${(seg.end % 60).toFixed(3).padStart(6, '0')}`;
                                  const speakerLabel = enableDiarizationAfterWhisper && seg?.speaker != null && String(seg.speaker).trim() !== ''
                                    ? `${formatSpeakerLabel(seg.speaker)}: `
                                    : '';
                                  segmentsText += `[${startTime} - ${endTime}] ${speakerLabel}${seg.text}\n`;
                                });
                              });
                            } else {
                              // Export flat segments
                              const segments = result.data.transcription.segments || [];
                              segmentsText = segments.map((seg: any) => {
                                const startTime = `${Math.floor(seg.start / 60).toString().padStart(2, '0')}:${(seg.start % 60).toFixed(3).padStart(6, '0')}`;
                                const endTime = `${Math.floor(seg.end / 60).toString().padStart(2, '0')}:${(seg.end % 60).toFixed(3).padStart(6, '0')}`;
                                const speakerLabel = enableDiarizationAfterWhisper && seg?.speaker != null && String(seg.speaker).trim() !== ''
                                  ? `${formatSpeakerLabel(seg.speaker)}: `
                                  : '';
                                return `[${startTime} - ${endTime}] ${speakerLabel}${seg.text}`;
                              }).join('\n');
                            }
                            
                            navigator.clipboard.writeText(segmentsText);
                            setCopiedSegments(true);
                            setTimeout(() => setCopiedSegments(false), 2000);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-all hover:bg-white/10"
                          style={{ color: copiedSegments ? '#10b981' : '#9ca3af' }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>{copiedSegments ? t("results.copied") : t("results.copy")}</span>
                        </button>
                      </div>
                      <div className="p-4 rounded-lg max-h-96 overflow-y-auto" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.25)" }}>
                        <div className="space-y-4">
                          {(() => {
                            const lang = result.data.transcription.language as string | undefined;
                            const rawText = result.data.transcription.text as string;
                            const segments = (result.data.transcription.segments || []) as Segment[];
                            const isZh = isChineseLangOrText(lang, rawText);
                            
                            // If we have chapters, organize segments by chapters
                            if (generatedChapters.length > 0) {
                              return generatedChapters.map((chapter, chapterIdx) => (
                                <div 
                                  key={chapterIdx} 
                                  id={`chapter-${chapterIdx}`}
                                  className="chapter-section p-3 rounded-lg transition-all"
                                  style={{ 
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(168,85,247,0.1)'
                                  }}
                                >
                                  {/* Chapter Header */}
                                  <div className="flex items-start gap-3 mb-3 pb-2" style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
                                    <span className="text-sm font-medium" style={{ color: '#a855f7', minWidth: '60px' }}>
                                      {Math.floor(chapter.startTime / 60)}:{String(Math.floor(chapter.startTime % 60)).padStart(2, '0')}
                                    </span>
                                    <span className="text-sm font-semibold flex-1" style={{ color: '#e2e8f0' }}>
                                      {chapter.title}
                                    </span>
                                  </div>
                                  
                                  {/* Chapter Segments */}
                                  <div className="space-y-2 pl-4">
                                    {chapter.segments?.map((segment: Segment, segIdx: number) => {
                                      const speakerLabel = enableDiarizationAfterWhisper && segment.speaker != null && String(segment.speaker).trim() !== ''
                                        ? formatSpeakerLabel(segment.speaker)
                                        : '';
                                      const speakerNode = speakerLabel ? (
                                        <span className="mr-2 font-semibold text-teal-200">
                                          {speakerLabel}:
                                        </span>
                                      ) : null;
                                      const segmentText = isZh ? punctuateChineseParagraph(segment.text) : segment.text;
                                      return (
                                        <div key={segIdx} className="text-sm">
                                          <span className="font-mono text-xs" style={{ color: "#93C5FD" }}>
                                            [{formatTs(segment.start)} - {formatTs(segment.end)}]
                                          </span>
                                          <span className="ml-2">
                                            {speakerNode}
                                            {segmentText}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ));
                            }
                            
                            // Fallback to flat segment display
                            return segments.map((segment: Segment, index: number) => {
                              const speakerLabel = enableDiarizationAfterWhisper && segment.speaker != null && String(segment.speaker).trim() !== ''
                                ? formatSpeakerLabel(segment.speaker)
                                : '';
                              const speakerNode = speakerLabel ? (
                                <span className="mr-2 font-semibold text-teal-200">
                                  {speakerLabel}:
                                </span>
                              ) : null;
                              const displayText = isZh ? punctuateChineseParagraph(segment.text) : segment.text;
                              return (
                                <div key={index} className="text-sm">
                                  <span className="font-mono text-xs" style={{ color: "#93C5FD" }}>[{formatTs(segment.start)} - {formatTs(segment.end)}]</span>
                                  <span className="ml-2">{speakerNode}{displayText}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Smart Features Section (Basic/Pro) */}
                  <div className="smart-features-section mt-6 p-4 rounded-lg" style={{ 
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.05) 0%, rgba(34,211,238,0.05) 100%)',
                    border: '1px solid rgba(168,85,247,0.2)'
                  }}>
                    <div className="flex items-center gap-2 mb-4">
                      <h4 className="font-semibold text-lg" style={{ color: "#A7F3D0" }}>
                        {t("results.smart_features")}
                      </h4>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ 
                        background: 'rgba(168,85,247,0.1)', 
                        color: '#a855f7',
                        border: '1px solid rgba(168,85,247,0.2)'
                      }}>
                        {t("results.pro_features")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Generate Chapters Button */}
                      <button
                        onClick={async () => {
                          if (!result.data?.transcription?.segments || generatingChapters) return;
                          
                          setGeneratingChapters(true);
                          try {
                            // Use a dummy jobId since we don't need to persist chapters yet
                            const jobId = 'temp-' + Date.now();
                            console.log('Generating chapters for segments:', result.data.transcription.segments.length);
                            const response = await fetch(`/api/transcriptions/${jobId}/chapters`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                segments: result.data.transcription.segments,
                                options: { language: result.data.transcription.language }
                              })
                            });
                            
                            const data = await response.json();
                            if (data.success) {
                              console.log('Chapters generated:', data.data.chapters);
                              // Show success toast
                              showToast('success', t("results.chapters_generated"), t("results.chapters_generated_desc"));
                              // Store chapters in state for display
                              setGeneratedChapters(data.data.chapters);
                            } else {
                              if (response.status === 403) {
                                const msg = data?.limit 
                                  ? data.isDaily 
                                    ? t('results.basic_daily_limit', { limit: data.limit, used: data.used || 0 })
                                    : t('results.free_monthly_limit', { limit: data.limit, used: data.used || 0 })
                                  : (data?.error || t('results.plan_limited'));
                                showToast('error', t('results.upgrade_or_retry'), msg);
                              } else {
                                showToast('error', t("results.generation_failed"), data.error || t("results.try_again_later"));
                              }
                            }
                          } catch (error) {
                            console.error('Error generating chapters:', error);
                            showToast('error', t("results.generation_failed"), t("results.check_connection"));
                          } finally {
                            setGeneratingChapters(false);
                          }
                        }}
                        disabled={generatingChapters}
                        className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(168,85,247,0.3)',
                        }}
                      >
                        {generatingChapters ? (
                          <>
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>{t("results.generating")}</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <span>{t("results.generate_chapters")}</span>
                          </>
                        )}
                      </button>

                      {/* Generate Summary Button */}
                      <button
                        onClick={async () => {
                          if (!result.data?.transcription?.segments || generatingSummary) return;
                          
                          setGeneratingSummary(true);
                          try {
                            // Use a dummy jobId since we don't need to persist summary yet
                            const jobId = 'temp-' + Date.now();
                            console.log('Generating summary for segments:', result.data.transcription.segments.length);
                            const response = await fetch(`/api/transcriptions/${jobId}/summary`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                segments: result.data.transcription.segments,
                                options: { language: result.data.transcription.language }
                              })
                            });
                            
                            const data = await response.json();
                            if (data.success) {
                              console.log('Summary generated:', data.data.summary);
                              // Show success toast
                              showToast('success', t("results.summary_generated"), t("results.summary_generated_desc"));
                              // Store summary in state for display
                              setGeneratedSummary(data.data.summary);
                            } else if (response.status === 403) {
                              const msg = data?.limit 
                                ? data.isDaily
                                  ? t('results.basic_daily_limit', { limit: data.limit, used: data.used || 0 })
                                  : t('results.free_monthly_limit', { limit: data.limit, used: data.used || 0 })
                                : (data?.error || t('results.plan_limited'));
                              showToast('error', t('results.upgrade_or_retry'), msg);
                            } else {
                              showToast('error', t("results.generation_failed"), data.error || t("results.try_again_later"));
                            }
                          } catch (error) {
                            console.error('Error generating summary:', error);
                            showToast('error', t("results.generation_failed"), t("results.check_connection"));
                          } finally {
                            setGeneratingSummary(false);
                          }
                        }}
                        disabled={generatingSummary}
                        className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        style={{
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(34,211,238,0.3)',
                        }}
                      >
                        {generatingSummary ? (
                          <>
                            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>{t("results.generating")}</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{t("results.generate_summary")}</span>
                          </>
                        )}
                      </button>
                      <div className="mt-2 text-[11px] text-gray-400 whitespace-nowrap">
                        {t("results.usage_limits")}
                      </div>
                    </div>

                    {/* Feature descriptions */}
                    <div className="mt-3 text-xs text-gray-400">
                      <p>{t("results.smart_features_desc")}</p>
                    </div>
                    
                    {/* Display Generated Chapters */}
                    {generatedChapters.length > 0 && (
                      <div className="mt-4 p-3 rounded-lg" style={{ 
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(168,85,247,0.2)'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium" style={{ color: '#a855f7' }}>
                            {t("results.chapters")}
                          </h5>
                          <button
                            onClick={() => {
                              const chaptersText = generatedChapters
                                .map(ch => `${Math.floor(ch.startTime / 60)}:${String(Math.floor(ch.startTime % 60)).padStart(2, '0')} - ${ch.title}`)
                                .join('\n');
                              navigator.clipboard.writeText(chaptersText);
                              setCopiedChapters(true);
                              setTimeout(() => setCopiedChapters(false), 2000);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-all hover:bg-white/10"
                            style={{ color: copiedChapters ? '#10b981' : '#9ca3af' }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>{copiedChapters ? t("results.copied") : t("results.copy")}</span>
                          </button>
                        </div>
                        <div className="space-y-2">
                          {generatedChapters.map((chapter, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                // Scroll to the corresponding timestamp section
                                const element = document.getElementById(`chapter-${idx}`);
                                if (element) {
                                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  // Add highlight effect
                                  element.classList.add('highlight-chapter');
                                  setTimeout(() => element.classList.remove('highlight-chapter'), 2000);
                                }
                              }}
                              className="flex items-start gap-2 text-sm w-full text-left p-2 rounded hover:bg-white/5 transition-colors"
                            >
                              <span className="text-gray-400" style={{ minWidth: '60px' }}>
                                {Math.floor(chapter.startTime / 60)}:{String(Math.floor(chapter.startTime % 60)).padStart(2, '0')}
                              </span>
                              <span className="text-gray-200 hover:text-white">{chapter.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Display Generated Summary */}
                    {generatedSummary && (
                      <div className="mt-4 p-3 rounded-lg" style={{ 
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid rgba(34,211,238,0.2)'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium" style={{ color: '#22d3ee' }}>
                            {t("results.summary")}
                          </h5>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(generatedSummary);
                              setCopiedSummary(true);
                              setTimeout(() => setCopiedSummary(false), 2000);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-all hover:bg-white/10"
                            style={{ color: copiedSummary ? '#10b981' : '#9ca3af' }}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>{copiedSummary ? t("results.copied") : t("results.copy")}</span>
                          </button>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                          {generatedSummary}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Download Buttons - Enhanced */}
                  <div className="download-section mt-6 p-4 rounded-lg" style={{ 
                    background: 'linear-gradient(135deg, rgba(34,211,238,0.05) 0%, rgba(168,85,247,0.05) 100%)',
                    border: '1px solid rgba(168,85,247,0.2)'
                  }}>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="font-semibold text-lg" style={{ color: "#A7F3D0" }}>
                        {t("results.download_options")}
                      </h4>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ 
                        background: 'rgba(16,185,129,0.1)', 
                        color: '#10b981',
                        border: '1px solid rgba(16,185,129,0.2)'
                      }}>
                        {Object.keys(result.data.formats).length} formats
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {Object.keys(result.data.formats).map((format) => {
                        const id = format.toLowerCase();
                        const IconComp = id === 'json' ? Code : (id === 'txt' || id === 'md') ? FileText : Download;
                        return (
                          <Button
                            key={format}
                            variant="outline"
                            size="lg"
                            onClick={() => downloadFormat(format)}
                            disabled={downloadingFormats[format]}
                            className="download-format-btn group relative overflow-hidden transition-all hover:scale-105"
                            style={{
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(168,85,247,0.3)',
                              padding: '14px 28px',
                              fontSize: '16px'
                            }}
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {downloadingFormats[format] ? (
                              <>
                                <Loader2 className="animate-spin mr-2" size={20} />
                                <span className="relative font-medium">{t('common.downloading')}</span>
                              </>
                            ) : (
                              <>
                                <span className={`fmt-icon fmt-${id} relative`}>
                                  <IconComp className="fmt-icon-svg" />
                                </span>
                                <span className="relative font-medium">{format.toUpperCase()}</span>
                              </>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Advanced Export Section - Word/PDF with TOC */}
                  <div className="export-section mt-6 p-4 rounded-lg" style={{ 
                      background: 'linear-gradient(135deg, rgba(168,85,247,0.05) 0%, rgba(59,130,246,0.05) 100%)',
                      border: '1px solid rgba(59,130,246,0.2)'
                    }}>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-semibold text-lg" style={{ color: "#A7F3D0" }}>
                          {t("results.advanced_export")}
                        </h4>
                        <span className="text-xs px-2 py-1 rounded-full" style={{ 
                          background: 'rgba(59,130,246,0.1)', 
                          color: '#3b82f6',
                          border: '1px solid rgba(59,130,246,0.2)'
                        }}>
                          {t("results.with_toc")}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-3">
                        {/* Export to Word (backend export when jobId exists) */}
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={async () => {
                            setExportingWord(true);
                            try {
                              const jobId = result.data.jobId as string | undefined;
                              if (jobId) {
                                await fetchAndDownload(`/api/transcriptions/${jobId}/export?format=docx`, buildDownloadFileName('docx'));
                              } else {
                                // fallback: client-side export (rare) — enforce Free preview trim
                                const maxSec = 300;
                                const orig = result.data.transcription;
                                const trimmedSegments = (orig.segments || [])
                                  .filter((s: any) => s.start < maxSec)
                                  .map((s: any) => ({ ...s, end: Math.min(s.end, maxSec) }));
                                const clientText = trimmedSegments.length > 0
                                  ? trimmedSegments.map((s: any) => s.text).join(' ')
                                  : (orig.text || '');
                                const blob = await DocumentExportService.exportToWord(
                                  {
                                    text: isFreeTier ? clientText : (orig.text || clientText),
                                    segments: isFreeTier ? trimmedSegments : (orig.segments || trimmedSegments),
                                    language: orig.language,
                                    duration: isFreeTier ? Math.min(orig.duration || maxSec, maxSec) : (orig.duration || maxSec)
                                  },
                                  generatedChapters,
                                  generatedSummary,
                                  {
                                    metadata: {
                                      title: 'Transcription',
                                      date: new Date().toLocaleDateString(),
                                      language: orig.language,
                                      duration: isFreeTier ? Math.min(orig.duration || maxSec, maxSec) : (orig.duration || maxSec)
                                    },
                                    includeTimestamps: true,
                                    includeChapters: true,
                                    includeSummary: true,
                                    includeSpeakers: !isFreeTier
                                  }
                                );
                                const url = URL.createObjectURL(blob as any);
                                const link = document.createElement('a');
                                link.href = url; link.download = buildDownloadFileName('docx'); link.click(); URL.revokeObjectURL(url);
                              }
                              showToast('success', t("results.export_success"), t("results.word_exported"));
                            } catch (error) {
                              console.error('Export error:', error);
                              showToast('error', t("results.export_failed"), t("results.try_again_later"));
                            } finally {
                              setExportingWord(false);
                            }
                          }}
                          disabled={exportingWord}
                          className="group relative overflow-hidden transition-all hover:scale-105"
                          style={{
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(59,130,246,0.3)',
                            padding: '14px 28px',
                            fontSize: '16px'
                          }}
                        >
                          <span className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          {exportingWord ? (
                            <>
                              <svg className="w-5 h-5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>{t("results.exporting")}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M9 13h6m-6 4h6m2-12v4h4" />
                              </svg>
                              <span className="relative font-medium">WORD</span>
                            </>
                          )}
                        </Button>
                        
                        {/* Export to PDF (backend export when jobId exists) */}
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={async () => {
                            setExportingPDF(true);
                            try {
                              const jobId = result.data.jobId as string | undefined;
                              if (jobId) {
                                await fetchAndDownload(`/api/transcriptions/${jobId}/export?format=pdf`, buildDownloadFileName('pdf'));
                              } else {
                                // fallback: client-side export (rare) — enforce Free preview trim
                                const maxSec = 300;
                                const orig = result.data.transcription;
                                const trimmedSegments = (orig.segments || [])
                                  .filter((s: any) => s.start < maxSec)
                                  .map((s: any) => ({ ...s, end: Math.min(s.end, maxSec) }));
                                const clientText = trimmedSegments.length > 0
                                  ? trimmedSegments.map((s: any) => s.text).join(' ')
                                  : (orig.text || '');
                                const blob = await DocumentExportService.exportToPDF(
                                  {
                                    text: isFreeTier ? clientText : (orig.text || clientText),
                                    segments: isFreeTier ? trimmedSegments : (orig.segments || trimmedSegments),
                                    language: orig.language,
                                    duration: isFreeTier ? Math.min(orig.duration || maxSec, maxSec) : (orig.duration || maxSec)
                                  },
                                  generatedChapters,
                                  generatedSummary,
                                  {
                                    metadata: {
                                      title: 'Transcription',
                                      date: new Date().toLocaleDateString(),
                                      language: orig.language,
                                      duration: isFreeTier ? Math.min(orig.duration || maxSec, maxSec) : (orig.duration || maxSec)
                                    },
                                    includeTimestamps: true,
                                    includeChapters: true,
                                    includeSummary: true,
                                    includeSpeakers: !isFreeTier
                                  }
                                );
                                const url = URL.createObjectURL(blob as any);
                                const link = document.createElement('a');
                                link.href = url; link.download = buildDownloadFileName('pdf'); link.click(); URL.revokeObjectURL(url);
                              }
                              showToast('success', t("results.export_success"), t("results.pdf_exported"));
                            } catch (error) {
                              console.error('Export error:', error);
                              showToast('error', t("results.export_failed"), t("results.try_again_later"));
                            } finally {
                              setExportingPDF(false);
                            }
                          }}
                          disabled={exportingPDF}
                          className="group relative overflow-hidden transition-all hover:scale-105"
                          style={{
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            padding: '14px 28px',
                            fontSize: '16px'
                          }}
                        >
                          <span className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          {exportingPDF ? (
                            <>
                              <svg className="w-5 h-5 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>{t("results.exporting")}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                  d="M12 11v4m0 4h.01" />
                              </svg>
                              <span className="relative font-medium">PDF</span>
                            </>
                          )}
                        </Button>
                      </div>
                      
                      <div className="mt-3 text-xs text-gray-400">
                        <p>{t("results.export_desc")}</p>
                      </div>
                    </div>
                </div>
              </div>
            </div>
            )}

          </>
          )}
          
          {/* Preview only (unauthenticated) */}
          {result?.type === 'preview' && (
            <div className="mt-6">
              <div className="design-card p-6 text-left">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xl font-semibold">{t('preview.title')}</h3>
                  {result.authRequired && (
                    <span className="text-sm text-amber-300">{t('preview.banner')}</span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mb-2">{t('preview.message')}</p>
                <div className="p-4 rounded-lg max-h-52 overflow-y-auto" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(59,130,246,0.25)" }}>
                  <p className="text-sm whitespace-pre-wrap">
                    {result.data.text || "Preview temporarily unavailable. Please sign in for full transcription."}
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <a className="design-btn-primary" href="/auth/signin">{t('preview.sign_in')}</a>
                  <button 
                    className="design-btn-secondary"
                    onClick={() => downloadPreview()}
                  >
                    {t('preview.download_preview')} (5m)
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
      {/* CSS for chapter highlight animation */}
      <style jsx>{`
        .chapter-section {
          position: relative;
        }
        .chapter-section.highlight-chapter {
          animation: highlightPulse 2s ease-out;
        }
        @keyframes highlightPulse {
          0% {
            background: rgba(168, 85, 247, 0.3);
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
          }
          100% {
            background: rgba(0, 0, 0, 0.2);
            box-shadow: none;
          }
        }
      `}</style>
      {/* Success overlay */}
      <div className={`success-overlay ${showSuccess ? "show" : ""}`} onClick={() => setShowSuccess(false)}>
        <div className="success-content" onClick={(e) => e.stopPropagation()}>
          <div className="success-icon">✓</div>
          <div className="text-2xl font-extrabold bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg,#667eea,#ec4899)" }}>
            {t("success.title")}
          </div>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
            {t("success.message")}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button className="balloon-button" onClick={() => setShowSuccess(false)}>{t("success.continue")}</button>
            <button 
              className="design-btn-primary" 
              onClick={goToHistory}
              disabled={isNavigatingToHistory}
              style={{ opacity: isNavigatingToHistory ? 0.7 : 1 }}
            >
              {isNavigatingToHistory ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t("success.view_history")}
                </span>
              ) : (
                t("success.view_history")
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={() => setUpgradeModal({ ...upgradeModal, isOpen: false })}
        requiredTier={upgradeModal.requiredTier}
        feature={upgradeModal.feature}
      />
      
      {/* Toast Notification */}
      <ToastNotification
        type={toast.type}
        title={toast.title}
        message={toast.message}
        isOpen={toast.isOpen}
        onClose={hideToast}
      />
      
      {/* Audio Track Selector Dialog */}
      <AudioTrackSelector
        isOpen={showTrackSelector}
        onClose={() => setShowTrackSelector(false)}
        onSelect={handleTrackSelected}
        tracks={availableTracks}
        videoTitle={trackVideoTitle}
      />
      
      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorState.type !== null}
        error={errorState}
        onClose={() => setErrorState({ type: null, message: '', canRetry: false })}
        onRetry={errorState.retryAction}
      />
      
      {/* Turnstile Verification Modal */}
      <TurnstileModal
        open={showTurnstile}
        onClose={() => setShowTurnstile(false)}
        onSuccess={handleTurnstileSuccess}
        title={t("turnstile.title") || "Verify You're Human"}
        description={t("turnstile.description") || "Please complete the verification to continue"}
      />
    </div>
  );
}
