'use client';

import { useEffect, useState } from 'react';
import { Shield, CreditCard, LogOut, ChevronRight, Lock, Bell, Globe, ChevronDown, PauseCircle, XCircle, Settings2 } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useRouter } from '@/i18n/navigation';
import CancelSubscriptionModal from './cancel-subscription-modal';
import { useSearchParams } from 'next/navigation';
import { useAppContext } from '@/contexts/app';

interface AccountActionsProps {
  locale: string;
  currentPlan: string;
  pendingPlan?: string | null;
  pendingEffectiveAt?: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  basic_monthly: 'Basic Monthly',
  basic_yearly: 'Basic Yearly',
  free: 'Free',
  BASIC: 'Basic',
  PRO: 'Pro',
  PREMIUM: 'Premium',
};

export default function AccountActions({ locale, currentPlan, pendingPlan, pendingEffectiveAt }: AccountActionsProps) {
  const { refreshUserInfo } = useAppContext();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [downgradeBanner, setDowngradeBanner] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<boolean>(false);
  const [scheduledInfo, setScheduledInfo] = useState<{ plan: string; effectiveAt: string } | null>(pendingPlan && pendingEffectiveAt ? { plan: pendingPlan, effectiveAt: pendingEffectiveAt } : null);
  const [showScheduledToast, setShowScheduledToast] = useState<boolean>(false);
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  const normalizedCurrentPlan = (currentPlan || '').toUpperCase();
  const canManageSubscription = normalizedCurrentPlan !== 'FREE';

  useEffect(() => {
    if (pendingPlan && pendingEffectiveAt) {
      setScheduledInfo({ plan: pendingPlan, effectiveAt: pendingEffectiveAt });
    } else if (!pendingPlan) {
      setScheduledInfo((prev) => {
        if (prev && !showScheduledToast) {
          return null;
        }
        return prev;
      });
    }
  }, [pendingPlan, pendingEffectiveAt, showScheduledToast]);

  useEffect(() => {
    const downgraded = searchParams.get('downgraded');
    const cancelled = searchParams.get('cancelled');
    const scheduled = searchParams.get('downgradeScheduled');
    const scheduledPlan = searchParams.get('downgradePlan');

    if (downgraded) {
      setDowngradeBanner(downgraded);
      router.replace(`/${locale}/dashboard/account`, { scroll: false });
    } else if (cancelled) {
      setCancelNotice(true);
      router.replace(`/${locale}/dashboard/account`, { scroll: false });
    } else if (scheduled) {
      if (scheduledPlan) {
        setScheduledInfo({ plan: scheduledPlan, effectiveAt: scheduled });
      }
      setShowScheduledToast(true);
      router.replace(`/${locale}/dashboard/account`, { scroll: false });
    }
  }, [searchParams, router, locale]);

  const handleCancelScheduledDowngrade = async () => {
    setIsCancellingSchedule(true);
    setScheduleError('');
    try {
      const response = await fetch('/api/subscription/downgrade', {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setScheduleError(data.error || 'Failed to cancel scheduled downgrade.');
        return;
      }
      refreshUserInfo?.();
      setScheduledInfo(null);
    } catch (error) {
      console.error('Cancel scheduled downgrade error:', error);
      setScheduleError('An unexpected error occurred. Please try again.');
    } finally {
      setIsCancellingSchedule(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut({ 
      callbackUrl: `/${locale}`,
      redirect: true 
    });
  };

  const settings = [
    {
      icon: Lock,
      label: 'Change password',
      description: 'Update your account password',
      action: () => console.log('Change password'),
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      hoverColor: 'hover:bg-blue-500/5'
    },
    {
      icon: CreditCard,
      label: 'Manage billing',
      description: 'View invoices and payment methods',
      action: async () => {
        try {
          const res = await fetch('/api/billing/portal', { method: 'POST' });
          const data = await res.json();
          if (data?.url) window.location.href = data.url;
          else router.push(`/${locale}/pricing`);
        } catch {
          router.push(`/${locale}/pricing`);
        }
      },
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      hoverColor: 'hover:bg-purple-500/5'
    },
    {
      icon: Bell,
      label: 'Notifications',
      description: 'Configure email preferences',
      action: () => console.log('Notifications'),
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
      hoverColor: 'hover:bg-yellow-500/5'
    },
    {
      icon: Globe,
      label: 'Language',
      description: 'Change display language',
      action: () => console.log('Language'),
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      hoverColor: 'hover:bg-green-500/5'
    }
  ];

  return (
    <div className="space-y-2">
      {downgradeBanner && (
        <div className="p-3 rounded-lg border border-green-500/40 bg-green-500/10 text-sm text-green-200">
          {downgradeBanner === 'basic_monthly' && 'Downgrade confirmed. You are now on the Basic Monthly plan.'}
          {downgradeBanner === 'basic_yearly' && 'Downgrade confirmed. You are now on the Basic Yearly plan.'}
          {downgradeBanner !== 'basic_monthly' && downgradeBanner !== 'basic_yearly' && 'Plan downgrade completed successfully.'}
        </div>
      )}

      {cancelNotice && (
        <div className="p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-sm text-amber-200">
          Your subscription will end at the close of the current billing period.
        </div>
      )}

      {showScheduledToast && scheduledInfo && (
        <div className="p-3 rounded-lg border border-blue-400/40 bg-blue-500/10 text-sm text-blue-200">
          Downgrade scheduled to {PLAN_LABELS[scheduledInfo.plan] || scheduledInfo.plan} on {formatDate(scheduledInfo.effectiveAt)}.
        </div>
      )}

      {scheduledInfo && (
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3">
          <div>
            <p className="text-sm text-blue-300 font-semibold">Downgrade scheduled</p>
            <p className="text-xs text-gray-400 mt-1">
              You will move to {PLAN_LABELS[scheduledInfo.plan] || scheduledInfo.plan} on {formatDate(scheduledInfo.effectiveAt)}. Until then, you keep current plan features.
            </p>
          </div>
          {scheduleError && (
            <p className="text-xs text-red-300">{scheduleError}</p>
          )}
          <button
            onClick={handleCancelScheduledDowngrade}
            disabled={isCancellingSchedule}
            className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-200 text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-60"
          >
            {isCancellingSchedule ? 'Cancelling…' : 'Cancel scheduled downgrade'}
          </button>
        </div>
      )}

      {/* Settings temporarily hidden - will be enabled in future versions */}
      {/* {settings.map((setting, index) => (
        <button
          key={index}
          onClick={setting.action}
          className={`w-full group relative overflow-hidden rounded-xl border border-gray-800 
            ${setting.hoverColor} transition-all duration-200 p-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-lg ${setting.bgColor} transition-colors 
                group-hover:scale-110 transform duration-200`}>
                <setting.icon className={`w-5 h-5 ${setting.color}`} />
              </div>
              <div className="text-left">
                <p className="text-white font-medium group-hover:text-purple-400 transition-colors">
                  {setting.label}
                </p>
                <p className="text-xs text-gray-500">{setting.description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 
              transform group-hover:translate-x-1 transition-all" />
          </div>
        </button>
      ))} */}
      
      {canManageSubscription && (
        <div className="mb-4">
          <button
            onClick={() => setShowSubscriptionManagement(!showSubscriptionManagement)}
            className="w-full flex items-center justify-between p-2 text-gray-500 hover:text-gray-400 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              <span className="text-xs">Subscription Management</span>
            </div>
            <ChevronDown 
              className={`w-4 h-4 transition-transform ${showSubscriptionManagement ? 'rotate-180' : ''}`} 
            />
          </button>
          
          {showSubscriptionManagement && (
            <div className="mt-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
            {/* Pause Subscription - Hidden for v1 */}
            {/* <button
              onClick={() => router.push(`/${locale}/dashboard/account/pause`)}
              className="w-full text-left p-3 rounded-lg border border-gray-800 hover:bg-gray-900/50 
                transition-colors group"
            >
              <div className="flex items-center gap-3">
                <PauseCircle className="w-4 h-4 text-yellow-500" />
                <div className="flex-1">
                  <p className="text-sm text-gray-300">Pause Subscription</p>
                  <p className="text-xs text-gray-500">Temporarily pause billing and keep your data</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
              </div>
            </button> */}
            
            {/* Cancel Subscription */}
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full text-left p-3 rounded-lg border border-gray-800 hover:bg-gray-900/50 
                transition-colors group"
            >
              <div className="flex items-center gap-3">
                <XCircle className="w-4 h-4 text-gray-500" />
                <div className="flex-1">
                  <p className="text-sm text-gray-400">Cancel Subscription</p>
                  <p className="text-xs text-gray-600">Permanently cancel your plan</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400" />
              </div>
            </button>
            </div>
          )}
        </div>
      )}
      
      {/* Sign Out Button */}
      <button
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full group relative overflow-hidden rounded-xl border border-red-900/50 
          bg-red-500/5 hover:bg-red-500/10 transition-all duration-200 p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-lg bg-red-500/10 transition-colors 
              group-hover:scale-110 transform duration-200">
              <LogOut className="w-5 h-5 text-red-400" />
            </div>
            <div className="text-left">
              <p className="text-red-400 font-medium">
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </p>
              <p className="text-xs text-gray-500">End your current session</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-red-900 group-hover:text-red-400 
            transform group-hover:translate-x-1 transition-all" />
        </div>
      </button>
      
      {/* Cancel Subscription Modal */}
      {canManageSubscription && showCancelModal && (
        <CancelSubscriptionModal 
          onClose={() => setShowCancelModal(false)}
          locale={locale}
          currentPlan={currentPlan}
        />
      )}
    </div>
  );
}
