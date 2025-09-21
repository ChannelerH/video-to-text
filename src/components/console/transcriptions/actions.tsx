"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, FileCode, FileJson, FileDown, RefreshCw, Trash2, RotateCcw } from "lucide-react";
import { useAppContext } from "@/contexts/app";

type ActionsProps = {
  row: any;
  i18n: any;
  userTier?: string;
};

export default function Actions({ row, i18n, userTier: userTierOverride }: ActionsProps) {
  const router = useRouter();
  const { userTier: contextTier } = useAppContext();
  const effectiveTier = (userTierOverride ?? contextTier) || 'free';
  const isFreeTier = effectiveTier === 'free';
  const [rerunning, setRerunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [downloadingFormats, setDownloadingFormats] = useState<Set<string>>(new Set());
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const deleteTimerRef = useRef<any>(null);

  const onDelete = async () => {
    setDeleting(true);
    // Close dialog immediately to avoid perceived freeze
    setOpen(false);
    try {
      const res = await fetch(`/api/transcriptions/${row.job_id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowUndo(true);
        // notify table: soft delete (show undo on card)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tx:softDelete', { detail: { jobId: row.job_id } }));
        }
        // auto hide undo after 6s
        deleteTimerRef.current = setTimeout(() => {
          setShowUndo(false);
          // finalize removal (card disappears)
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tx:finalizeDelete', { detail: { jobId: row.job_id } }));
          }
        }, 6000);
        toast.success(i18n.deleted_ok || 'Deleted');
      } else {
        toast.error(i18n.delete_failed || 'Delete failed');
      }
    } finally {
      setDeleting(false);
    }
  };

  const onRerun = async () => {
    // Check for available URL (prefer processed_url for speed)
    const urlToUse = row.processed_url || row.source_url;
    if (!urlToUse) {
      toast.error('No URL available for re-run');
      return;
    }
    
    setRerunning(true);
    try {
      if (row.source_type === 'file_upload') {
        alert(i18n.rerun_file_hint);
        return;
      }
      
      // Log which URL we're using
      console.log('[Re-run] Using URL:', row.processed_url ? 'processed_url (fast)' : 'source_url (original)');
      
      // When using processed_url (R2), treat it as audio_url regardless of original source_type
      const effectiveType = row.processed_url ? 'audio_url' : row.source_type;
      
      const body = {
        type: effectiveType as 'youtube_url' | 'audio_url',
        content: urlToUse,  // Use the selected URL
        options: { formats: ['txt','srt','vtt','json','md'] }
      };
      toast.message(i18n.rerun_ok);
      const res = await fetch('/api/transcribe/async', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data?.success) {
        toast.error(i18n.rerun_failed);
      }
    } finally {
      setRerunning(false);
    }
  };

  const base = `/api/transcriptions/${row.job_id}/file`;
  const exportBase = `/api/transcriptions/${row.job_id}/export`;

  const download = async (format: string) => {
    // 设置loading状态
    setDownloadingFormats(prev => new Set(prev).add(format));
    
    try {
      // 添加小延迟让用户看到loading效果
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const res = await fetch(`${base}?format=${format}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error(`${format.toUpperCase()} not available for this job`);
          return;
        }
        toast.error(`Download failed (${res.status})`);
        return;
      }
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: res.headers.get('Content-Type') || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename\*=UTF-8''([^;]+)/);
      const filename = match ? decodeURIComponent(match[1]) : `${row.title || row.job_id}.${format}`;
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Download error: ${e.message}`);
    } finally {
      // 清除loading状态
      setDownloadingFormats(prev => {
        const newSet = new Set(prev);
        newSet.delete(format);
        return newSet;
      });
    }
  };

  // 格式图标映射
  const formatIcons = {
    txt: FileText,
    srt: FileCode,
    vtt: FileCode,
    json: FileJson,
    md: FileDown
  };

  return (
    <div className="space-y-3">
      {/* 下载格式按钮组 - 包含所有导出格式 */}
      <div className="flex flex-wrap gap-2">
        {(
          isFreeTier
            ? ['txt', 'srt', 'vtt']
            : ['txt', 'srt', 'vtt', 'json', 'md']
        ).map((format) => {
          const Icon = formatIcons[format as keyof typeof formatIcons] || FileDown;
          return (
            <button
              key={format}
              onClick={() => download(format)}
              disabled={downloadingFormats.has(format)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                transition-all duration-200 text-xs font-medium
                ${downloadingFormats.has(format) 
                  ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 cursor-not-allowed' 
                  : 'bg-secondary/50 hover:bg-secondary text-secondary-foreground hover:scale-105 hover:shadow-sm'}
              `}
            >
              {downloadingFormats.has(format) ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Icon className="w-3.5 h-3.5" />
                  {format.toUpperCase()}
                </>
              )}
            </button>
          );
        })}
        
        {/* Word 和 PDF 按钮移到这里 */}
        <button
          onClick={async () => {
            setExportingWord(true);
            try {
              const res = await fetch(`${exportBase}?format=docx`);
              if (!res.ok) { toast.error('Word export failed'); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              const baseName = row.source_type === 'file_upload' && row.title
                ? row.title.replace(/\.[^/.]+$/, '') // Remove extension if exists
                : (row.title || 'transcription');
              a.href = url; a.download = `${baseName.replace(/\s+/g,'_')}.docx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
              toast.success('Word exported successfully');
            } catch { 
              toast.error('Word export failed'); 
            } finally {
              setExportingWord(false);
            }
          }}
          disabled={exportingWord}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            transition-all duration-200 text-xs font-medium
            ${exportingWord 
              ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300 cursor-not-allowed' 
              : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:scale-105 hover:shadow-sm'}
          `}
        >
          {exportingWord ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <FileText className="w-3.5 h-3.5" />
              <span>Word</span>
            </>
          )}
        </button>
        <button
          onClick={async () => {
            setExportingPDF(true);
            try {
              const res = await fetch(`${exportBase}?format=pdf`);
              if (!res.ok) { toast.error('PDF export failed'); return; }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              const baseName = row.source_type === 'file_upload' && row.title
                ? row.title.replace(/\.[^/.]+$/, '') // Remove extension if exists
                : (row.title || 'transcription');
              a.href = url; a.download = `${baseName.replace(/\s+/g,'_')}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
              toast.success('PDF exported successfully');
            } catch { 
              toast.error('PDF export failed'); 
            } finally {
              setExportingPDF(false);
            }
          }}
          disabled={exportingPDF}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            transition-all duration-200 text-xs font-medium
            ${exportingPDF 
              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 cursor-not-allowed' 
              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:scale-105 hover:shadow-sm'}
          `}
        >
          {exportingPDF ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </>
          )}
        </button>
      </div>

      {/* 操作按钮组 - 只保留 Re-run 和 Delete */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRerun}
          disabled={rerunning || row.source_type === 'file_upload'}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            bg-blue-500/10 hover:bg-blue-500/20 text-blue-600
            transition-all duration-200 text-xs font-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:scale-105 hover:shadow-sm
          "
        >
          <RefreshCw className={`w-3.5 h-3.5 ${rerunning ? 'animate-spin' : ''}`} />
          {rerunning ? 'Re-running…' : i18n.rerun}
        </button>
        
        <button
          onClick={() => setOpen(true)}
          disabled={deleting}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            bg-red-500/10 hover:bg-red-500/20 text-red-600
            transition-all duration-200 text-xs font-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:scale-105 hover:shadow-sm
          "
        >
          <Trash2 className="w-3.5 h-3.5" />
          {i18n.delete}
        </button>

        {showUndo && (
          <button
            onClick={async () => {
              setUndoing(true);
              try {
                const res = await fetch(`/api/transcriptions/${row.job_id}/restore`, { method: 'POST' });
                if (!res.ok) throw new Error('restore failed');
                toast.success(i18n.undo_success || 'Restored');
                setShowUndo(false);
                if (deleteTimerRef.current) { clearTimeout(deleteTimerRef.current); deleteTimerRef.current = null; }
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('tx:restore', { detail: { jobId: row.job_id } }));
                }
              } catch {
                toast.error(i18n.undo_failed || 'Restore failed');
              } finally {
                setUndoing(false);
              }
            }}
            className="
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600
              transition-all duration-200 text-xs font-medium
              disabled:opacity-50 disabled:cursor-not-allowed
              hover:scale-105 hover:shadow-sm animate-pulse
            "
            disabled={undoing}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {i18n.undo}
          </button>
        )}
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              {i18n.confirm_title}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {i18n.confirm_desc}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              className="
                px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80
                transition-colors duration-200 text-sm font-medium
              " 
              onClick={() => setOpen(false)}
            >
              {i18n.cancel}
            </button>
            <button 
              className="
                px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white
                transition-colors duration-200 text-sm font-medium
                disabled:opacity-50 disabled:cursor-not-allowed
              " 
              onClick={onDelete} 
              disabled={deleting}
            >
              {i18n.confirm}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
