"use client";

import { useState } from "react";
import { toast } from "sonner";

export default function TranscriptionsTable({ rows, t }: { rows: any[]; t: any }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const all = rows.map((r) => r.job_id);
  const selectedIds = all.filter((id) => selected[id]);

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    const res = await fetch('/api/transcriptions/batch/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_ids: selectedIds }) });
    if (res.ok) {
      toast.success(t.deleted_ok);
      location.reload();
    } else {
      toast.error(t.deleted_fail);
    }
  };

  const exportZip = async () => {
    if (selectedIds.length === 0) return;
    const res = await fetch('/api/transcriptions/batch/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_ids: selectedIds }) });
    if (!res.ok) { toast.error(t.export_fail); return; }
    const blob = await res.arrayBuffer();
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'transcriptions.zip'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.success(t.export_ok);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button className="design-btn-secondary" onClick={() => setSelected(Object.fromEntries(all.map((id) => [id, true])))}>{t.select_all}</button>
        <button className="design-btn-secondary" onClick={() => setSelected({})}>{t.clear}</button>
        <button className="design-btn-primary" onClick={batchDelete}>{t.delete_selected} ({selectedIds.length})</button>
        <button className="design-btn-primary" onClick={exportZip}>{t.export_zip}</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="w-10">#</th>
            <th>{t.created_at}</th>
            <th>{t.title}</th>
            <th>{t.source}</th>
            <th>{t.duration}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.job_id} className="h-12 border-b border-muted/30">
              <td><input type="checkbox" checked={!!selected[r.job_id]} onChange={() => toggle(r.job_id)} /></td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.title}</td>
              <td>{t[`source_${r.source_type}`]}</td>
              <td>{Math.round(r.duration_sec/60)}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

