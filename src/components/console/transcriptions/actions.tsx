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

  return (
    <div className="flex flex-wrap gap-2 text-sm items-center">
      <a className="text-primary hover:underline" href={`${base}?format=txt`}>TXT</a>
      <a className="text-primary hover:underline" href={`${base}?format=srt`}>SRT</a>
      <a className="text-primary hover:underline" href={`${base}?format=vtt`}>VTT</a>
      <a className="text-primary hover:underline" href={`${base}?format=json`}>JSON</a>
      <a className="text-primary hover:underline" href={`${base}?format=md`}>MD</a>
      <button onClick={onRerun} disabled={busy || row.source_type==='file_upload'} className="text-blue-400 hover:underline disabled:opacity-50">{i18n.rerun}</button>
      <button onClick={() => setOpen(true)} disabled={busy} className="text-red-400 hover:underline disabled:opacity-50">{i18n.delete}</button>

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
          className="text-emerald-400 hover:underline disabled:opacity-50"
          disabled={undoing}
        >
          {i18n.undo}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.confirm_title}</DialogTitle>
            <DialogDescription>{i18n.confirm_desc}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <button className="design-btn-secondary" onClick={() => setOpen(false)}>{i18n.cancel}</button>
            <button className="design-btn-primary" onClick={onDelete} disabled={busy}>{i18n.confirm}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
