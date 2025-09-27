import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getUserUuid } from '@/services/user';
import DashboardSidebar from '@/components/dashboard/sidebar';
import Feedback from '@/components/feedback';
import { getTranslations } from 'next-intl/server';

interface DashboardLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function DashboardLayout({ 
  children,
  params
}: DashboardLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations();
  const userUuid = await getUserUuid();
  
  // Require authentication for dashboard
  if (!userUuid) {
    const callbackUrl = `${process.env.NEXT_PUBLIC_WEB_URL}/${locale}/dashboard`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return (
    <>
      <div className="flex h-screen bg-[#0a0a0f]">
        {/* Sidebar */}
        <DashboardSidebar locale={locale} />
        
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
      {/* Feedback Modal */}
      <Feedback />
    </>
  );
}
