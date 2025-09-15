'use client';

import { useState } from 'react';
import { Calendar, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';

interface PauseSubscriptionViewProps {
  locale: string;
}

const PauseSubscriptionView = ({ locale }: PauseSubscriptionViewProps) => {
  const [duration, setDuration] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const pauseOptions = [
    { days: 7, label: '1 Week' },
    { days: 14, label: '2 Weeks' },
    { days: 30, label: '1 Month' },
    { days: 60, label: '2 Months' },
    { days: 90, label: '3 Months' },
  ];

  const handlePause = async () => {
    setIsProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/subscription/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ duration }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/${locale}/dashboard/account?paused=true`);
      } else {
        setError(data.error || 'Failed to pause subscription');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resumeDate = new Date();
  resumeDate.setDate(resumeDate.getDate() + duration);

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div className="mb-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-full bg-yellow-500/10">
            <Clock className="w-8 h-8 text-yellow-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Pause Your Subscription
            </h2>
            <p className="text-gray-400">
              Take a break without losing your data. You can resume anytime.
            </p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            What happens when you pause:
          </h3>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <div>
                <p className="text-gray-300">Your data remains safe and accessible</p>
                <p className="text-sm text-gray-500">All transcriptions and settings are preserved</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <div>
                <p className="text-gray-300">No charges during pause period</p>
                <p className="text-sm text-gray-500">Billing automatically resumes after pause ends</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
              </div>
              <div>
                <p className="text-gray-300">Resume anytime</p>
                <p className="text-sm text-gray-500">Reactivate your subscription whenever you're ready</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-3">
            How long would you like to pause?
          </label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {pauseOptions.map((option) => (
              <button
                key={option.days}
                onClick={() => setDuration(option.days)}
                className={`p-3 rounded-xl border transition-all ${
                  duration === option.days
                    ? 'border-purple-500 bg-purple-500/10 text-white'
                    : 'border-gray-700 hover:border-gray-600 text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <p className="text-blue-400 font-medium">
                Your subscription will resume on:
              </p>
              <p className="text-white text-lg font-semibold">
                {resumeDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => router.back()}
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePause}
            disabled={isProcessing}
            className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-700 
              disabled:text-gray-500 text-black font-semibold rounded-xl transition-colors"
          >
            {isProcessing ? 'Processing...' : `Pause for ${duration} Days`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PauseSubscriptionView;