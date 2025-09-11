import { getTranslations } from 'next-intl/server';
import { getUserUuid } from '@/services/user';
import Link from 'next/link';
import { 
  FileText, 
  Clock, 
  TrendingUp, 
  Upload,
  Youtube,
  ArrowRight,
  Sparkles,
  Zap,
  BarChart3,
  Activity
} from 'lucide-react';
import DashboardActions from '@/components/dashboard/dashboard-actions';
import EmptyStateButton from '@/components/dashboard/empty-state-button';

export default async function DashboardPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params;
  const t = await getTranslations();
  const userUuid = await getUserUuid();
  
  // Fetch user's recent transcriptions
  const recentTranscriptions = await fetchRecentTranscriptions(userUuid || '');
  
  // Fetch usage statistics
  const stats = await fetchUserStats(userUuid || '');

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="px-8 py-8">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            {t('welcome_back')}
          </h1>
          <p className="text-gray-400">{t('dashboard_subtitle')}</p>
        </div>

        {/* Quick Actions */}
        <DashboardActions locale={locale} t={t} />

        {/* Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/20 to-purple-900/10 
            border border-purple-500/20 p-6">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 
              bg-purple-500/10 rounded-full blur-3xl" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <FileText className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  {t('stats.total_transcriptions')}
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {stats.totalTranscriptions}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-900/20 to-pink-900/10 
            border border-pink-500/20 p-6">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 
              bg-pink-500/10 rounded-full blur-3xl" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-pink-500/20">
                  <Clock className="w-5 h-5 text-pink-400" />
                </div>
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  {t('stats.minutes_transcribed')}
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {stats.totalMinutes}
              </p>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-900/20 to-green-900/10 
            border border-green-500/20 p-6">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 
              bg-green-500/10 rounded-full blur-3xl" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                  {t('stats.this_month')}
                </span>
              </div>
              <p className="text-3xl font-bold text-white">
                {stats.thisMonth}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Transcriptions */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">
              {t('recent_transcriptions')}
            </h2>
            <Link
              href={`/${locale}/dashboard/transcriptions`}
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
            >
              {t('view_all')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {recentTranscriptions.length > 0 ? (
            <div className="grid gap-4">
              {recentTranscriptions.map((item: any) => (
                <Link
                  key={item.job_id}
                  href={`/${locale}/dashboard/editor/${item.job_id}`}
                  className="group relative overflow-hidden rounded-xl bg-gray-900/40 border border-gray-800 
                    p-5 hover:bg-gray-900/60 hover:border-gray-700 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-lg bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                        <FileText className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-white group-hover:text-purple-400 transition-colors">
                          {item.title || t('untitled_transcription')}
                        </h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(item.duration_sec)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(item.created_at).toLocaleDateString(locale, {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                            {t('completed', 'Completed')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 
                      transform group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 
              border border-gray-800 p-12">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 via-transparent to-pink-600/5" />
              
              <div className="relative text-center">
                <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 
                  mb-4">
                  <Sparkles className="w-8 h-8 text-purple-400" />
                </div>
                
                <h3 className="text-xl font-semibold text-white mb-2">
                  {t('no_transcriptions_yet')}
                </h3>
                <p className="text-gray-400 mb-6 max-w-sm mx-auto">
                  {t('start_transcribing')}
                </p>
                
                <div className="flex items-center justify-center gap-4">
                  <EmptyStateButton locale={locale} t={t} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper functions
async function fetchRecentTranscriptions(userUuid: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_WEB_URL}/api/transcriptions?limit=5`,
      { 
        cache: 'no-store',
        headers: { 'x-user-uuid': userUuid }
      }
    );
    if (res.ok) {
      const { data } = await res.json();
      return data || [];
    }
  } catch (error) {
    console.error('Failed to fetch transcriptions:', error);
  }
  return [];
}

async function fetchUserStats(userUuid: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_WEB_URL}/api/user/stats`,
      { 
        cache: 'no-store',
        headers: { 'x-user-uuid': userUuid }
      }
    );
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.error('Failed to fetch user stats:', error);
  }
  return {
    totalTranscriptions: 0,
    totalMinutes: 0,
    thisMonth: 0
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}