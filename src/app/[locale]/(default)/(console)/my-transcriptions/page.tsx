import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getUserUuid } from "@/services/user";
import Actions from "@/components/console/transcriptions/actions";
import TranscriptionsTable from "@/components/console/transcriptions/table";
import { headers as nextHeaders, cookies } from "next/headers";

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
  // 构造与当前请求同源的绝对地址，确保 SSR 可携带 Cookie
  const h = await nextHeaders();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || 'http';
  const base = `${proto}://${host}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const res = await fetch(`${base}/api/transcriptions?${qs}`, {
    cache: 'no-store',
    headers: { cookie: cookieHeader }
  });
  const { success, data, total } = await res.json();
  const rows = success ? data : [];
  const totalPages = Math.max(Math.ceil((total || 0) / limit), 1);

  // 合并为一个操作区 + 表格（TranscriptionsTable 自带操作按钮与表头）

  // Search + Pagination UI with modern design
  const searchForm = (
    <form className="mb-6" action="/my-transcriptions">
      <div className="relative max-w-md">
        <input 
          name="q" 
          defaultValue={q} 
          placeholder={t('my_transcriptions.search_placeholder')} 
          className="
            w-full px-4 py-3 pl-12 rounded-xl 
            bg-background border border-border/50 
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
            transition-all duration-200 text-sm
            placeholder:text-muted-foreground/60
          " 
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button 
          className="
            absolute right-2 top-1/2 -translate-y-1/2
            px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground
            transition-colors duration-200 text-sm font-medium
          " 
          type="submit"
        >
          {t('my_transcriptions.search')}
        </button>
      </div>
    </form>
  );

  const pagination = (
    <div className="mt-8 flex justify-center">
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-border/50">
        <a 
          className={`
            px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium
            ${page <= 1 
              ? 'pointer-events-none opacity-50 text-muted-foreground' 
              : 'hover:bg-background hover:shadow-sm text-foreground'
            }
          `} 
          href={`/my-transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.max(page-1,1)) }).toString()}`}
        >
          ← {t('my_transcriptions.prev')}
        </a>
        
        <div className="px-4 py-2 text-sm font-medium text-muted-foreground">
          <span className="text-foreground">{page}</span> / {totalPages}
        </div>
        
        <a 
          className={`
            px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium
            ${page >= totalPages 
              ? 'pointer-events-none opacity-50 text-muted-foreground' 
              : 'hover:bg-background hover:shadow-sm text-foreground'
            }
          `} 
          href={`/my-transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.min(page+1,totalPages)) }).toString()}`}
        >
          {t('my_transcriptions.next')} →
        </a>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('my_transcriptions.title') || 'My Transcriptions'}</h1>
        <p className="text-muted-foreground">
          {t('my_transcriptions.subtitle') || 'Manage your transcription history and downloads'}
        </p>
      </div>
      
      {searchForm}
      
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
      
      {rows.length > 0 && pagination}
    </div>
  );
}
