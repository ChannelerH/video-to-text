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
import { users, orders } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getMinuteSummary } from '@/services/minutes';
import { getUserTier, getUserActiveSubscriptions } from '@/services/user-tier';
import { getUserUsageSummary } from '@/services/user-minutes';
import { getUserSubscriptionPlan } from '@/services/user-subscription';

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

  // Get user tier, subscription plan and usage summary
  const [userTier, subscriptionPlan, usageSummary, activeSubscriptions] = await Promise.all([
    getUserTier(userUuid),
    getUserSubscriptionPlan(userUuid),
    getUserUsageSummary(userUuid),
    getUserActiveSubscriptions(userUuid)
  ]);
  
  const minutesUsed = usageSummary.totalUsed;
  const minutesLimit = usageSummary.subscriptionTotal === 0 ? 30 : usageSummary.subscriptionTotal;
  const totalAllowance = usageSummary.totalAvailable;

  const email = user?.email || '';
  const joinedDate = user?.created_at ? new Date(user.created_at) : new Date();
  const summary = await getMinuteSummary(userUuid);
  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
  
  // Get recent paid orders only
  const recentOrders = await db()
    .select({
      order_no: orders.order_no,
      product_name: orders.product_name,
      amount: orders.amount,
      currency: orders.currency,
      status: orders.status,
      created_at: orders.created_at,
      interval: orders.interval,
      credits: orders.credits
    })
    .from(orders)
    .where(and(
      eq(orders.user_uuid, userUuid),
      eq(orders.status, 'paid')
    ))
    .orderBy(desc(orders.created_at))
    .limit(10);

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
                      {subscriptionPlan === 'FREE' ? (
                        <Zap className="w-5 h-5 text-purple-400" />
                      ) : (
                        <Crown className="w-5 h-5 text-yellow-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Current plan</p>
                      <p className="text-lg font-semibold text-white">
                        {subscriptionPlan === 'FREE' ? 'Free Plan' : `${subscriptionPlan.charAt(0) + subscriptionPlan.slice(1).toLowerCase()} Plan`}
                      </p>
                      {/* Show if user has elevated permissions from minute packs */}
                      {subscriptionPlan === 'FREE' && userTier === 'basic' && (
                        <p className="text-xs text-green-400 mt-1">Basic features enabled with minute pack</p>
                      )}
                    </div>
                  </div>
                  {subscriptionPlan === 'FREE' && (
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
                      {minutesUsed} / {usageSummary.isUnlimited ? '∞' : usageSummary.totalAvailable} minutes
                    </span>
                  </div>
                  <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full
                        transition-all duration-500 ease-out"
                      style={{ 
                        width: `${Math.min(100, usageSummary.percentageUsed)}%`
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 animate-pulse" />
                  </div>
                  {!usageSummary.isUnlimited && usageSummary.percentageUsed >= 80 && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      You're approaching your monthly limit
                    </p>
                  )}
                </div>

                {/* Active Subscriptions & Minute Packs */}
                <div className="space-y-3 mt-6">
                  {/* Active Subscriptions */}
                  {usageSummary.subscriptions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 uppercase tracking-wider">Active Subscriptions</div>
                      {usageSummary.subscriptions.map((sub, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-gray-900/40 border border-gray-800">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-white">
                              {sub.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                            <span className="text-sm text-purple-400">
                              {sub.minutes === -1 ? 'Unlimited' : `${sub.minutes} min/month`}
                            </span>
                          </div>
                          {sub.expiresAt && (
                            <div className="text-xs text-gray-500 mt-1">
                              Expires: {new Date(sub.expiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Minute Packs */}
                  {summary.std > 0 && (
                    <div className="p-4 rounded-xl bg-gray-900/40 border border-gray-800">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Minute Packs</div>
                      <div className="text-white text-lg font-semibold">{summary.std} min</div>
                      <div className="text-xs text-gray-400 mt-1">Active packs: {summary.stdPacks} · Earliest expiry: {fmt(summary.stdEarliestExpire)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Order History Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/60 to-gray-900/40 
            border border-gray-800 p-8">
            <div className="absolute top-0 right-0 w-64 h-64 -mr-32 -mt-32">
              <div className="w-full h-full bg-gradient-to-br from-blue-600/10 to-indigo-600/10 rounded-full blur-3xl" />
            </div>
            
            <div className="relative">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 
                    border border-blue-500/20 flex items-center justify-center">
                    <CreditCard className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Order History</h2>
                    <p className="text-sm text-gray-400">Your recent purchases and subscriptions</p>
                  </div>
                </div>
                {recentOrders.length > 5 && (
                  <Link
                    href={`/${locale}/dashboard/orders`}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    View all →
                  </Link>
                )}
              </div>
              
              {recentOrders.length > 0 ? (
                <div className="space-y-3">
                  {recentOrders.slice(0, 5).map((order) => (
                    <div key={order.order_no} className="p-4 rounded-xl bg-gray-900/40 border border-gray-800 hover:border-gray-700 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-white font-medium">{order.product_name || 'Unknown Product'}</p>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <p className="text-gray-500 mb-1">Order ID</p>
                              <p className="text-gray-300">#{order.order_no.slice(-8)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">Date</p>
                              <p className="text-gray-300">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 mb-1">Interval</p>
                              <p className="text-gray-300 capitalize">
                                {order.interval === 'one-time' ? 'One-Time' : 
                                 order.interval === 'month' ? 'Monthly' : 
                                 order.interval === 'year' ? 'Yearly' : order.interval || 'One-Time'}
                              </p>
                            </div>
                            {order.credits > 0 && (
                              <div>
                                <p className="text-gray-500 mb-1">Minutes</p>
                                <p className="text-blue-400">{order.credits}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-6">
                          <p className="text-white font-semibold text-lg">
                            {order.currency === 'USD' ? '$' : order.currency}
                            {(order.amount / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No orders yet</p>
                  <Link
                    href={`/${locale}/pricing`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 
                      text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
                  >
                    View Pricing
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              )}
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
