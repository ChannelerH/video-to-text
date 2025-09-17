import { NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { hasHighAccuracyAccess } from '@/services/user-tier';

export async function GET() {
  try {
    const userUuid = await getUserUuid();
    
    if (!userUuid) {
      return NextResponse.json({ hasAccess: false });
    }
    
    const hasAccess = await hasHighAccuracyAccess(userUuid);
    
    return NextResponse.json({ 
      hasAccess,
      userUuid 
    });
  } catch (error) {
    console.error('Error checking high accuracy access:', error);
    return NextResponse.json({ hasAccess: false });
  }
}