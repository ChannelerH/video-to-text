"use client";

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import Link from 'next/link';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastNotificationEnhancedProps {
  type: ToastType;
  title: string;
  message?: string;
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
  actionLink?: {
    text: string;
    href: string;
  };
}

export function ToastNotificationEnhanced({ 
  type, 
  title, 
  message, 
  isOpen, 
  onClose,
  duration = 5000,
  actionLink
}: ToastNotificationEnhancedProps) {
  
  useEffect(() => {
    if (isOpen && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  const styles = {
    success: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
      icon: <CheckCircle className="w-5 h-5 text-green-500" />,
      titleColor: 'text-green-400'
    },
    error: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      icon: <XCircle className="w-5 h-5 text-red-500" />,
      titleColor: 'text-red-400'
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
      titleColor: 'text-amber-400'
    },
    info: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      icon: <Info className="w-5 h-5 text-blue-500" />,
      titleColor: 'text-blue-400'
    }
  };

  const style = styles[type];

  // Parse message for upgrade link
  const renderMessage = () => {
    if (!message) return null;
    
    // Check if message contains upgrade text
    const upgradeMatch = message.match(/^(.*?)\s*—\s*Upgrade at \/pricing\.?\s*(.*)$/i);
    if (upgradeMatch) {
      const [, prefix, suffix] = upgradeMatch;
      return (
        <p className="text-sm text-gray-300">
          {prefix && `${prefix.trim()} — `}
          <Link 
            href="/pricing" 
            className="text-cyan-300 hover:text-cyan-200 underline font-medium"
            onClick={(e) => {
              // Allow link click without closing toast
              e.stopPropagation();
            }}
          >
            Upgrade at /pricing
          </Link>
          {suffix && `. ${suffix.trim()}`}
        </p>
      );
    }

    // Check if we have an action link
    if (actionLink) {
      return (
        <p className="text-sm text-gray-300">
          {message}{' '}
          <Link 
            href={actionLink.href}
            className="text-cyan-300 hover:text-cyan-200 underline font-medium"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {actionLink.text}
          </Link>
        </p>
      );
    }

    return <p className="text-sm text-gray-300">{message}</p>;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-slide-up">
      <div className={`flex items-start gap-3 p-4 rounded-lg border ${style.bg} ${style.border} shadow-xl backdrop-blur-sm`}>
        <div className="flex-shrink-0 mt-0.5">
          {style.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium ${style.titleColor}`}>
            {title}
          </h3>
          {renderMessage()}
        </div>

        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Hook to use enhanced toast
export function useToastEnhanced() {
  const [toastState, setToastState] = useState<{
    isOpen: boolean;
    type: ToastType;
    title: string;
    message?: string;
    actionLink?: { text: string; href: string };
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    actionLink?: { text: string; href: string }
  ) => {
    setToastState({
      isOpen: true,
      type,
      title,
      message,
      actionLink
    });
  }, []);

  const hideToast = useCallback(() => {
    setToastState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    toast: toastState,
    showToast,
    hideToast
  };
}
