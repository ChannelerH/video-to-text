"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Check, Code } from "lucide-react";
import PyramidLoader from "@/components/ui/pyramid-loader";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useAppContext } from "@/contexts/app";
import { isAuthEnabled } from "@/lib/auth";
import { MultipartUploader } from "@/lib/multipart-upload";

interface ToolInterfaceProps {
  mode?: "video" | "audio";
}

export default function ToolInterface({ mode = "video" }: ToolInterfaceProps) {
  const t = useTranslations("tool_interface");
  
  // Authentication state
  const { data: session } = isAuthEnabled() ? useSession() : { data: null };
  const { user, userTier } = useAppContext();
  const isAuthenticated = !!(session?.user || user);
  const tier = (userTier || (user as any)?.userTier || 'free') as string;
  const canUseHighAccuracy = isAuthenticated && (tier === 'pro');
  
  // Debug logging
  useEffect(() => {
    console.log('[HighAccuracy Debug]', {
      isAuthenticated,
      tier,
      userTier,
      userFromContext: user,
      canUseHighAccuracy
    });
  }, [isAuthenticated, tier, userTier, user, canUseHighAccuracy]);
  
  const [url, setUrl] = useState("");
  const [selectedFormats, setSelectedFormats] = useState(["txt", "srt", "vtt", "md", "json"]);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<any>(null);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const isAbortingRef = useRef<boolean>(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  // Early banner when Chinese is detected via probe
  const [showChineseUpgrade, setShowChineseUpgrade] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Avoid duplicate Chinese upgrade toast per run
  const [zhBannerShown, setZhBannerShown] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
  type Segment = { start: number; end: number; text: string };
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
    const href = locale && locale !== 'en' ? `/${locale}/my-transcriptions` : `/my-transcriptions`;
    try {
      router.push('/my-transcriptions');
      // 保险兜底：如果 SPA 跳转被阻塞，fallback 到硬跳转
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.assign(href);
        }
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
              uploadMethod: 'multipart'
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
            uploadMethod: 'presigned-url'
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
                setUploadedFileInfo(uploadResult.data);
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
    console.log('[DEBUG] handleTranscribe called, url:', url, 'uploadedFileInfo:', uploadedFileInfo, 'file:', file?.name);
    
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

    // reset duplicate-guard and any previous banner for a new run
    setZhBannerShown(false);
    setShowChineseUpgrade(false);
    setIsProcessing(true);
    setProgress(t("progress.starting"));
    setResult(null);
    setProgressInfo({ stage: null, percentage: 0, message: '' });

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
        requestData = {
          type: urlType,
          content: url,
          action: action,
          options: { formats: selectedFormats }
        };
        if (canUseHighAccuracy && action === 'transcribe' && highAccuracy) {
          requestData.options.highAccuracyMode = true;
        }
        // 轻量语言探针（不阻塞主流程）：若判定中文，立刻展示升级提示
        try {
          // Show immediately; if probe says not Chinese, hide it
          showChineseToast();
          fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: urlType, content: url, action: 'probe', options: { userTier: tier, languageProbeSeconds: 10 } })
          })
          .then(r => r.json())
          .then(res => { if (res?.success) { if (!res?.isChinese) { setShowChineseUpgrade(false); setZhBannerShown(false); } } })
          .catch(() => {});
        } catch {}
      } else if (uploadedFileInfo) {
        const progressText = action === "preview" 
          ? t("progress.generating_preview")
          : t("progress.processing_file");
        setProgress(progressText);
        requestData = {
          type: "file_upload",
          content: uploadedFileInfo.replicateUrl,
          action: action,
          options: { formats: selectedFormats, r2Key: uploadedFileInfo.r2Key, fileName: uploadedFileInfo.originalName }
        };
        if (canUseHighAccuracy && action === 'transcribe' && highAccuracy) {
          requestData.options.highAccuracyMode = true;
        }
        // 轻量语言探针（不阻塞主流程）
        try {
          showChineseToast();
          fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'file_upload', content: uploadedFileInfo.replicateUrl, action: 'probe', options: { userTier: tier, languageProbeSeconds: 10 } })
          })
          .then(r => r.json())
          .then(res => { if (res?.success) { if (!res?.isChinese) { setShowChineseUpgrade(false); setZhBannerShown(false); } } })
          .catch(() => {});
        } catch {}
      } else {
        setProgress(t("errors.wait_for_upload"));
        setIsProcessing(false);
        return;
      }

      // Add streamProgress flag for authenticated users
      if (isAuthenticated && requestData) {
        requestData.options = { ...requestData.options, streamProgress: true };
      }

      // Send request with SSE support for authenticated users
      let result: any = null;
      
      if (isAuthenticated && requestData?.options?.streamProgress) {
        // Use EventSource for progress updates
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData)
        });

        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          // Handle SSE response
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          if (reader) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      
                      if (data.type === 'progress') {
                        setProgressInfo({
                          stage: data.stage,
                          percentage: data.percentage,
                          message: data.message,
                          estimatedTime: data.estimatedTime
                        });
                        setProgress(data.message);
                      } else if (data.type === 'complete') {
                        result = data.result;
                        break;
                      } else if (data.type === 'error') {
                        throw new Error(data.error);
                      }
                    } catch (e) {
                      console.error('Failed to parse SSE data:', e);
                    }
                  }
                }
              }
            } finally {
              reader.releaseLock();
            }
          }
        } else {
          // Non-SSE response, parse as JSON
          try {
            result = await response.json();
          } catch (e) {
            console.error('[Main] Failed to parse JSON:', e);
            setProgress('Failed to parse server response. Please try again.');
            setIsProcessing(false);
            return;
          }
        }
      } else {
        // Non-authenticated or preview request
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData)
        });
        
        try {
          result = await response.json();
        } catch (e) {
          console.error('[Main] Failed to parse JSON:', e);
          setProgress('Failed to parse server response. Please try again.');
          setIsProcessing(false);
          return;
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
          userFriendlyError = `Transcription failed: ${result.error}`;
        }
        
        setProgress(userFriendlyError);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setProgress(t("errors.general_error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFormat = async (format: string) => {
    if (!result?.data || result.type !== 'full') return;

    try {
      // 创建并下载文件
      const content = result.data.formats[format];
      const title = result.data.videoInfo?.title || 'transcription';
      const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}.${format}`;

      const blob = new Blob([content], { type: getContentType(format) });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const downloadPreview = () => {
    if (!result?.data || result.type !== 'preview') return;

    try {
      // 添加预览标记
      const previewMarker = `[PREVIEW - First 90 seconds only]\n[完整版预览 - 仅前90秒]\n\n`;
      const watermark = `\n\n---\n[This is a preview of the first 90 seconds. Sign in for full transcription.]\n[这是前90秒的预览。登录以获取完整转录。]`;
      
      const content = previewMarker + (result.data.text || '') + watermark;
      const fileName = 'preview_90s.txt';

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

  const getAcceptTypes = () => (mode === "video" ? ".mp4,.mov,.webm,.avi" : ".mp3,.m4a,.wav,.ogg,.flac");

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
        const translateX = dx * 0.015 * strength;
        const translateY = dy * 0.015 * strength;
        const rotateX = -(dy * 0.008) * strength;
        const rotateY = (dx * 0.008) * strength;
        const scale = 1 + strength * 0.008;
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
  const formats = [
    { id: "txt", label: t("formats.txt"), icon: FileText },
    { id: "srt", label: t("formats.srt"), icon: Download },
    { id: "vtt", label: t("formats.vtt"), icon: Download },
    { id: "md", label: t("formats.md"), icon: FileText },
    { id: "json", label: t("formats.json"), icon: Code },
  ];

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
              {file ? `${file.name} • ${(file.size / (1024 * 1024)).toFixed(1)} MB` : t("supported_formats")}
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
            <span className="text-xs text-gray-400">{t("url_help_text")}</span>
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

        {/* Pro high-accuracy toggle - Enhanced design */}
        <div className="high-accuracy-container">
          <div 
            className={`high-accuracy-toggle ${highAccuracy ? 'active' : ''} ${!canUseHighAccuracy ? 'locked' : ''}`}
            onClick={(e) => {
              // Check if click is on the upgrade link
              const target = e.target as HTMLElement;
              if (target.classList.contains('toggle-link') || target.closest('.toggle-link')) {
                return; // Let the link handle its own click
              }
              
              e.preventDefault();
              e.stopPropagation();
              
              if (canUseHighAccuracy) {
                // Pro/Premium users can toggle
                setHighAccuracy(!highAccuracy);
              }
              // Non-Pro users: do nothing when clicking the main button
              // They must click the "Upgrade" link specifically
            }}
            role="button"
            aria-pressed={highAccuracy}
            aria-label={t('high_accuracy.label')}
            style={{ cursor: canUseHighAccuracy ? 'pointer' : 'default' }}
          >
            <div className="toggle-switch" 
              onClick={(e) => {
                if (!canUseHighAccuracy) {
                  e.stopPropagation(); // Prevent toggle for non-Pro users
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
                {canUseHighAccuracy ? (
                  <>
                    <span className="toggle-label">{t('high_accuracy.enabled_label')}</span>
                    <span className="toggle-hint">{t('high_accuracy.speed_hint')}</span>
                  </>
                ) : (
                  <>
                    <span className="toggle-label">
                      {isAuthenticated 
                        ? t('high_accuracy.upgrade_hint') 
                        : t('high_accuracy.login_hint')}
                    </span>
                    <a 
                      className="toggle-link upgrade-link"
                      href="/pricing"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push('/pricing');
                      }}
                      style={{ 
                        cursor: 'pointer', 
                        textDecoration: 'underline',
                        marginLeft: '4px'
                      }}
                    >
                      {t('high_accuracy.pricing_link')}
                    </a>
                  </>
                )}
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

                  {/* Segments with Timestamps (Chinese groups paragraphs) */}
                  {result.data.transcription.segments && result.data.transcription.segments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium" style={{ color: "#A7F3D0" }}>{t("results.timestamped_segments")}</h4>
                      <div className="p-4 rounded-lg max-h-60 overflow-y-auto" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(16,185,129,0.25)" }}>
                        <div className="space-y-2">
                          {(() => {
                            const lang = result.data.transcription.language as string | undefined;
                            const rawText = result.data.transcription.text as string;
                            const segments = (result.data.transcription.segments || []) as Segment[];
                            const isZh = isChineseLangOrText(lang, rawText);
                            if (isZh) {
                              // Use sentence-level refined segments for finer timestamps; lightly punctuate each line.
                              return segments.map((segment: Segment, index: number) => (
                                <div key={index} className="text-sm">
                                  <span className="font-mono text-xs" style={{ color: "#93C5FD" }}>
                                    [{formatTs(segment.start)} - {formatTs(segment.end)}]
                                  </span>
                                  <span className="ml-2">{punctuateChineseParagraph(segment.text)}</span>
                                </div>
                              ));
                            }
                            return segments.map((segment: Segment, index: number) => (
                              <div key={index} className="text-sm">
                                <span className="font-mono text-xs" style={{ color: "#93C5FD" }}>[{formatTs(segment.start)} - {formatTs(segment.end)}]</span>
                                <span className="ml-2">{segment.text}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  
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
                            className="download-format-btn group relative overflow-hidden transition-all hover:scale-105"
                            style={{
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid rgba(168,85,247,0.3)',
                              padding: '14px 28px',
                              fontSize: '16px'
                            }}
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className={`fmt-icon fmt-${id} relative`}>
                              <IconComp className="fmt-icon-svg" />
                            </span>
                            <span className="relative font-medium">{format.toUpperCase()}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                    {t('preview.download_preview')} (90s)
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
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
            <button className="design-btn-primary" onClick={goToHistory}>{t("success.view_history")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
