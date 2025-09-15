'use client';

import { useState } from 'react';
import { X, AlertTriangle, Download, Clock, TrendingDown, Gift } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

interface CancelSubscriptionModalProps {
  onClose: () => void;
  locale: string;
}

type CancelStep = 'reason' | 'retention' | 'confirm' | 'processing';

const CancelSubscriptionModal = ({ onClose, locale }: CancelSubscriptionModalProps) => {
  const [step, setStep] = useState<CancelStep>('reason');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestRefund, setRequestRefund] = useState(false);
  const [refundEligible, setRefundEligible] = useState(false);
  const router = useRouter();

  const reasons = [
    { id: 'too_expensive', label: 'Too expensive', icon: TrendingDown },
    { id: 'not_using', label: 'Not using it enough', icon: Clock },
    { id: 'missing_features', label: 'Missing features I need', icon: AlertTriangle },
    { id: 'found_alternative', label: 'Found a better alternative', icon: Gift },
    { id: 'other', label: 'Other reason', icon: X }
  ];

  const handleReasonSubmit = async () => {
    if (reason) {
      // Check refund eligibility
      try {
        const response = await fetch('/api/subscription/check-refund-eligibility');
        const data = await response.json();
        setRefundEligible(data.eligible || false);
      } catch (error) {
        console.error('Failed to check refund eligibility');
      }
      setStep('retention');
    }
  };

  const handleRetentionOffer = (offer: string) => {
    if (offer === 'pause') {
      router.push(`/${locale}/dashboard/account/pause`);
      onClose();
    } else if (offer === 'downgrade') {
      router.push(`/${locale}/pricing`);
      onClose();
    } else {
      setStep('confirm');
    }
  };

  const handleFinalCancel = async () => {
    setIsProcessing(true);
    setStep('processing');
    
    try {
      // Call actual cancellation API
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason,
          feedback,
          immediate: false, // Cancel at period end
          requestRefund: requestRefund
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Show success message or redirect
        router.push(`/${locale}/dashboard/account?cancelled=true`);
      } else {
        alert(data.error || 'Failed to cancel subscription');
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step 1: Reason Selection */}
        {step === 'reason' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              We're sorry to see you go
            </h2>
            <p className="text-gray-400 mb-6">
              Help us improve by telling us why you're canceling
            </p>

            <div className="space-y-3 mb-6">
              {reasons.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReason(r.id)}
                  className={`w-full p-4 rounded-xl border transition-all text-left flex items-center gap-3 ${
                    reason === r.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <r.icon className={`w-5 h-5 ${reason === r.id ? 'text-purple-400' : 'text-gray-500'}`} />
                  <span className={reason === r.id ? 'text-white' : 'text-gray-300'}>
                    {r.label}
                  </span>
                </button>
              ))}
            </div>

            {reason === 'other' && (
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Please tell us more..."
                className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white 
                  placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
                rows={3}
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleReasonSubmit}
                disabled={!reason}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 
                  disabled:text-gray-500 text-white rounded-xl transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Retention Offers */}
        {step === 'retention' && (
          <div className="p-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              Wait! Here are some alternatives
            </h2>
            <p className="text-gray-400 mb-6">
              Before you cancel, consider these options:
            </p>

            <div className="space-y-4 mb-6">
              {/* Pause Option - Hidden for v1 */}
              {/* <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
                <div className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-yellow-400 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Pause your subscription
                    </h3>
                    <p className="text-gray-400 text-sm mb-3">
                      Take a break without losing your data. Resume anytime.
                    </p>
                    <button
                      onClick={() => handleRetentionOffer('pause')}
                      className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 
                        text-yellow-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      Pause Instead
                    </button>
                  </div>
                </div>
              </div> */}

              {/* Downgrade Option */}
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-6 h-6 text-blue-400 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Switch to a lower plan
                    </h3>
                    <p className="text-gray-400 text-sm mb-3">
                      Keep essential features at a lower cost.
                    </p>
                    <button
                      onClick={() => handleRetentionOffer('downgrade')}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 
                        text-blue-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      View Plans
                    </button>
                  </div>
                </div>
              </div>

              {/* Special Offer */}
              <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5">
                <div className="flex items-start gap-3">
                  <Gift className="w-6 h-6 text-green-400 mt-1" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      Get 30% off for 3 months
                    </h3>
                    <p className="text-gray-400 text-sm mb-3">
                      Special offer just for you. Limited time only.
                    </p>
                    <button
                      onClick={onClose}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 
                        text-green-400 rounded-lg transition-colors text-sm font-medium"
                    >
                      Claim Offer
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('confirm')}
              className="w-full py-3 text-gray-500 hover:text-gray-300 transition-colors text-sm"
            >
              No thanks, continue canceling
            </button>
          </div>
        )}

        {/* Step 3: Final Confirmation */}
        {step === 'confirm' && (
          <div className="p-8">
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-red-500/10">
                <AlertTriangle className="w-12 h-12 text-red-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Are you absolutely sure?
            </h2>
            <p className="text-gray-400 text-center mb-6">
              If you cancel immediately, this action cannot be undone and you will lose:
              If you cancel at period end, access continues until your current billing period ends.
            </p>

            <div className="bg-gray-800 rounded-xl p-4 mb-6">
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-gray-300">
                  <X className="w-4 h-4 text-red-400" />
                  <span>Access to all your transcriptions</span>
                </li>
                <li className="flex items-center gap-2 text-gray-300">
                  <X className="w-4 h-4 text-red-400" />
                  <span>Your saved preferences and settings</span>
                </li>
                <li className="flex items-center gap-2 text-gray-300">
                  <X className="w-4 h-4 text-red-400" />
                  <span>Any remaining minutes or credits</span>
                </li>
              </ul>
            </div>

            {/* Refund option if eligible */}
            {refundEligible && (
              <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestRefund}
                    onChange={(e) => setRequestRefund(e.target.checked)}
                    className="mt-1 w-4 h-4 text-green-500 bg-gray-800 border-gray-600 rounded focus:ring-green-500"
                  />
                  <div>
                    <p className="text-green-400 font-medium">
                      Request Refund
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      You're eligible for a refund (within 7 days, minimal usage)
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Download className="w-5 h-5 text-blue-400 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-400 font-medium">
                    Don't forget to export your data
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Download your transcriptions before canceling
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('retention')}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={handleFinalCancel}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Processing */}
        {step === 'processing' && (
          <div className="p-8">
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent 
                rounded-full animate-spin mb-4" />
              <p className="text-white text-lg">Processing cancellation...</p>
              <p className="text-gray-400 text-sm mt-2">Please wait a moment</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CancelSubscriptionModal;
