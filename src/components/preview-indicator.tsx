"use client";

import { Lock, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

interface PreviewIndicatorProps {
  previewMinutes?: number;
  totalMinutes?: number;
  previewSeconds?: number;
  totalSeconds?: number;
  locale?: string;
  className?: string;
  showUnlockButton?: boolean;
  forceShow?: boolean;
}

export default function PreviewIndicator({
  previewMinutes,
  totalMinutes,
  previewSeconds = 300,
  totalSeconds,
  locale: localeProp,
  className = '',
  showUnlockButton = true,
  forceShow = false
}: PreviewIndicatorProps) {
  const t = useTranslations('tool_interface.preview');
  const localeFromHook = useLocale();
  
  // Use the locale from the hook which should be more reliable
  const locale = localeFromHook || localeProp || 'en';
  
  // Convert to consistent format
  const previewMin = previewMinutes || Math.floor(previewSeconds / 60);
  const totalMin = totalMinutes || (totalSeconds ? Math.floor(totalSeconds / 60) : 0);
  const totalSec = totalSeconds || totalMinutes! * 60;
  
  // Calculate percentage
  const percentage = totalSec > 0 ? Math.min(100, (previewSeconds / totalSec) * 100) : 0;
  const lockedMinutes = Math.max(0, totalMin - previewMin);
  const lockedSeconds = Math.max(0, totalSec - previewSeconds);
  
  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Don't show if no content is locked (unless forceShow)
  if (!forceShow && totalSec <= previewSeconds) {
    return null;
  }
  
  return (
    <div className={`bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-400">
            {t('preview_mode')}
          </span>
        </div>
        {showUnlockButton && (
          <Link
            href={`/${locale}/pricing`}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Unlock className="w-3 h-3" />
            {t('unlock_full')}
          </Link>
        )}
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-gray-400">
          <span>
            {t('showing')}: {formatTime(previewSeconds)} / {formatTime(totalSec)}
          </span>
          <span className="text-amber-400">
            {t('locked_content', { minutes: formatTime(lockedSeconds) })}
          </span>
        </div>
        
        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <div className="space-y-1.5 text-xs text-gray-400">
          <p>
            {t('upgrade_message')}
          </p>
          <p className="text-gray-500">
            {t('preview_mode_message')}
          </p>
        </div>
      </div>
    </div>
  );
}
