'use client';

import { useCallback, useState, useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { X } from 'lucide-react';

interface TurnstileModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
  title?: string;
  description?: string;
}

export default function TurnstileModal({
  open,
  onClose,
  onSuccess,
  title = 'Verify You\'re Human',
  description = 'Please complete the verification to continue',
}: TurnstileModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleVerify = useCallback((token: string) => {
    console.log('[Turnstile] Verification successful, token:', token.substring(0, 20) + '...');
    setIsVerifying(true);
    // Small delay for better UX
    setTimeout(() => {
      onSuccess(token);
      setIsVerifying(false);
    }, 500);
  }, [onSuccess]);

  if (!mounted || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* 只有Turnstile组件，没有任何背景框 */}
      <div className="pointer-events-auto">
        <Turnstile
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY || ''}
          onSuccess={handleVerify}
          options={{
            theme: 'light',
            size: 'normal',
            appearance: 'always',
          }}
        />
      </div>
    </div>
  );
}