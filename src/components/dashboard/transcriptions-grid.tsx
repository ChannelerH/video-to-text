"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { 
  FileAudio, 
  Clock, 
  Calendar, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Circle,
  MoreVertical,
  Edit,
  Eye,
  Copy,
  FileText
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TranscriptionGridProps {
  rows: any[];
  locale: string;
}

export default function TranscriptionGrid({ rows, locale }: TranscriptionGridProps) {
  const searchParams = useSearchParams();
  const [localRows, setLocalRows] = useState<any[]>(rows || []);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [listLoading, setListLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const all = localRows.map((r) => r.job_id);
  const selectedIds = all.filter((id) => selected[id]);

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true); 
    setListLoading(true);
    try {
      const res = await fetch('/api/transcriptions/batch/delete', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ job_ids: selectedIds }) 
      });
      if (res.ok) {
        toast.success('Deleted successfully');
        setLocalRows(rs => rs.filter(r => !selectedIds.includes(r.job_id)));
        setSelected({});
      } else {
        toast.error('Delete failed');
      }
    } finally { 
      setDeleting(false); 
      setListLoading(false); 
    }
  };

  const exportZip = async () => {
    if (selectedIds.length === 0) return;
    try {
      setExporting(true); 
      setListLoading(true);
      const res = await fetch('/api/transcriptions/batch/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: selectedIds })
      });
      if (!res.ok) { 
        toast.error('Export failed'); 
        return; 
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) { 
        toast.error('Export failed'); 
        return; 
      }
      const fname = `transcriptions_${new Date().toISOString().replace(/[:T]/g,'-').split('.')[0]}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; 
      a.download = fname; 
      document.body.appendChild(a); 
      a.click(); 
      a.remove(); 
      URL.revokeObjectURL(url);
      toast.success('Export successful');
    } catch (e) {
      console.error('Export ZIP error:', e);
      toast.error('Export failed');
    } finally { 
      setExporting(false); 
      setListLoading(false); 
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      const res = await fetch(`/api/transcriptions/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Deleted successfully');
        setLocalRows(rs => rs.filter(r => r.job_id !== jobId));
      } else {
        toast.error('Delete failed');
      }
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const handleCopyText = async (jobId: string) => {
    try {
      const res = await fetch(`/api/transcriptions/${jobId}/text`);
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
      }
    } catch (e) {
      toast.error('Copy failed');
    }
  };

  const handleDownload = async (jobId: string, format: string) => {
    try {
      const res = await fetch(`/api/transcriptions/${jobId}/download?format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast.error('Download failed');
    }
  };

  // 格式化来源显示
  const getSourceDisplay = (sourceType: string) => {
    const sourceMap: Record<string, { icon: string; color: string; label: string }> = {
      youtube_url: { icon: '🎬', color: 'text-red-500', label: 'YouTube' },
      audio_url: { icon: '🔗', color: 'text-blue-500', label: 'URL' },
      file_upload: { icon: '📁', color: 'text-green-500', label: 'Upload' }
    };
    return sourceMap[sourceType] || { icon: '📄', color: 'text-gray-500', label: 'Unknown' };
  };

  // 格式化时长显示
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 格式化创建时间
  const formatCreatedAt = (value: string | number | Date) => {
    const d = new Date(value);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    setListLoading(false);
  }, [searchParams?.toString(), localRows.length]);

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button 
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-medium"
              onClick={() => setSelected(Object.fromEntries(all.map((id) => [id, true])))}
            >
              <CheckCircle2 className="w-4 h-4" />
              Select All
            </button>
            <button 
              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm font-medium"
              onClick={() => setSelected({})}
            >
              Clear
            </button>
          </div>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-2">
            <button 
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                selectedIds.length > 0 
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
              }`}
              onClick={batchDelete}
              disabled={selectedIds.length === 0 || deleting}
            >
              <Trash2 className="w-4 h-4" />
              Delete {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
            <button 
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium ${
                selectedIds.length > 0 
                  ? 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
              }`}
              onClick={exportZip}
              disabled={selectedIds.length === 0 || exporting}
            >
              <Download className="w-4 h-4" />
              Export ZIP
            </button>
          </div>
        </div>
      </div>

      {/* 卡片网格 */}
      <div className="relative">
        {listLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl">
            <div className="h-6 w-6 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
        )}
        
        <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${listLoading ? 'pointer-events-none opacity-50' : ''}`}>
          {localRows.map((r) => {
            const sourceInfo = getSourceDisplay(r.source_type);
            const isSelected = !!selected[r.job_id];
            const isHovered = hoveredCard === r.job_id;
            
            return (
              <div
                key={r.job_id}
                className={`
                  relative group rounded-xl border transition-all duration-300
                  ${isSelected 
                    ? 'border-purple-500/50 bg-purple-500/5 shadow-lg shadow-purple-500/10' 
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-700 hover:shadow-lg'
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
                    className="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all bg-gray-900/80 backdrop-blur-sm hover:scale-110"
                  >
                    {isSelected ? (
                      <CheckCircle2 className="w-5 h-5 text-purple-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-500" />
                    )}
                  </button>
                </div>

                {/* 更多操作菜单 */}
                <div className="absolute top-4 right-4 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-2 rounded-lg bg-gray-900/80 backdrop-blur-sm hover:bg-gray-800 transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link 
                          href={`/${locale}/dashboard/editor/${r.job_id}`}
                          className="flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link 
                          href={`/${locale}/dashboard/editor/${r.job_id}`}
                          className="flex items-center gap-2"
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCopyText(r.job_id)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Text
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDownload(r.job_id, 'txt')}>
                        <FileText className="w-4 h-4 mr-2" />
                        Download TXT
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(r.job_id, 'srt')}>
                        <FileText className="w-4 h-4 mr-2" />
                        Download SRT
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(r.job_id, 'vtt')}>
                        <FileText className="w-4 h-4 mr-2" />
                        Download VTT
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDelete(r.job_id)}
                        className="text-red-500 focus:text-red-500"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* 卡片内容 */}
                <Link href={`/${locale}/dashboard/editor/${r.job_id}`}>
                  <div className="p-6 pt-16">
                    {/* 标题和来源 */}
                    <div className="mb-4">
                      <h3 className="font-semibold text-white text-base line-clamp-2 mb-2">
                        {r.title || 'Untitled Transcription'}
                      </h3>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-lg">{sourceInfo.icon}</span>
                        <span className={sourceInfo.color}>
                          {sourceInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* 元信息 */}
                    <div className="space-y-2 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatCreatedAt(r.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{formatDuration(r.duration_sec || 0)}</span>
                      </div>
                    </div>

                    {/* 状态标签 */}
                    <div className="mt-4 flex items-center gap-2">
                      <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                        Completed
                      </span>
                    </div>
                  </div>
                </Link>

                {/* 悬浮效果装饰 */}
                <div className={`
                  absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent 
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
          <FileAudio className="w-16 h-16 text-gray-600 mb-4" />
          <p className="text-lg font-medium text-gray-300 mb-2">
            No transcriptions yet
          </p>
          <p className="text-sm text-gray-500">
            Start by uploading a file or pasting a YouTube link
          </p>
        </div>
      )}
    </div>
  );
}