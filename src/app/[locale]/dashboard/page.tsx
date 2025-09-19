import { Fragment, Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

import QuickActions from "@/components/dashboard/quick-actions";
import TranscriptionsSearch from "@/components/dashboard/transcriptions-search";
import TranscriptionsTable from "@/components/console/transcriptions/table";
import { db } from "@/db";
import { transcriptions } from "@/db/schema";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";

import { getUserUuid } from "@/services/user";
import { getUserTier, UserTier } from "@/services/user-tier";
import { getUserUsageSummary } from "@/services/user-minutes";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; q?: string }>;
}

type TranscriptionRow = typeof transcriptions.$inferSelect;

type DashboardData = {
  page: number;
  totalPages: number;
  totalCount: number;
  rows: TranscriptionRow[];
  stats: {
    totalTranscriptions: number;
    totalMinutes: number;
    thisMonth: number;
  };
  searchQuery: string;
  userTier: UserTier;
  usage: {
    minutesUsed: number;
    minutesLimit: number;
    packBalance: number;
    totalAllowance: number;
    isUnlimited: boolean;
    percentageUsed: number;
  };
};

const PAGE_LIMIT = 12;

export default async function DashboardPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const userUuid = await getUserUuid();

  if (!userUuid) {
    redirect(`/${locale}/auth/signin`);
  }

  const s = (await (searchParams || Promise.resolve({} as any))) as {
    page?: string;
    q?: string;
    highlight?: string;
    open?: string;
  };

  if (s.open) {
    redirect(`/${locale}/dashboard/editor/${s.open}`);
  }

  const q = s.q?.trim() || "";
  const rawPage = Number(s.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const dashboardDataPromise = getDashboardData({
    userUuid: userUuid as string,
    page,
    query: q,
  });

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-800 bg-[#0a0a0f]/80 backdrop-blur-sm">
          <Suspense fallback={<HeaderSkeleton />}>
            <DashboardHeader dataPromise={dashboardDataPromise} locale={locale} />
          </Suspense>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="px-8 py-6 max-w-7xl mx-auto">
            <TranscriptionsSearch
              defaultQuery={q}
              placeholder="Search transcriptions..."
              locale={locale}
            />

            <Suspense fallback={<TranscriptionsSkeleton />}>
              <DashboardTranscriptions
                dataPromise={dashboardDataPromise}
                locale={locale}
                highlight={s.highlight}
              />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="w-80 border-l border-gray-800 bg-[#0a0a0f]/50">
        <div className="p-6 space-y-6">
          <QuickActions locale={locale} />

          <Suspense fallback={<UsageSummarySkeleton />}>
            <UsageSummaryCard dataPromise={dashboardDataPromise} />
          </Suspense>

          <Suspense fallback={<UpgradeCardSkeleton />}>
            <UpgradePrompt dataPromise={dashboardDataPromise} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function getDashboardData({
  userUuid,
  page,
  query,
}: {
  userUuid: string;
  page: number;
  query: string;
}): Promise<DashboardData> {
  const [userTier, usageSummary] = await Promise.all([
    getUserTier(userUuid),
    getUserUsageSummary(userUuid),
  ]);

  const retentionDays =
    userTier === UserTier.PRO ? 365 : userTier === UserTier.BASIC ? 90 : 7;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  firstDayOfMonth.setHours(0, 0, 0, 0);

  const baseWhere = and(
    eq(transcriptions.user_uuid, userUuid),
    eq(transcriptions.deleted, false),
    gte(transcriptions.created_at, cutoffDate),
  );

  const whereClause = query
    ? and(
        baseWhere,
        or(
          ilike(transcriptions.title, `%${query}%`),
          ilike(transcriptions.source_url, `%${query}%`),
        ),
      )
    : baseWhere;

  const offset = (page - 1) * PAGE_LIMIT;

  const [totalCountResult, transcriptionRows, statsTotal, statsThisMonth] =
    await Promise.all([
      db()
        .select({ count: sql<number>`COUNT(*)` })
        .from(transcriptions)
        .where(whereClause),
      db()
        .select()
        .from(transcriptions)
        .where(whereClause)
        .orderBy(desc(transcriptions.created_at))
        .limit(PAGE_LIMIT)
        .offset(offset),
      db()
        .select({ minutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)` })
        .from(transcriptions)
        .where(and(eq(transcriptions.user_uuid, userUuid), eq(transcriptions.deleted, false))),
      db()
        .select({ count: sql<number>`COUNT(*)` })
        .from(transcriptions)
        .where(
          and(
            eq(transcriptions.user_uuid, userUuid),
            eq(transcriptions.deleted, false),
            gte(transcriptions.created_at, firstDayOfMonth),
          ),
        ),
    ]);

  const totalCount = Number(totalCountResult[0]?.count || 0);
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_LIMIT), 1);

  const minutesUsed = usageSummary.totalUsed;
  const minutesLimit =
    usageSummary.subscriptionTotal === 0
      ? 30
      : usageSummary.subscriptionTotal;
  const packBalance = usageSummary.packMinutes;
  const totalAllowance = usageSummary.totalAvailable;

  return {
    page,
    totalPages,
    totalCount,
    rows: transcriptionRows,
    stats: {
      totalTranscriptions: totalCount,
      totalMinutes: Number(statsTotal[0]?.minutes || 0),
      thisMonth: Number(statsThisMonth[0]?.count || 0),
    },
    searchQuery: query,
    userTier,
    usage: {
      minutesUsed,
      minutesLimit,
      packBalance,
      totalAllowance,
      isUnlimited: usageSummary.isUnlimited,
      percentageUsed: usageSummary.percentageUsed,
    },
  };
}

function buildPages(totalPages: number, currentPage: number) {
  const set = new Set<number>();

  if (totalPages >= 1) set.add(1);
  if (totalPages >= 2) set.add(totalPages);

  for (let p = currentPage - 2; p <= currentPage + 2; p++) {
    if (p >= 1 && p <= totalPages) set.add(p);
  }

  return Array.from(set).sort((a, b) => a - b);
}

async function DashboardHeader({
  dataPromise,
  locale,
}: {
  dataPromise: Promise<DashboardData>;
  locale: string;
}) {
  const data = await dataPromise;
  const { userTier, stats } = data;

  return (
    <div className="px-8 py-5">
      <h1 className="text-2xl font-semibold text-white mb-4">All Transcriptions</h1>

      {(userTier === UserTier.FREE || userTier === UserTier.BASIC) && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm text-blue-300">
            {userTier === UserTier.FREE
              ? "📅 Showing transcriptions from the last 7 days. Older files are automatically archived."
              : "📅 Showing transcriptions from the last 90 days."}
            {userTier === UserTier.FREE && (
              <Link
                href={`/${locale}/pricing`}
                className="ml-2 text-blue-400 hover:text-blue-300 underline"
              >
                Upgrade for longer retention
              </Link>
            )}
          </p>
        </div>
      )}

      <div className="flex gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-sm text-gray-400">This Month:</span>
          <span className="text-sm font-medium text-white">
            {stats.thisMonth} {stats.thisMonth === 1 ? 'transcription' : 'transcriptions'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-gray-400">Minutes Used:</span>
          <span className="text-sm font-medium text-white">
            {data.usage.minutesUsed} / {data.usage.isUnlimited ? '∞' : data.usage.totalAllowance}
          </span>
        </div>
      </div>
    </div>
  );
}

async function DashboardTranscriptions({
  dataPromise,
  locale,
  highlight,
}: {
  dataPromise: Promise<DashboardData>;
  locale: string;
  highlight?: string;
}) {
  const data = await dataPromise;
  const { rows, page, totalPages, searchQuery } = data;
  const pages = buildPages(totalPages, page);

  const pagination =
    totalPages > 1 && (
      <div className="mt-8 flex justify-center">
        <div className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-900/30 border border-gray-800">
          <Link
            className={`
              px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium
              ${page <= 1
                ? "pointer-events-none opacity-50 text-gray-500"
                : "hover:bg-gray-800 hover:shadow-sm text-white"}
            `}
            href={`/${locale}/dashboard?${new URLSearchParams({
              ...(searchQuery ? { q: searchQuery } : {}),
              page: String(Math.max(page - 1, 1)),
            }).toString()}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>

          {(() => {
            let last = 0;
            return (
              <>
                {pages.map((p) => {
                  const gap = p - last;
                  last = p;

                  return (
                    <Fragment key={`p-${p}`}>
                      {gap > 1 && <span className="px-2 text-gray-500">...</span>}
                      <Link
                        className={`
                          px-3 py-2 rounded-lg text-sm font-medium transition-colors
                          ${p === page
                            ? "bg-purple-600 text-white"
                            : "hover:bg-gray-800 text-gray-300"}
                        `}
                        href={`/${locale}/dashboard?${new URLSearchParams({
                          ...(searchQuery ? { q: searchQuery } : {}),
                          page: String(p),
                        }).toString()}`}
                      >
                        {p}
                      </Link>
                    </Fragment>
                  );
                })}
              </>
            );
          })()}

          <Link
            className={`
              px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium
              ${page >= totalPages
                ? "pointer-events-none opacity-50 text-gray-500"
                : "hover:bg-gray-800 hover:shadow-sm text-white"}
            `}
            href={`/${locale}/dashboard?${new URLSearchParams({
              ...(searchQuery ? { q: searchQuery } : {}),
              page: String(Math.min(page + 1, totalPages)),
            }).toString()}`}
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );

  return (
    <>
      <TranscriptionsTable
        rows={rows}
        highlightJobId={highlight}
        userTier={data.userTier}
        t={{
          select_all: "Select All",
          clear: "Clear",
          delete_selected: "Delete Selected",
          export_zip: "Export ZIP",
          deleted_ok: "Deleted successfully",
          deleted_fail: "Delete failed",
          export_ok: "Export successful",
          export_fail: "Export failed",
          created_at: "Created",
          title: "Title",
          source: "Source",
          duration: "Duration",
          source_youtube_url: "YouTube",
          source_audio_url: "URL",
          source_file_upload: "Upload",
          rerun: "Re-run",
          delete: "Delete",
          confirm_delete: "Are you sure?",
          confirm_title: "Confirm Delete",
          confirm_desc: "This will permanently delete the selected transcription.",
          cancel: "Cancel",
          confirm: "Confirm",
          rerun_ok: "Re-run started",
          rerun_failed: "Re-run failed",
          rerun_file_hint:
            "Re-run for uploaded files is not supported. Please re-upload the file.",
          undo: "Undo",
          undo_success: "Restored",
          undo_failed: "Restore failed",
          untitled: "Untitled Transcription",
          table_empty_state: {
            title: "No transcriptions yet",
            description: "Start by uploading a file or pasting a YouTube link",
          },
        }}
      />

      {pagination}
    </>
  );
}

async function UsageSummaryCard({
  dataPromise,
}: {
  dataPromise: Promise<DashboardData>;
}) {
  const { usage } = await dataPromise;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">Usage Summary</h3>
      </div>

      <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-purple-400">
            {usage.minutesLimit === -1
              ? "Unlimited"
              : Math.max(0, usage.totalAllowance - usage.minutesUsed)}
            {usage.minutesLimit === -1 ? "" : " minutes remaining"}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Used: {usage.minutesUsed || 0}</span>
            <span>
              Total: {usage.minutesLimit === -1 ? "Unlimited" : usage.totalAllowance}
            </span>
          </div>

          {usage.minutesLimit !== -1 && (
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full"
                style={{ width: `${Math.min(100, usage.percentageUsed)}%` }}
              />
            </div>
          )}

          {usage.minutesLimit !== -1 && usage.packBalance > 0 && (
            <div className="text-[11px] text-gray-500">
              Includes {usage.packBalance} min from minute packs
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function UpgradePrompt({
  dataPromise,
  locale,
}: {
  dataPromise: Promise<DashboardData>;
  locale: string;
}) {
  const { userTier } = await dataPromise;

  if (userTier !== UserTier.FREE && userTier !== UserTier.BASIC) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-lg p-5 border border-purple-500/30">
      <h3 className="text-white font-medium mb-2">
        {userTier === UserTier.FREE
          ? "Unlock Full Features"
          : "Upgrade to Pro"}
      </h3>

      {userTier === UserTier.FREE ? (
        <>
          <p className="text-gray-300 text-sm mb-4">
            Free users can only view the first 5 minutes sample and basic features.
            Upgrade to BASIC/PRO to unlock full content, complete speaker labels/AI
            features, and all export formats.
          </p>
          <ul className="text-xs text-gray-300 space-y-1 mb-4">
            <li>✓ Full transcription content</li>
            <li>✓ Complete AI chapters & summaries</li>
            <li>✓ All export formats</li>
            <li>✓ Speaker diarization</li>
          </ul>
        </>
      ) : (
        <>
          <p className="text-gray-300 text-sm mb-4">
            Get more transcription minutes and premium features
          </p>
          <ul className="text-xs text-gray-300 space-y-1 mb-4">
            <li>✓ 2,200 minutes monthly (2000 standard + 200 high-accuracy)</li>
            <li>✓ Priority processing queue</li>
            <li>✓ Batch processing & export</li>
            <li>✓ Extended file retention (365 days)</li>
          </ul>
        </>
      )}

      <Link
        href={`/${locale}/pricing`}
        className="block w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-sm transition-colors text-center"
      >
        Upgrade Now
      </Link>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="px-8 py-5 animate-pulse space-y-4">
      <div className="h-7 w-48 bg-gray-800 rounded" />
      <div className="h-12 w-full max-w-2xl bg-gray-900 rounded" />
      <div className="flex gap-6">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-700" />
            <div className="h-4 w-20 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptionsSkeleton() {
  return (
    <div className="mt-6 space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="h-16 rounded-lg bg-gray-900" />
      ))}
    </div>
  );
}

function UsageSummarySkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-24 bg-gray-800 rounded mb-3" />
      <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800 space-y-3">
        <div className="h-4 w-40 bg-gray-800 rounded" />
        <div className="h-2 w-full bg-gray-800 rounded" />
        <div className="h-3 w-32 bg-gray-800 rounded" />
      </div>
    </div>
  );
}

function UpgradeCardSkeleton() {
  return (
    <div className="bg-gray-900/30 border border-gray-800 rounded-lg p-5 animate-pulse space-y-3">
      <div className="h-5 w-36 bg-gray-800 rounded" />
      <div className="h-4 w-full bg-gray-800 rounded" />
      <div className="h-8 w-full bg-gray-800 rounded" />
    </div>
  );
}
