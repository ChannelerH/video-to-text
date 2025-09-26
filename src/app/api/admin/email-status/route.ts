import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { EmailBonusMinutesService } from '@/services/email-bonus-minutes';

// Admin endpoint to check email system status
export async function GET(request: Request) {
  // Check authorization in production
  if (process.env.NODE_ENV === 'production') {
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  
  try {
    // Get campaign statistics
    const campaignStats = await db().execute(
      sql`SELECT 
           campaign_id,
           COUNT(DISTINCT user_uuid) as total_users,
           SUM(minutes_granted) as total_minutes_granted,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           MAX(granted_at) as last_granted_at
         FROM v2tx_email_rewards
         GROUP BY campaign_id
         ORDER BY campaign_id`
    );
    
    // Get recent email history
    const recentEmails = await db().execute(
      sql`SELECT 
           COUNT(*) as total_sent,
           COUNT(DISTINCT user_uuid) as unique_users,
           COUNT(opened_at) as opened,
           COUNT(clicked_at) as clicked,
           COUNT(CASE WHEN unsubscribed = true THEN 1 END) as unsubscribed,
           MIN(sent_at) as first_sent,
           MAX(sent_at) as last_sent
         FROM v2tx_email_history
         WHERE sent_at > NOW() - INTERVAL '7 days'`
    );
    
    // Get user segments for upcoming campaigns
    const upcomingSegments = await db().execute(
      sql`WITH segments AS (
           SELECT 
             'day3_activation' as segment,
             COUNT(*) as user_count
           FROM v2tx_users
           WHERE created_at BETWEEN NOW() - INTERVAL '3 days 1 hour' AND NOW() - INTERVAL '3 days'
           AND subscription_status = 'free'
           
           UNION ALL
           
           SELECT 
             'day7_feedback' as segment,
             COUNT(*) as user_count
           FROM v2tx_users
           WHERE created_at BETWEEN NOW() - INTERVAL '7 days 1 hour' AND NOW() - INTERVAL '7 days'
           
           UNION ALL
           
           SELECT 
             'paid_user_feedback' as segment,
             COUNT(*) as user_count
           FROM v2tx_users
           WHERE subscription_status IN ('basic', 'pro', 'premium')
           AND created_at < NOW() - INTERVAL '7 days'
           AND NOT EXISTS (
             SELECT 1 FROM v2tx_email_history eh
             WHERE eh.user_uuid = v2tx_users.uuid
             AND eh.campaign_id = 'paid_user_feedback'
             AND eh.sent_at > NOW() - INTERVAL '30 days'
           )
           
           UNION ALL
           
           SELECT 
             'win_back' as segment,
             COUNT(*) as user_count
           FROM v2tx_users u
           WHERE subscription_status = 'free'
           AND created_at < NOW() - INTERVAL '30 days'
           AND NOT EXISTS (
             SELECT 1 FROM v2tx_transcriptions t
             WHERE t.user_uuid = u.uuid
             AND t.created_at > NOW() - INTERVAL '14 days'
           )
         )
         SELECT * FROM segments`
    );
    
    // Get failed rewards that need retry
    const failedRewards = await db().execute(
      sql`SELECT 
           COUNT(*) as total_failed,
           COUNT(DISTINCT user_uuid) as unique_users,
           MIN(created_at) as oldest_failure,
           MAX(created_at) as newest_failure
         FROM v2tx_email_rewards
         WHERE status = 'failed'
         AND created_at > NOW() - INTERVAL '7 days'`
    );
    
    // Get system health metrics
    const healthMetrics = {
      database_connection: 'healthy',
      email_service: process.env.RESEND_API_KEY ? 'configured' : 'not_configured',
      cron_secret: process.env.CRON_SECRET ? 'configured' : 'not_configured',
      admin_api_key: process.env.ADMIN_API_KEY ? 'configured' : 'not_configured'
    };
    
    return NextResponse.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      campaign_statistics: campaignStats,
      recent_emails: recentEmails[0],
      upcoming_segments: upcomingSegments,
      failed_rewards: failedRewards[0],
      health_metrics: healthMetrics
    });
    
  } catch (error) {
    console.error('Failed to get email status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve email status',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Test endpoint to grant bonus minutes to a specific user
export async function POST(request: Request) {
  // Check authorization
  if (process.env.NODE_ENV === 'production') {
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  
  try {
    const body = await request.json();
    const { userUuid, minutes, campaignId, validDays } = body;
    
    if (!userUuid || !minutes || !campaignId) {
      return NextResponse.json(
        { error: 'Missing required fields: userUuid, minutes, campaignId' },
        { status: 400 }
      );
    }
    
    const bonusService = new EmailBonusMinutesService();
    const result = await bonusService.grantEmailBonus({
      userUuid,
      minutes,
      campaignId,
      reason: `Admin test: ${campaignId}`,
      validDays: validDays || 30
    });
    
    return NextResponse.json({
      test_mode: true,
      timestamp: new Date().toISOString(),
      result
    });
    
  } catch (error) {
    console.error('Failed to grant test bonus:', error);
    return NextResponse.json(
      { 
        error: 'Failed to grant bonus minutes',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
