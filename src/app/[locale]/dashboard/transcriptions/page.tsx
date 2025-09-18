import { redirect } from 'next/navigation';

export default async function TranscriptionsPage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params;
  // Redirect to dashboard since transcriptions is now the home page
  redirect(`/${locale}/dashboard`);
}