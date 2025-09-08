"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Actions from "@/components/console/transcriptions/actions";
import { toast } from "sonner";
import { FileAudio, Clock, Calendar, Download, Trash2, CheckCircle2, Circle } from "lucide-react";

export default function TranscriptionsTable({ rows, t }: { rows: any[]; t: any }) {
  const searchParams = useSearchParams();
  const [localRows, setLocalRows] = useState<any[]>(rows || []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [listLoading, setListLoading] = useState(false); // overlay for grid only
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const all = localRows.map((r) => r.job_id);
  const selectedIds = all.filter((id) => selected[id]);

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true); setListLoading(true);
    try {
      const res = await fetch('/api/transcriptions/batch/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_ids: selectedIds }) });
      if (res.ok) {
        toast.success(t.deleted_ok);
        // remove selected cards locally, no global reload
        setLocalRows(rs => rs.filter(r => !selectedIds.includes(r.job_id)));
        setSelected({});
      } else {
        toast.error(t.deleted_fail);
      }
    } finally { setDeleting(false); setListLoading(false); }
  };

  const exportZip = async () => {
    if (selectedIds.length === 0) return;
    try {
      setExporting(true); setListLoading(true);
      const res = await fetch('/api/transcriptions/batch/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: selectedIds })
      });
      if (!res.ok) { toast.error(t.export_fail); return; }
      const blob = await res.blob();
      if (!blob || blob.size === 0) { toast.error(t.export_fail); return; }
      const fname = `transcriptions_${new Date().toISOString().replace(/[:T]/g,'-').split('.')[0]}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast.success(t.export_ok || 'ZIP ready');
    } catch (e) {
      console.error('Export ZIP error:', e);
      toast.error(t.export_fail);
    } finally { setExporting(false); setListLoading(false); }
  };

  // Listen to search event to only show grid loading
  // A client search bar will dispatch CustomEvent('transcriptions:search') before navigation
  useEffect(() => {
    const handler = () => setListLoading(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('transcriptions:search', handler);
      // soft delete / finalize / restore
      const soft = (e: any) => {
        // optional: could dim card; keeping simple to avoid visual churn
      };
      const fin = (e: any) => {
        const id = e?.detail?.jobId;
        if (!id) return;
        setLocalRows((rs) => rs.filter((r) => r.job_id !== id));
        setSelected((s) => { const n = { ...s }; delete n[id]; return n; });
      };
      const restore = (e: any) => {
        // nothing to do; card still visible because we didn't remove it yet for soft delete
      };
      window.addEventListener('tx:softDelete', soft);
      window.addEventListener('tx:finalizeDelete', fin);
      window.addEventListener('tx:restore', restore);
      return () => {
        window.removeEventListener('transcriptions:search', handler);
        window.removeEventListener('tx:softDelete', soft);
        window.removeEventListener('tx:finalizeDelete', fin);
        window.removeEventListener('tx:restore', restore);
      };
    }
  }, []);

  // When query changes or new rows arrive, clear the overlay
  useEffect(() => {
    setListLoading(false);
  }, [searchParams?.toString(), localRows.length]);

  // 格式化来源显示
  const getSourceDisplay = (sourceType: string) => {
    const sourceMap: Record<string, { icon: string; color: string }> = {
      youtube_url: { icon: '🎬', color: 'text-red-500' },
      audio_url: { icon: '🔗', color: 'text-blue-500' },
      file_upload: { icon: '📁', color: 'text-green-500' }
    };
    return sourceMap[sourceType] || { icon: '📄', color: 'text-gray-500' };
  };

  // 格式化时长显示
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // 格式化创建时间（精确到秒，24小时制）
  const formatCreatedAt = (value: string | number | Date) => {
    const d = new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
  };

  return (
    <div className="space-y-6">
      {/* 操作栏 - 采用悬浮卡片设计 */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 backdrop-blur-sm rounded-2xl p-4 border border-primary/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button 
              className="px-4 py-2 rounded-xl bg-background hover:bg-primary/10 transition-all duration-200 flex items-center gap-2 text-sm font-medium border border-border/50"
              onClick={() => setSelected(Object.fromEntries(all.map((id) => [id, true])))}
            >
              <CheckCircle2 className="w-4 h-4" />
              {t.select_all}
            </button>
            <button 
              className="px-4 py-2 rounded-xl bg-background hover:bg-muted transition-all duration-200 text-sm font-medium border border-border/50"
              onClick={() => setSelected({})}
            >
              {t.clear}
            </button>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-2">
            <button 
              className={`px-4 py-2 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium ${
                selectedIds.length > 0 
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20' 
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
              }`}
              onClick={batchDelete}
              disabled={selectedIds.length === 0}
            >
              <Trash2 className="w-4 h-4" />
              {t.delete_selected} {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <button 
              className={`px-4 py-2 rounded-xl transition-all duration-200 flex items-center gap-2 text-sm font-medium ${
                selectedIds.length > 0 
                  ? 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20' 
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
              }`}
              onClick={exportZip}
              disabled={selectedIds.length === 0}
            >
              <Download className="w-4 h-4" />
              {t.export_zip}
            </button>
          </div>
        </div>
      </div>

      {/* 转录历史卡片网格 */}
      <div className="relative">
        {listLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}
        <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${listLoading ? 'pointer-events-none select-none opacity-95' : ''}`}> 
        {localRows.map((r) => {
          const sourceInfo = getSourceDisplay(r.source_type);
          const isSelected = !!selected[r.job_id];
          const isHovered = hoveredCard === r.job_id;
          
          return (
            <div
              key={r.job_id}
              className={`
                relative group rounded-2xl border transition-all duration-300
                ${isSelected 
                  ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10' 
                  : 'border-border/50 bg-card hover:border-border hover:shadow-lg'
                }
                ${isHovered ? 'scale-[1.02] shadow-xl' : ''}
              `}
              onMouseEnter={() => setHoveredCard(r.job_id)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              {/* 选择框 */}
              <div className="absolute top-4 left-4 z-10">
                <button
                  onClick={() => toggle(r.job_id)}
                  className="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 bg-background/80 backdrop-blur-sm hover:scale-110"
                >
                  {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* 卡片内容 */}
              <div className="p-6 pt-12">
                {/* 标题和来源 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 pr-2">
                    <h3 className="font-semibold text-base line-clamp-2 mb-2">
                      {r.title || 'Untitled Transcription'}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-lg">{sourceInfo.icon}</span>
                      <span className={sourceInfo.color}>
                        {t[`source_${r.source_type}`] || r.source_type}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 元信息 */}
                <div className="space-y-2 mb-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatCreatedAt(r.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(r.duration_sec || 0)}</span>
                  </div>
                </div>

                {/* 操作按钮 - 更紧凑的设计 */}
                <div className="border-t pt-4">
                  <Actions 
                    row={r} 
                    i18n={{
                      rerun: t.rerun ?? 'Re-run',
                      delete: t.delete ?? 'Delete',
                      confirm_delete: t.confirm_delete ?? 'Are you sure?',
                      confirm_title: t.confirm_title ?? 'Confirm',
                      confirm_desc: t.confirm_desc ?? 'This will delete the selected transcription.',
                      cancel: t.cancel ?? 'Cancel',
                      confirm: t.confirm ?? 'Confirm',
                      delete_failed: t.deleted_fail,
                      rerun_ok: t.rerun_ok ?? 'Re-run started',
                      rerun_failed: t.rerun_failed ?? 'Re-run failed',
                      rerun_file_hint: t.rerun_file_hint ?? 'Re-run for uploaded files is not supported. Please re-upload the file.',
                      undo: t.undo ?? 'Undo',
                      undo_success: t.undo_success ?? 'Restored',
                      undo_failed: t.undo_failed ?? 'Restore failed',
                    }} 
                  />
                </div>
              </div>

              {/* 悬浮效果装饰 */}
              <div className={`
                absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent 
                opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
              `} />
            </div>
          );
        })}
        </div>
      </div>

      {/* 空状态 */}
      {localRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileAudio className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-2">
            No transcriptions yet
          </p>
          <p className="text-sm text-muted-foreground">
            Start by uploading an audio file or pasting a YouTube URL
          </p>
        </div>
      )}
    </div>
  );
}
