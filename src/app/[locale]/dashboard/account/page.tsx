import { getTranslations } from "next-intl/server";
import { getUserUuid } from "@/services/user";
import { 
  User, 
  CreditCard, 
  Settings, 
  Shield, 
  LogOut, 
  Mail,
  Calendar,
  Zap,
  Crown,
  ChevronRight,
  Clock,
  Activity
} from "lucide-react";
import Link from "next/link";
import AccountActions from "@/components/dashboard/account-actions";
import { db } from '@/db';
import { users, transcriptions } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getMinuteSummary } from '@/services/minutes';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountPage({ 
  params 
}: PageProps) {
  const { locale } = await params;
  const t = await getTranslations();
  const userUuid = await getUserUuid();
  
  if (!userUuid) {
    return null;
  }

  // Get user data directly from database
  const [user] = await db()
    .select({
      uuid: users.uuid,
      email: users.email,
      created_at: users.created_at,
      subscription_status: users.subscription_status,
      stripe_price_id: users.stripe_price_id
    })
    .from(users)
    .where(eq(users.uuid, userUuid))
    .limit(1);

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
        eq(transcriptions.user_uuid, userUuid),
        gte(transcriptions.created_at, firstDayOfMonth)
      )
    );

  const minutesUsed = Number(monthlyUsage[0]?.totalMinutes || 0);
  
  // Determine tier limits
  // Map plan based on price id; fallback to subscription_status
  const priceId = user?.stripe_price_id || '';
  const status = (user as any)?.subscription_status || 'free';
  const inferredTier = priceId.includes('pro') ? 'pro' : priceId.includes('basic') ? 'basic' : (status === 'active' ? 'basic' : 'free');
  const tierLimits: Record<string, number> = { free: 10, basic: 100, pro: 1000, premium: -1 };
  const userTier = inferredTier;
  const minutesLimit = tierLimits[userTier];

  const email = user?.email || '';
  const joinedDate = user?.created_at ? new Date(user.created_at) : new Date();
  const summary = await getMinuteSummary(userUuid);
  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  return (
    <div className="min-h-full bg-[#0a0a0f]">
      <div className="max-w-5xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Account</h1>
          <p className="text-gray-400">Manage your account settings and preferences</p>
        </div>

        <div className="grid gap-6">
          {/* Profile Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/60 to-gray-900/40 
            border border-gray-800 p-8">
            <div className="absolute top-0 right-0 w-64 h-64 -mr-32 -mt-32">
              <div className="w-full h-full bg-gradient-to-br from-purple-600/10 to-pink-600/10 rounded-full blur-3xl" />
            </div>
            
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-pink-600/20 
                    border border-purple-500/20 flex items-center justify-center">
                    <User className="w-8 h-8 text-purple-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Profile</h2>
                    <p className="text-sm text-gray-400">Your account information and details</p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" />
                    {email ? (
                      <p className="text-white font-medium">{email}</p>
                    ) : (
                      <span className="h-5 w-40 bg-gray-700 rounded animate-pulse" />
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Member since</p>
                  <p className="text-white font-medium flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    {joinedDate.toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/20 to-pink-900/20 
            border border-purple-500/20 p-8">
            <div className="absolute top-0 right-0 w-96 h-96 -mr-48 -mt-48">
              <div className="w-full h-full bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-full blur-3xl" />
            </div>
            
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 
                    shadow-lg shadow-purple-600/20 flex items-center justify-center">
                    <CreditCard className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Subscription</h2>
                    <p className="text-sm text-gray-400">Manage your subscription plan and billing</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-900/40 rounded-xl border border-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-purple-500/20">
                      {userTier === 'free' ? (
                        <Zap className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Crown className="w-5 h-5 text-yellow-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Current plan</p>
                      <p className="text-lg font-semibold text-white capitalize">
                        {userTier === 'free' ? 'Free Plan' : `${userTier} Plan`}
                      </p>
                    </div>
                  </div>
                  {userTier === 'free' && (
                    <Link
                      href={`/${locale}/pricing`}
                      className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white 
                        rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
                    >
                      Upgrade Now
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-400 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Monthly Usage
                    </p>
                    <span className="text-sm text-purple-400 font-medium">
                      {minutesUsed} / {minutesLimit === -1 ? '∞' : minutesLimit} minutes
                    </span>
                  </div>
                  <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full
                        transition-all duration-500 ease-out"
                      style={{ 
                        width: minutesLimit === -1 
                          ? '100%' 
                          : `${Math.min(100, (minutesUsed / minutesLimit) * 100)}%` 
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 animate-pulse" />
                  </div>
                  {minutesLimit > 0 && minutesUsed >= minutesLimit * 0.8 && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      You're approaching your monthly limit
                    </p>
                  )}
                </div>

                {/* Minute Packs Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Standard minutes</div>
                    <div className="text-white text-lg font-semibold">{summary.std} min</div>
                    <div className="text-xs text-gray-400 mt-1">Active packs: {summary.stdPacks} · Earliest expiry: {fmt(summary.stdEarliestExpire)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">High‑accuracy minutes</div>
                    <div className="text-white text-lg font-semibold">{summary.ha} min</div>
                    <div className="text-xs text-gray-400 mt-1">Active packs: {summary.haPacks} · Earliest expiry: {fmt(summary.haEarliestExpire)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Settings Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/60 to-gray-900/40 
            border border-gray-800 p-8">
            <div className="absolute top-0 right-0 w-64 h-64 -mr-32 -mt-32">
              <div className="w-full h-full bg-gradient-to-br from-green-600/10 to-blue-600/10 rounded-full blur-3xl" />
            </div>
            
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-600/20 to-blue-600/20 
                    border border-green-500/20 flex items-center justify-center">
                    <Settings className="w-8 h-8 text-green-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Settings</h2>
                    <p className="text-sm text-gray-400">Account settings and preferences</p>
                  </div>
                </div>
              </div>
              
              <AccountActions locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
