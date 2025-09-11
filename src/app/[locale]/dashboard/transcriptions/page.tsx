import { getUserUuid } from "@/services/user";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import QuickActions from '@/components/dashboard/quick-actions';
import TranscriptionsSearch from '@/components/dashboard/transcriptions-search';
import TranscriptionsTable from '@/components/console/transcriptions/table';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq, and, gte, sql, desc, or, ilike } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getUserTier, UserTier } from '@/services/user-tier';

interface PageProps {
  params: { locale: string };
  searchParams?: { page?: string; q?: string };
}

export default async function TranscriptionsPage({ 
  params,
  searchParams 
}: PageProps) {
  const { locale } = params;
  const user_uuid = await getUserUuid();
  
  if (!user_uuid) {
    redirect(`/${locale}/auth/signin`);
  }

  const s = (searchParams || ({} as any)) as { page?: string; q?: string };
  const q = s.q?.trim() || '';
  const rawPage = Number(s.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = 12;
  const offset = (page - 1) * limit;
  
  // (Optional) user data fetch removed as unused

  // Build where clause with search - handle both cases properly
  let whereClause: any;
  if (q && q.length > 0) {
    whereClause = and(
      eq(transcriptions.user_uuid, user_uuid),
      eq(transcriptions.deleted, false),
      or(
        ilike(transcriptions.title, `%${q}%`),
        ilike(transcriptions.source_url, `%${q}%`)
      )
    );
  } else {
    whereClause = and(
      eq(transcriptions.user_uuid, user_uuid),
      eq(transcriptions.deleted, false)
    );
  }

  // Get total count for pagination
  const [totalCountResult, transcriptionsList] = await Promise.all([
    db()
      .select({ count: sql<number>`COUNT(*)` })
      .from(transcriptions)
      .where(whereClause),
    db()
      .select()
      .from(transcriptions)
      .where(whereClause)
      .orderBy(desc(transcriptions.created_at))
      .limit(limit)
      .offset(offset)
  ]);

  const totalCount = Number(totalCountResult[0]?.count || 0);
  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);

  // Calculate monthly usage
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const monthlyUsage = await db()
    .select({
      totalMinutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)`
    })
    .from(transcriptions)
    .where(
      and(
        eq(transcriptions.user_uuid, user_uuid),
        eq(transcriptions.deleted, false),
        gte(transcriptions.created_at, firstDayOfMonth)
      )
    );

  const minutesUsed = Number(monthlyUsage[0]?.totalMinutes || 0);
  
  // Determine tier limits via user-tier service
  const userTier = await getUserTier(user_uuid as string);
  const minutesLimit = userTier === UserTier.PREMIUM
    ? -1
    : (
      userTier === UserTier.PRO ? 1000 :
      userTier === UserTier.BASIC ? 100 :
      10
    );

  // Create usage object
  const usage = {
    minutesUsed,
    minutesLimit,
    tier: userTier,
    isUnlimited: minutesLimit === -1,
    percentageUsed: minutesLimit > 0 ? (minutesUsed / minutesLimit) * 100 : 0
  };

  // Get stats (exclude deleted)
  const [statsTotal, statsThisMonth] = await Promise.all([
    db()
      .select({ minutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)` })
      .from(transcriptions)
      .where(and(eq(transcriptions.user_uuid, user_uuid), eq(transcriptions.deleted, false))),
    db()
      .select({ count: sql<number>`COUNT(*)` })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.user_uuid, user_uuid),
          eq(transcriptions.deleted, false),
          gte(transcriptions.created_at, firstDayOfMonth)
        )
      )
  ]);

  const stats = {
    totalTranscriptions: totalCount,
    totalMinutes: Number(statsTotal[0]?.minutes || 0),
    thisMonth: Number(statsThisMonth[0]?.count || 0)
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  // Pagination component
  const pagination = totalPages > 1 && (
    <div className="mt-8 flex justify-center">
      <div className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900/30 border border-gray-800">
        {/* Previous Button */}
        <Link 
          className={`
            px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium
            ${page <= 1 
              ? 'pointer-events-none opacity-50 text-gray-500' 
              : 'hover:bg-gray-800 hover:shadow-sm text-white'
            }
          `} 
          href={`/${locale}/dashboard/transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.max(page-1,1)) }).toString()}`}
        >
          <ChevronLeft className="w-4 h-4" />
        </Link>
        
        {/* First page */}
        {page > 3 && (
          <>
            <Link
              className="px-3 py-2 rounded-lg hover:bg-gray-800 text-sm font-medium text-white transition-colors"
              href={`/${locale}/dashboard/transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: '1' }).toString()}`}
            >
              1
            </Link>
            {page > 4 && <span className="px-2 text-gray-500">...</span>}
          </>
        )}
        
        {/* Page numbers */}
        {getPageNumbers().map(pageNum => (
          <Link
            key={pageNum}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${pageNum === page 
                ? 'bg-purple-600 text-white' 
                : 'hover:bg-gray-800 text-gray-300'
              }
            `}
            href={`/${locale}/dashboard/transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(pageNum) }).toString()}`}
          >
            {pageNum}
          </Link>
        ))}
        
        {/* Last page */}
        {page < totalPages - 2 && (
          <>
            {page < totalPages - 3 && <span className="px-2 text-gray-500">...</span>}
            <Link
              className="px-3 py-2 rounded-lg hover:bg-gray-800 text-sm font-medium text-white transition-colors"
              href={`/${locale}/dashboard/transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(totalPages) }).toString()}`}
            >
              {totalPages}
            </Link>
          </>
        )}
        
        {/* Next Button */}
        <Link 
          className={`
            px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium
            ${page >= totalPages 
              ? 'pointer-events-none opacity-50 text-gray-500' 
              : 'hover:bg-gray-800 hover:shadow-sm text-white'
            }
          `} 
          href={`/${locale}/dashboard/transcriptions?${new URLSearchParams({ ...(q?{q}:{}), page: String(Math.min(page+1,totalPages)) }).toString()}`}
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-800 bg-[#0a0a0f]/80 backdrop-blur-sm">
          <div className="px-8 py-5">
            <h1 className="text-2xl font-semibold text-white mb-4">All Transcriptions</h1>
            
            {/* Statistics Bar */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-sm text-gray-400">Total:</span>
                <span className="text-sm font-medium text-white">{stats.totalTranscriptions}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                <span className="text-sm text-gray-400">This Month:</span>
                <span className="text-sm font-medium text-white">{stats.thisMonth}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-400">Total Minutes:</span>
                <span className="text-sm font-medium text-white">{stats.totalMinutes}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-auto">
          <div className="px-8 py-6 max-w-7xl mx-auto">
            {/* Search Bar */}
            <TranscriptionsSearch defaultQuery={q} placeholder="Search transcriptions..." locale={locale} />
            
            {/* Transcriptions Table/Grid */}
            <TranscriptionsTable 
              rows={transcriptionsList} 
              t={{
                select_all: 'Select All',
                clear: 'Clear',
                delete_selected: 'Delete Selected',
                export_zip: 'Export ZIP',
                deleted_ok: 'Deleted successfully',
                deleted_fail: 'Delete failed',
                export_ok: 'Export successful',
                export_fail: 'Export failed',
                created_at: 'Created',
                title: 'Title',
                source: 'Source',
                duration: 'Duration',
                source_youtube_url: 'YouTube',
                source_audio_url: 'URL',
                source_file_upload: 'Upload',
                rerun: 'Re-run',
                delete: 'Delete',
                confirm_delete: 'Are you sure?',
                confirm_title: 'Confirm Delete',
                confirm_desc: 'This will permanently delete the selected transcription.',
                cancel: 'Cancel',
                confirm: 'Confirm',
                rerun_ok: 'Re-run started',
                rerun_failed: 'Re-run failed',
                rerun_file_hint: 'Re-run for uploaded files is not supported. Please re-upload the file.',
                undo: 'Undo',
                undo_success: 'Restored',
                undo_failed: 'Restore failed',
                untitled: 'Untitled Transcription',
                table_empty_state: {
                  title: 'No transcriptions yet',
                  description: 'Start by uploading a file or pasting a YouTube link'
                }
              }} 
            />
            
            {/* Pagination */}
            {pagination}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 border-l border-gray-800 bg-[#0a0a0f]/50">
        <div className="p-6 space-y-6">
          {/* Quick Actions */}
          <QuickActions locale={locale} />

          {/* Usage Summary */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-400">Usage Summary</h3>
            </div>
            
            <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-purple-400">
                  {usage.minutesLimit > 0 ? Math.max(0, usage.minutesLimit - usage.minutesUsed) : 'Unlimited'} {usage.minutesLimit > 0 ? 'minutes remaining' : ''}
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Used: {usage.minutesUsed || 0}</span>
                  <span>Total: {usage.minutesLimit > 0 ? usage.minutesLimit : 'Unlimited'}</span>
                </div>
                {usage.minutesLimit > 0 && (
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full"
                      style={{ width: `${Math.min(100, (usage.minutesUsed / usage.minutesLimit) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upgrade Card */}
          {usage.tier === 'free' && (
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 
              rounded-lg p-5 border border-purple-500/30">
              <h3 className="text-white font-medium mb-2">
                Upgrade to Pro
              </h3>
              <p className="text-gray-300 text-sm mb-4">
                Get more transcription minutes
              </p>
              
              <ul className="text-xs text-gray-300 space-y-1 mb-4">
                <li>✓ 1,000 minutes monthly</li>
                <li>✓ Priority processing</li>
                <li>✓ Advanced features</li>
              </ul>
              
              <Link 
                href={`/${locale}/pricing`}
                className="block w-full py-2 bg-purple-600 hover:bg-purple-700 
                  text-white font-medium rounded-lg text-sm transition-colors text-center"
              >
                Upgrade Now
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
