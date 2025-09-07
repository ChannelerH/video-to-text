"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, FileCode, FileJson, FileDown, RefreshCw, Trash2, RotateCcw } from "lucide-react";

export default function Actions({ row, i18n }: { row: any; i18n: any }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [showUndo, setShowUndo] = useState(false);

  const onDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/transcriptions/${row.job_id}`, { method: 'DELETE' });
      if (res.ok) {
        setShowUndo(true);
        // auto hide undo after 6s
        setTimeout(() => setShowUndo(false), 6000);
        toast.success(i18n.deleted_ok);
      } else {
        toast.error(i18n.delete_failed);
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const onRerun = async () => {
    if (!row.source_url) return;
    setBusy(true);
    try {
      if (row.source_type === 'file_upload') {
        alert(i18n.rerun_file_hint);
        return;
      }
      const body = {
        type: row.source_type as 'youtube_url' | 'audio_url',
        content: row.source_url,
        action: 'transcribe',
        options: { formats: ['txt','srt','vtt','json','md'] }
      };
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data?.success) {
        toast.success(i18n.rerun_ok);
      } else {
        toast.error(i18n.rerun_failed);
      }
    } finally {
      setBusy(false);
    }
  };

  const base = `/api/transcriptions/${row.job_id}/file`;

  const download = async (format: string) => {
    try {
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
      {/* 下载格式按钮组 */}
      <div className="flex flex-wrap gap-2">
        {['txt', 'srt', 'vtt', 'json', 'md'].map((format) => {
          const Icon = formatIcons[format as keyof typeof formatIcons] || FileDown;
          return (
            <button
              key={format}
              onClick={() => download(format)}
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                bg-secondary/50 hover:bg-secondary text-secondary-foreground
                transition-all duration-200 text-xs font-medium
                hover:scale-105 hover:shadow-sm
              "
            >
              <Icon className="w-3.5 h-3.5" />
              {format.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* 操作按钮组 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRerun}
          disabled={busy || row.source_type === 'file_upload'}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
            bg-blue-500/10 hover:bg-blue-500/20 text-blue-600
            transition-all duration-200 text-xs font-medium
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:scale-105 hover:shadow-sm
          "
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {i18n.rerun}
        </button>
        
        <button
          onClick={() => setOpen(true)}
          disabled={busy}
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
                toast.success(i18n.undo_success);
                setShowUndo(false);
              } catch {
                toast.error(i18n.undo_failed);
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
              disabled={busy}
            >
              {i18n.confirm}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
