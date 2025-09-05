import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getUserUuid } from "@/services/user";
import TableSlot from "@/components/console/slots/table";
import { Table as TableSlotType } from "@/types/slots/table";
import { TableColumn } from "@/types/blocks/table";
import Actions from "@/components/console/transcriptions/actions";
import TranscriptionsTable from "@/components/console/transcriptions/table";

export default async function Page({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string }> }) {
  const t = await getTranslations();
  const user_uuid = await getUserUuid();
  const callbackUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/my-transcriptions`;
  if (!user_uuid) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const s = (await (searchParams || Promise.resolve({} as any))) as { page?: string; q?: string };
  const page = Math.max(parseInt(s.page || '1', 10), 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const q = s.q || '';
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset), ...(q ? { q } : {}) }).toString();
  const res = await fetch(`${process.env.NEXT_PUBLIC_WEB_URL}/api/transcriptions?${qs}`, { cache: 'no-store' });
  const { success, data, total } = await res.json();
  const rows = success ? data : [];
  const totalPages = Math.max(Math.ceil((total || 0) / limit), 1);

  const columns: TableColumn[] = [
    { name: "created_at", title: t("my_transcriptions.table.created_at"), type: "time" },
    { name: "title", title: t("my_transcriptions.table.title") },
    { name: "source_type", title: t("my_transcriptions.table.source"), callback: (r: any) => t(`my_transcriptions.source.${r.source_type}`) },
    { name: "duration_sec", title: t("my_transcriptions.table.duration"), callback: (r: any) => `${Math.round(r.duration_sec/60)}m` },
    {
      name: "job_id",
      title: t("my_transcriptions.table.actions"),
      callback: (r: any) => <Actions row={r} i18n={{
        rerun: t('my_transcriptions.actions.rerun'),
        delete: t('my_transcriptions.actions.delete'),
        confirm_delete: t('my_transcriptions.actions.confirm_delete'),
        confirm_title: t('my_transcriptions.actions.confirm_title'),
        confirm_desc: t('my_transcriptions.actions.confirm_desc'),
        cancel: t('my_transcriptions.actions.cancel'),
        confirm: t('my_transcriptions.actions.confirm'),
        delete_failed: t('my_transcriptions.actions.delete_failed'),
        rerun_ok: t('my_transcriptions.actions.rerun_ok'),
        rerun_failed: t('my_transcriptions.actions.rerun_failed'),
        rerun_file_hint: t('my_transcriptions.actions.rerun_file_hint'),
        undo: t('my_transcriptions.actions.undo'),
        undo_success: t('my_transcriptions.actions.undo_success'),
        undo_failed: t('my_transcriptions.actions.undo_failed'),
      }} />
    },
  ];

  const table: TableSlotType = {
    title: t("my_transcriptions.title"),
    description: t("my_transcriptions.description"),
    columns,
    data: rows,
    empty_message: t("my_transcriptions.empty"),
  };

  // Search + Pagination UI
  const searchForm = (
    <form className="mb-4 flex gap-2" action="/my-transcriptions">
      <input name="q" defaultValue={q} placeholder={t('my_transcriptions.search_placeholder')} className="px-3 py-2 rounded-md bg-muted text-sm w-64" />
      <button className="design-btn-secondary" type="submit">{t('my_transcriptions.search')}</button>
    </form>
  );

  const pagination = (
    <div className="mt-4 flex gap-3 items-center">
      <a className={`text-primary hover:underline ${page<=1?'pointer-events-none opacity-50':''}`} href={`/my-transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.max(page-1,1)) }).toString()}`}>{t('my_transcriptions.prev')}</a>
      <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
      <a className={`text-primary hover:underline ${page>=totalPages?'pointer-events-none opacity-50':''}`} href={`/my-transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.min(page+1,totalPages)) }).toString()}`}>{t('my_transcriptions.next')}</a>
    </div>
  );

  return (
    <div className="space-y-4">
      {searchForm}
      <TableSlot {...table} />
      <TranscriptionsTable rows={rows} t={{
        select_all: t('my_transcriptions.select_all'),
        clear: t('my_transcriptions.clear'),
        delete_selected: t('my_transcriptions.delete_selected'),
        export_zip: t('my_transcriptions.export_zip'),
        deleted_ok: t('my_transcriptions.deleted_ok'),
        deleted_fail: t('my_transcriptions.deleted_fail'),
        export_ok: t('my_transcriptions.export_ok'),
        export_fail: t('my_transcriptions.export_fail'),
        created_at: t('my_transcriptions.table.created_at'),
        title: t('my_transcriptions.table.title'),
        source: t('my_transcriptions.table.source'),
        duration: t('my_transcriptions.table.duration'),
        source_youtube_url: t('my_transcriptions.source.youtube_url'),
        source_audio_url: t('my_transcriptions.source.audio_url'),
        source_file_upload: t('my_transcriptions.source.file_upload'),
      }} />
      {pagination}
    </div>
  );
}
