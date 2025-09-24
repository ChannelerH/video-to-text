'use client';

import { useEffect, useState } from 'react';
import { X, AlertTriangle, Download, Clock, TrendingDown, Gift, AlertCircle } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAppContext } from '@/contexts/app';
import { trackMixpanelEvent } from '@/lib/mixpanel-browser';
import type { DowngradeTarget } from '@/services/subscription-plan';

interface CancelSubscriptionModalProps {
  onClose: () => void;
  locale: string;
  currentPlan: string;
}

type CancelStep = 'reason' | 'retention' | 'downgrade' | 'confirm' | 'processing';

const CancelSubscriptionModal = ({ onClose, locale, currentPlan }: CancelSubscriptionModalProps) => {
  const { refreshUserInfo } = useAppContext();
  const [step, setStep] = useState<CancelStep>('reason');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [requestRefund, setRequestRefund] = useState(false);
  const [refundEligible, setRefundEligible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [isDowngrading, setIsDowngrading] = useState(false);
  const [downgradeError, setDowngradeError] = useState('');
  const [isCheckingRefund, setIsCheckingRefund] = useState(false);
  const [cancelTiming, setCancelTiming] = useState<'period_end' | 'immediate'>('period_end');
  const router = useRouter();

  const isImmediateCancellation = cancelTiming === 'immediate';
  const canRequestRefund = refundEligible && isImmediateCancellation;

  const reasons = [
    { id: 'too_expensive', label: 'Too expensive', icon: TrendingDown },
    { id: 'not_using', label: 'Not using it enough', icon: Clock },
    { id: 'missing_features', label: 'Missing features I need', icon: AlertTriangle },
    { id: 'found_alternative', label: 'Found a better alternative', icon: Gift },
    { id: 'other', label: 'Other reason', icon: X }
  ];

  const baseDowngradeOptions: Array<{
    id: DowngradeTarget;
    title: string;
    description: string;
    badge?: string;
    highlight?: boolean;
    losses?: string[];
  }> = [
    {
      id: 'basic_monthly',
      title: 'Basic Monthly',
      description: 'Keep the essentials for $9/mo — 5 hours, AI chapters & summary, standard exports.',
      highlight: true,
      losses: [
        'No API access or batch processing',
        'High-accuracy minutes removed',
        'Storage retention drops to 90 days',
      ],
    },
    {
      id: 'basic_yearly',
      title: 'Basic Yearly',
      description: 'Save 20% with the annual plan. Same Basic features billed once per year.',
      losses: [
        'No API access or batch processing',
        'High-accuracy minutes removed',
        'Storage retention drops to 90 days',
      ],
    },
    {
      id: 'free',
      title: 'Switch to Free',
      description: 'Preview-only mode. 5-minute clips, limited exports, data kept for 7 days.',
      badge: 'Preview only',
      losses: [
        'Only 5-minute previews, no full transcripts',
        'No AI summary/chapters beyond preview',
        'Storage retention only 7 days',
      ],
    },
  ];

  const normalizedPlan = (currentPlan || '').toUpperCase();
  const allowedTargets: DowngradeTarget[] = (() => {
    if (normalizedPlan === 'PRO' || normalizedPlan === 'PREMIUM') {
      return ['basic_monthly', 'basic_yearly', 'free'];
    }
    if (normalizedPlan === 'BASIC') {
      return ['free'];
    }
    return [];
  })();

  const downgradeOptions = baseDowngradeOptions.filter((option) => allowedTargets.includes(option.id));

  const handleReasonSubmit = async () => {
    if (reason && !isCheckingRefund) {
      // Set loading state immediately for instant feedback
      setIsCheckingRefund(true);
      
      // Small delay to ensure loading state is visible
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check refund eligibility
      try {
        const response = await fetch('/api/subscription/check-refund-eligibility');
        const data = await response.json();
        setRefundEligible(data.eligible || false);
      } catch (error) {
        console.error('Failed to check refund eligibility');
        // Still proceed even if refund check fails
      }
      
      // Ensure minimum loading time for better UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setIsCheckingRefund(false);
      setStep('retention');
    }
  };

  const handleRetentionOffer = async (offer: string) => {
    console.log('[handleRetentionOffer] Called with offer:', offer);
    
    if (offer === 'pause') {
      router.push(`/${locale}/dashboard/account/pause`);
      onClose();
    } else if (offer === 'downgrade') {
      setStep('downgrade');
    } else if (offer === 'discount') {
      console.log('[handleRetentionOffer] Processing discount offer...');
      // Claim the 30% off retention offer
      setIsProcessing(true);
      setShowError(false); // Clear any previous errors
      
      try {
        console.log('[handleRetentionOffer] Calling retention-offer API...');
        const response = await fetch('/api/subscription/retention-offer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        console.log('[handleRetentionOffer] Response status:', response.status);
        const data = await response.json();
        console.log('[handleRetentionOffer] Response data:', data);
        
        if (data.success) {
          // Refresh user info to update subscription status
          refreshUserInfo?.(true);
          
          // Redirect to account page with success message
          router.push(`/${locale}/dashboard/account?retention_applied=true`);
          onClose();
        } else {
          // Show error message
          const errorMsg = data.message || data.error || 'Failed to apply discount. Please try again.';
          console.error('[handleRetentionOffer] Error:', errorMsg);
          setErrorMessage(errorMsg);
          setShowError(true);
        }
      } catch (error) {
        console.error('[handleRetentionOffer] Exception:', error);
        setErrorMessage('An error occurred while applying the discount. Please try again.');
        setShowError(true);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setStep('confirm');
    }
  };

  const handleDowngrade = async (target: DowngradeTarget) => {
    setIsDowngrading(true);
    setDowngradeError('');
    trackMixpanelEvent('subscription.downgrade_attempt', {
      target_plan: target,
      current_plan: currentPlan,
      locale,
    });
    try {
      const response = await fetch('/api/subscription/downgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target, locale, reason, feedback }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Handle specific error cases with user-friendly messages
        if (data.error === 'Downgrade already scheduled') {
          setDowngradeError('You already have a pending plan change scheduled. Please cancel the existing scheduled change from your account page before selecting a new plan.');
        } else if (data.error === 'Already on the requested plan') {
          setDowngradeError('You are already on this plan. Please choose a different plan or close this dialog.');
        } else if (data.error === 'Target plan is not lower than current plan') {
          setDowngradeError('Please select a plan that is lower than your current subscription tier.');
        } else if (data.error === 'No active subscription found') {
          setDowngradeError('No active subscription found. You may already be on the free plan.');
        } else {
          setDowngradeError(data.error || 'Failed to downgrade subscription. Please try again or contact support.');
        }
        return;
      }

      if (data.scheduled) {
        trackMixpanelEvent('subscription.downgrade_scheduled', {
          target_plan: target,
          current_plan: currentPlan,
          locale,
          effective_at: data.effectiveAt,
        });
        refreshUserInfo?.(true);
        const effectiveAt = data.effectiveAt || '';
        router.push(`/${locale}/dashboard/account?downgradeScheduled=${encodeURIComponent(effectiveAt)}&downgradePlan=${encodeURIComponent(target)}`);
        onClose();
        return;
      }

      trackMixpanelEvent('subscription.downgrade_immediate', {
        target_plan: target,
        current_plan: currentPlan,
        locale,
      });
      refreshUserInfo?.(true);
      const plan = typeof data.plan === 'string' ? data.plan.toLowerCase() : '';
      const queryKey = plan === 'free' ? 'cancelled' : 'downgraded';
      const queryValue = plan === 'free' ? 'true' : target;
      router.push(`/${locale}/dashboard/account?${queryKey}=${encodeURIComponent(queryValue)}`);
      onClose();
    } catch (error) {
      console.error('Downgrade error:', error);
      setDowngradeError('An error occurred while processing your downgrade. Please try again or contact support.');
    } finally {
      setIsDowngrading(false);
    }
  };

  const handleFinalCancel = async () => {
    setIsProcessing(true);
    setStep('processing');
    setShowError(false);
    setErrorMessage('');
    trackMixpanelEvent('subscription.cancel_request', {
      current_plan: currentPlan,
      immediate: cancelTiming === 'immediate',
      refund_requested: cancelTiming === 'immediate' ? requestRefund : false,
      reason,
      locale,
    });
    
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
          immediate: cancelTiming === 'immediate',
          requestRefund: cancelTiming === 'immediate' ? requestRefund : false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        trackMixpanelEvent('subscription.cancel_success', {
          current_plan: currentPlan,
          immediate: cancelTiming === 'immediate',
          refund_requested: cancelTiming === 'immediate' ? requestRefund : false,
          locale,
        });
        // Show success message or redirect
        router.push(`/${locale}/dashboard/account?cancelled=true`);
      } else {
        // Show error in modal instead of alert
        setErrorMessage(data.error || 'Failed to cancel subscription. Please try again or contact support.');
        setShowError(true);
        setStep('confirm');
        setIsProcessing(false);
        return;
      }
    } catch (error) {
      console.error('Cancellation error:', error);
      // Show error in modal instead of alert
      setErrorMessage('An error occurred while processing your request. Please try again or contact support.');
      setShowError(true);
      trackMixpanelEvent('subscription.cancel_failed', {
        current_plan: currentPlan,
        immediate: cancelTiming === 'immediate',
        refund_requested: cancelTiming === 'immediate' ? requestRefund : false,
        locale,
      });
      setStep('confirm');
      setIsProcessing(false);
      return;
    }
    
    onClose();
  };

  useEffect(() => {
    if (!isImmediateCancellation && requestRefund) {
      setRequestRefund(false);
    }
  }, [isImmediateCancellation, requestRefund]);

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
                disabled={isCheckingRefund}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 
                  disabled:cursor-not-allowed text-white rounded-xl transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleReasonSubmit}
                disabled={!reason || isCheckingRefund}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 
                  disabled:text-gray-500 text-white rounded-xl transition-all relative overflow-hidden"
              >
                {isCheckingRefund ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Processing...</span>
                  </span>
                ) : (
                  'Continue'
                )}
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
            <p className="text-gray-400 mb-4">
              Before you cancel, consider these options:
            </p>
            
            {/* Error message display */}
            {showError && errorMessage && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Refund eligibility notice */}
            {refundEligible && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm text-green-400">
                  ✓ You're eligible for a refund if you proceed with cancellation
                </p>
              </div>
            )}

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
                      onClick={() => handleRetentionOffer('discount')}
                      disabled={isProcessing}
                      className={`px-4 py-2 bg-green-500/20 hover:bg-green-500/30 
                        text-green-400 rounded-lg transition-colors text-sm font-medium
                        ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isProcessing ? 'Applying...' : 'Claim Offer'}
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

        {/* Step 3: Downgrade Options */}
        {step === 'downgrade' && (
          <div className="p-8 max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-3">Keep what matters most</h2>
              <p className="text-gray-400 text-lg">
                Choose a plan that fits your budget
              </p>
            </div>

            {downgradeError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300">{downgradeError}</p>
                    {downgradeError.includes('pending plan change') && (
                      <button
                        onClick={() => {
                          router.push(`/${locale}/dashboard/account`);
                          onClose();
                        }}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        Go to Account Settings →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {downgradeOptions.length === 0 && (
                <div className="p-6 border border-gray-800 rounded-xl bg-gray-900/40 text-center">
                  <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No downgrade options available for your current plan</p>
                </div>
              )}
              
              {downgradeOptions.map((option) => {
                const isBasicMonthly = option.id === 'basic_monthly';
                const isBasicYearly = option.id === 'basic_yearly';
                const isFree = option.id === 'free';
                
                return (
                  <div
                    key={option.id}
                    className={`
                      relative rounded-2xl p-6 transition-all duration-200
                      ${isBasicMonthly 
                        ? 'bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border-2 border-purple-500/30 shadow-lg shadow-purple-500/10' 
                        : isFree
                        ? 'bg-gray-900/60 border border-gray-700/50'
                        : 'bg-gray-900/40 border border-gray-700/30 hover:border-gray-600/50'
                      }
                    `}
                  >
                    {isBasicMonthly && (
                      <div className="absolute -top-3 left-6">
                        <span className="px-3 py-1 bg-purple-500 text-white text-xs font-medium rounded-full">
                          RECOMMENDED
                        </span>
                      </div>
                    )}
                    
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className={`text-xl font-bold ${isBasicMonthly ? 'text-white' : 'text-gray-200'}`}>
                            {option.title}
                          </h3>
                          {isFree && (
                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded-md">
                              Limited Access
                            </span>
                          )}
                          {isBasicYearly && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-md">
                              SAVE 20%
                            </span>
                          )}
                        </div>
                        
                        <p className={`mb-4 ${isBasicMonthly ? 'text-gray-300' : 'text-gray-400'}`}>
                          {option.description}
                        </p>
                        
                        {option.losses && (
                          <div className="space-y-2 mb-4">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">You'll lose:</p>
                            <ul className="space-y-1.5">
                              {option.losses.map((loss) => (
                                <li key={loss} className="flex items-start gap-2">
                                  <X className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                  <span className="text-sm text-gray-400">{loss}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Changes take effect at next billing cycle</span>
                        </div>
                      </div>
                      
                      <div className="lg:ml-6">
                        <button
                          onClick={() => handleDowngrade(option.id)}
                          disabled={isDowngrading}
                          className={`
                            px-6 py-3 rounded-xl font-medium transition-all duration-200 transform
                            ${isBasicMonthly 
                              ? 'bg-purple-600 hover:bg-purple-700 text-white hover:scale-105 shadow-lg shadow-purple-500/25' 
                              : isFree
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                            }
                            ${isDowngrading ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl'}
                          `}
                        >
                          {isDowngrading ? (
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Scheduling...
                            </span>
                          ) : (
                            <span>
                              {isFree ? 'Switch to Free' : 'Select Plan'}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-300 mb-2">How scheduled downgrades work</p>
                  <ul className="space-y-1 text-sm text-gray-400">
                    <li>• You keep your current plan until the billing period ends</li>
                    <li>• Your plan automatically switches on the renewal date</li>
                    <li>• No partial refunds or pro-rated charges</li>
                    <li>• Cancel the scheduled change anytime before it takes effect</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-800">
              <button
                onClick={() => setStep('confirm')}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                I still want to cancel completely →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Final Confirmation */}
        {step === 'confirm' && (
          <div className="p-8">
            {/* Error Message Display */}
            {showError && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-400">
                      {errorMessage.includes('No active subscription') ? 'No Subscription Found' : 'Cancellation Failed'}
                    </p>
                    <p className="text-sm text-gray-300 mt-1">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-red-500/10">
                <AlertTriangle className="w-12 h-12 text-red-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Are you absolutely sure?
            </h2>
            <p className="text-gray-400 text-center mb-6">
              {isImmediateCancellation
                ? 'You will lose access to your workspace right away and billing stops immediately.'
                : 'You keep access until the end of the current billing period. Billing stops after that date.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setCancelTiming('period_end')}
                className={`rounded-xl border px-4 py-3 text-sm transition-all ${
                  !isImmediateCancellation
                    ? 'border-purple-500 bg-purple-500/10 text-white'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600 text-gray-300'
                }`}
              >
                Cancel at period end
              </button>
              <button
                type="button"
                onClick={() => setCancelTiming('immediate')}
                className={`rounded-xl border px-4 py-3 text-sm transition-all ${
                  isImmediateCancellation
                    ? 'border-red-500 bg-red-500/10 text-white'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600 text-gray-300'
                }`}
              >
                Cancel immediately (lose access now)
              </button>
            </div>

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

            {/* Refund option if eligible and cancelling immediately */}
            {canRequestRefund && (
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
            {refundEligible && !canRequestRefund && (
              <div className="mb-4 p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-sm text-gray-400">
                Refunds are only available for immediate cancellations. Switch to "Cancel immediately" if you want to request one.
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

        {/* Step 5: Processing */}
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
