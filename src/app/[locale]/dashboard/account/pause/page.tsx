import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import PauseSubscriptionView from '@/components/dashboard/pause-subscription-view';

export const metadata: Metadata = {
  title: 'Pause Subscription',
  description: 'Pause your subscription temporarily',
};

export default async function PauseSubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-white mb-8">
        Pause Subscription
      </h1>
      <PauseSubscriptionView locale={locale} />
    </div>
  );
}
