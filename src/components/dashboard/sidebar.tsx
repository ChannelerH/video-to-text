'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from 'next-auth/react';
import {
  Home,
  FileText,
  LogOut,
  MessageSquare,
  Users,
  User,
  Loader2
} from 'lucide-react';
import { useAppContext } from '@/contexts/app';

interface DashboardSidebarProps {
  locale: string;
  userUuid?: string;
}

export default function DashboardSidebar({ locale, userUuid }: DashboardSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user, setShowFeedback } = useAppContext();
  const [isLoading, setIsLoading] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState<string | null>(null);

  useEffect(() => {
    // Set loading to false once we've checked for user
    if (user !== undefined) {
      setIsLoading(false);
    }
  }, [user]);

  // Clear loading state when route changes
  useEffect(() => {
    setLoadingRoute(null);
  }, [pathname]);

  const navigation = [
    {
      name: t('nav.home'),
      href: `/${locale}/dashboard`,
      icon: Home,
    },
    {
      name: t('nav.transcriptions'),
      href: `/${locale}/dashboard/transcriptions`,
      icon: FileText,
    },
    {
      name: t('nav.account'),
      href: `/${locale}/dashboard/account`,
      icon: User,
    }
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const handleFeedback = () => {
    setShowFeedback(true);
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: `/${locale}` });
  };

  const userTier = user?.tier || 'free';
  const userNickname = user?.nickname || user?.email?.split('@')[0] || '';
  const userEmail = user?.email || '';

  return (
    <aside className="w-60 h-screen bg-[#0e0e15] border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <a href={`/`} className="flex items-center gap-2">
          <img src="/logo.png" alt="V2TX" className="w-8 h-8 rounded-lg" />
          <span className="text-lg font-semibold text-white">V2TX</span>
        </a>
      </div>

      {/* Plan Status */}
      <div className="px-6 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-gray-500">Current Plan</span>
          {isLoading ? (
            <div className="h-4 w-12 bg-gray-700 rounded animate-pulse" />
          ) : (
            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
              {userTier === 'free' ? 'Free' : userTier}
            </span>
          )}
        </div>
        <Link
          href={`/${locale}/dashboard/account`}
          className="block w-full py-2 bg-purple-600 hover:bg-purple-700 
            text-white text-sm font-medium rounded-lg text-center transition-colors"
        >
          {t('upgrade')} Plan
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isItemLoading = loadingRoute === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => {
                  if (!isActive(item.href)) {
                    setLoadingRoute(item.href);
                  }
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-purple-600/20 text-purple-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {isItemLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <item.icon className="w-4 h-4" />
                )}
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-gray-800">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            {isLoading ? (
              <>
                <div className="w-8 h-8 bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1">
                  <div className="h-3 w-20 bg-gray-700 rounded animate-pulse mb-1" />
                  <div className="h-2 w-32 bg-gray-700 rounded animate-pulse" />
                </div>
              </>
            ) : user ? (
              <>
                <div className="w-8 h-8 bg-purple-600/20 rounded-full flex items-center justify-center">
                  <span className="text-xs text-purple-400 font-medium">
                    {userNickname[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{userNickname}</p>
                  <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-8 h-8 bg-gray-700/50 rounded-full" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500">Not logged in</p>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-1">
            <button
              onClick={handleFeedback}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{t('feedback.title')}</span>
            </button>
            
            <a
              href="https://discord.gg/v2tx"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>Discord</span>
            </a>
            
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('user.sign_out')}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
