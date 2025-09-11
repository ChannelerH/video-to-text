import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { transcriptions } from '@/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface UsageCheck {
  canTranscribe: boolean;
  minutesUsed: number;
  minutesLimit: number;
  tier: string;
  message?: string;
}

export async function checkUsageLimit(requiredMinutes: number): Promise<UsageCheck> {
  try {
    const userUuid = await getUserUuid();
    
    // Allow anonymous users to use (with session limits)
    if (!userUuid) {
      return {
        canTranscribe: true,
        minutesUsed: 0,
        minutesLimit: 5, // Anonymous users get 5 minutes
        tier: 'anonymous',
        message: 'Sign in to get more transcription minutes'
      };
    }

    // Fetch usage data
    const res = await fetch(`${process.env.NEXT_PUBLIC_WEB_URL}/api/user/usage`);
    if (!res.ok) {
      throw new Error('Failed to fetch usage data');
    }
    
    const usage = await res.json();
    
    // Check if user has unlimited usage
    if (usage.isUnlimited) {
      return {
        canTranscribe: true,
        minutesUsed: usage.minutesUsed,
        minutesLimit: -1,
        tier: usage.tier
      };
    }
    
    // Check if user has enough minutes
    if (usage.minutesUsed + requiredMinutes > usage.minutesLimit) {
      return {
        canTranscribe: false,
        minutesUsed: usage.minutesUsed,
        minutesLimit: usage.minutesLimit,
        tier: usage.tier,
        message: `You need ${requiredMinutes} minutes but only have ${usage.minutesLimit - usage.minutesUsed} minutes remaining`
      };
    }
    
    return {
      canTranscribe: true,
      minutesUsed: usage.minutesUsed,
      minutesLimit: usage.minutesLimit,
      tier: usage.tier
    };
  } catch (error) {
    console.error('Error checking usage limit:', error);
    // Allow transcription on error (fail open)
    return {
      canTranscribe: true,
      minutesUsed: 0,
      minutesLimit: 10,
      tier: 'free',
      message: 'Could not verify usage limits'
    };
  }
}

export async function trackUsage(minutes: number, jobId: string): Promise<boolean> {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) return true; // Skip tracking for anonymous users
    
    // The actual tracking happens when the transcription is saved to the database
    // This is just for pre-flight checks
    const res = await fetch(`${process.env.NEXT_PUBLIC_WEB_URL}/api/user/usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ minutes })
    });
    
    return res.ok;
  } catch (error) {
    console.error('Error tracking usage:', error);
    return false;
  }
}

// Get feature limits based on tier
export function getFeatureLimits(tier: string) {
  const limits: Record<string, any> = {
    anonymous: {
      maxDuration: 300, // 5 minutes
      maxFileSize: 25 * 1024 * 1024, // 25MB
      exportFormats: ['txt'],
      allowEditor: false,
      allowChapters: false,
      allowRefinement: false
    },
    free: {
      maxDuration: 600, // 10 minutes per file
      maxFileSize: 50 * 1024 * 1024, // 50MB
      exportFormats: ['txt', 'srt'],
      allowEditor: true,
      allowChapters: false,
      allowRefinement: false
    },
    basic: {
      maxDuration: 1800, // 30 minutes per file
      maxFileSize: 200 * 1024 * 1024, // 200MB
      exportFormats: ['txt', 'srt', 'vtt'],
      allowEditor: true,
      allowChapters: true,
      allowRefinement: false
    },
    pro: {
      maxDuration: 7200, // 2 hours per file
      maxFileSize: 500 * 1024 * 1024, // 500MB
      exportFormats: ['txt', 'srt', 'vtt', 'json', 'pdf', 'docx'],
      allowEditor: true,
      allowChapters: true,
      allowRefinement: true
    },
    premium: {
      maxDuration: -1, // Unlimited
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      exportFormats: ['txt', 'srt', 'vtt', 'json', 'pdf', 'docx'],
      allowEditor: true,
      allowChapters: true,
      allowRefinement: true
    }
  };
  
  return limits[tier] || limits.free;
}