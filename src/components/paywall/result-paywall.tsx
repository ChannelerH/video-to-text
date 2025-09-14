"use client";

import Link from 'next/link';

interface ResultPaywallProps {
  title?: string;
  message?: string;
  ctaHref?: string;
  ctaText?: string;
  tone?: 'amber' | 'purple' | 'blue';
}

export default function ResultPaywall({
  message = 'Showing the first 5 minutes only. Upgrade to unlock the full transcript, full speaker labels and AI features, and all export formats.',
  ctaHref = '/pricing',
  ctaText = 'Upgrade',
  tone = 'amber'
}: ResultPaywallProps) {
  const color = tone === 'amber' ? {
    border: 'border-amber-400/30', bg: 'bg-amber-500/5', text: 'text-amber-200', btnBg: 'bg-amber-400/20 hover:bg-amber-400/30'
  } : tone === 'purple' ? {
    border: 'border-purple-400/30', bg: 'bg-purple-500/5', text: 'text-purple-200', btnBg: 'bg-purple-400/20 hover:bg-purple-400/30'
  } : {
    border: 'border-blue-400/30', bg: 'bg-blue-500/5', text: 'text-blue-200', btnBg: 'bg-blue-400/20 hover:bg-blue-400/30'
  };
  return (
    <div className={`mx-4 my-3 p-4 rounded-lg border ${color.border} ${color.bg}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className={`text-sm ${color.text}`}>
          {message}
        </div>
        <Link href={ctaHref} className={`px-3 py-1.5 rounded ${color.btnBg} ${color.text} text-xs`}>{ctaText}</Link>
      </div>
    </div>
  );
}

