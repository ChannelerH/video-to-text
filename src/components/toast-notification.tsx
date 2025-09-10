"use client";

import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastNotificationProps {
  type: ToastType;
  title: string;
  message?: string;
  isOpen: boolean;
  onClose: () => void;
  duration?: number; // Auto close after duration (ms)
}

export function ToastNotification({ 
  type, 
  title, 
  message, 
  isOpen, 
  onClose,
  duration = 5000 
}: ToastNotificationProps) {
  
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

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className={`max-w-sm rounded-lg ${style.bg} border ${style.border} p-4 shadow-lg backdrop-blur-sm`}>
        <div className="flex items-start gap-3">
          {style.icon}
          <div className="flex-1">
            <h3 className={`font-semibold ${style.titleColor}`}>{title}</h3>
            {message && (
              <p className="mt-1 text-sm text-gray-400">{message}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper hook for managing toasts
import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState<{
    type: ToastType;
    title: string;
    message?: string;
    isOpen: boolean;
  }>({
    type: 'info',
    title: '',
    message: '',
    isOpen: false
  });

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    setToast({ type, title, message, isOpen: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isOpen: false }));
  }, []);

  return { toast, showToast, hideToast };
}