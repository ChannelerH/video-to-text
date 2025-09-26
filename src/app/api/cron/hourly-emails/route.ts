import { NextResponse } from 'next/server';
import { EmailScheduler } from '@/services/email-scheduler';

// Vercel Cron Job handler for hourly email processing
export async function GET(request: Request) {
  // Verify this is from Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  
  if (process.env.NODE_ENV === 'production') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  
  const scheduler = new EmailScheduler();
  const startTime = Date.now();
  
  try {
    console.log('[Cron] Starting hourly email processing...');
    
    // Process all email campaigns
    const results = await scheduler.processAllCampaigns();
    
    const duration = Date.now() - startTime;
    
    const summary = {
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      campaigns_processed: results.length,
      total_emails_sent: results.reduce((sum, r) => sum + r.emails_sent, 0),
      total_emails_failed: results.reduce((sum, r) => sum + r.emails_failed, 0),
      total_minutes_granted: results.reduce((sum, r) => sum + r.minutes_granted_total, 0),
      total_skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      campaign_errors: results.filter((r) => r.error),
      details: results
    };
    
    console.log('[Cron] Email processing completed:', summary);
    
    return NextResponse.json(summary);
    
  } catch (error) {
    console.error('[Cron] Email processing failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Email processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// Manual trigger endpoint for testing (POST to avoid caching)
export async function POST(request: Request) {
  // Allow manual trigger in development/testing
  if (process.env.NODE_ENV === 'production') {
    // In production, require admin API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  
  // Parse request for specific campaign
  let campaign: string | null = null;
  try {
    const body = await request.json();
    campaign = body.campaign;
  } catch {
    // No body or invalid JSON, process all campaigns
  }
  
  const scheduler = new EmailScheduler();
  
  try {
    console.log('[Manual] Starting email processing...', campaign ? `Campaign: ${campaign}` : 'All campaigns');
    
    let results;
    if (campaign) {
      const allowedCampaigns = new Set([
        'day_3_activation',
        'day_7_feedback',
        'paid_user_feedback',
        'win_back',
      ]);

      if (!allowedCampaigns.has(campaign)) {
        return NextResponse.json(
          { error: `Unsupported campaign: ${campaign}` },
          { status: 400 }
        );
      }

      // Process specific campaign
      const result = await scheduler.processCampaign(campaign as any);
      results = [result];
    } else {
      // Process all campaigns
      results = await scheduler.processAllCampaigns();
    }
    
    const summary = {
      manual_trigger: true,
      timestamp: new Date().toISOString(),
      campaign: campaign || 'all',
      campaigns_processed: results.length,
      total_emails_sent: results.reduce((sum, r) => sum + r.emails_sent, 0),
      total_emails_failed: results.reduce((sum, r) => sum + r.emails_failed, 0),
      total_minutes_granted: results.reduce((sum, r) => sum + r.minutes_granted_total, 0),
      total_skipped: results.reduce((sum, r) => sum + r.skipped, 0),
      campaign_errors: results.filter((r) => r.error),
      details: results
    };
    
    console.log('[Manual] Email processing completed:', summary);
    
    return NextResponse.json(summary);
    
  } catch (error) {
    console.error('[Manual] Email processing failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Email processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        manual_trigger: true
      },
      { status: 500 }
    );
  }
}
