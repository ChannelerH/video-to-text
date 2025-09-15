'use client';

import { useState } from 'react';
import { Shield, CreditCard, LogOut, ChevronRight, Lock, Bell, Globe, ChevronDown, PauseCircle, XCircle, Settings2 } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useRouter } from '@/i18n/navigation';
import CancelSubscriptionModal from './cancel-subscription-modal';

interface AccountActionsProps {
  locale: string;
}

export default function AccountActions({ locale }: AccountActionsProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const router = useRouter();

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
      
      {/* Subscription Management (Collapsible) */}
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
      {showCancelModal && (
        <CancelSubscriptionModal 
          onClose={() => setShowCancelModal(false)}
          locale={locale}
        />
      )}
    </div>
  );
}
