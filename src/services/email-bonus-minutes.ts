import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { addMinutesWithExpiry } from '@/services/minutes';
import { email_rewards } from '@/db/schema';

export interface EmailBonusParams {
  userUuid: string;
  minutes: number;
  campaignId: string;
  reason: string;
  validDays?: number;
}

export interface EmailBonusResult {
  success: boolean;
  reason?: string;
  minutesGranted?: number;
  packId?: number;
  orderNo?: string;
  newBalance?: number;
  expiresAt?: Date;
  existingReward?: any;
}

export class EmailBonusMinutesService {
  /**
   * Grant bonus minutes for email campaigns
   */
  async grantEmailBonus(params: EmailBonusParams): Promise<EmailBonusResult> {
    const { userUuid, minutes, campaignId, reason, validDays = 30 } = params;
    
    try {
      // 1. Check if already granted
      const existingReward = await db().execute(
        sql`SELECT * FROM v2tx_email_rewards 
           WHERE user_uuid = ${userUuid} 
           AND campaign_id = ${campaignId} 
           AND status = 'completed'
           LIMIT 1`
      );
      
      if ((existingReward as any[]).length > 0) {
        console.log(`Email bonus already granted for campaign: ${campaignId}, user: ${userUuid}`);
        return {
          success: false,
          reason: 'already_granted',
          existingReward: (existingReward as any[])[0]
        };
      }
      
      // 2. Generate unique order number for tracking
      const orderNo = `EMAIL_${campaignId.toUpperCase()}_${userUuid}_${Date.now()}`;
      
      // 3. Calculate validity in months (round up)
      const validMonths = Math.ceil(validDays / 30);
      
      // 4. Add minutes pack
      console.log(`Granting ${minutes} minutes for campaign ${campaignId} to user ${userUuid}`);
      await addMinutesWithExpiry(
        userUuid, 
        minutes,  // standard minutes
        0,        // high accuracy minutes
        validMonths,
        orderNo
      );
      
      // 5. Get the created pack ID for reference
      const newPack = await db().execute(
        sql`SELECT id FROM v2tx_minute_packs 
           WHERE order_no = ${orderNo} 
           LIMIT 1`
      );
      
      const packId = (newPack as any[])[0]?.id;
      
      // 6. Record the reward
      await db().execute(
        sql`INSERT INTO v2tx_email_rewards 
           (user_uuid, campaign_id, minutes_granted, pack_id, status, granted_at, created_at)
           VALUES (${userUuid}, ${campaignId}, ${minutes}, ${packId}, 'completed', NOW(), NOW())
           ON CONFLICT (user_uuid, campaign_id) 
           DO UPDATE SET 
             status = 'completed',
             granted_at = NOW(),
             pack_id = ${packId},
             minutes_granted = ${minutes}`
      );
      
      // 7. Get updated balance
      const balance = await this.getUserBalance(userUuid);
      
      console.log(`Successfully granted ${minutes} minutes for campaign: ${campaignId}`);
      
      return {
        success: true,
        minutesGranted: minutes,
        packId,
        orderNo,
        newBalance: balance,
        expiresAt: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
      };
      
    } catch (error) {
      console.error(`Failed to grant email bonus: ${error}`);
      
      // Record failure for retry
      try {
        await db().execute(
          sql`INSERT INTO v2tx_email_rewards 
             (user_uuid, campaign_id, minutes_granted, status, created_at)
             VALUES (${userUuid}, ${campaignId}, ${minutes}, 'failed', NOW())
             ON CONFLICT (user_uuid, campaign_id) 
             DO UPDATE SET status = 'failed'`
        );
      } catch (recordError) {
        console.error('Failed to record failure:', recordError);
      }
      
      throw error;
    }
  }
  
  /**
   * Get user's current minute balance
   */
  async getUserBalance(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT COALESCE(SUM(minutes_left), 0) as total
         FROM v2tx_minute_packs 
         WHERE user_id = ${userUuid} 
         AND minutes_left > 0 
         AND (expires_at IS NULL OR expires_at > NOW())`
    );
    
    return Number((result as any[])[0]?.total || 0);
  }
  
  /**
   * Get user's email reward history
   */
  async getRewardHistory(userUuid: string) {
    const history = await db().execute(
      sql`SELECT er.*, mp.minutes_left, mp.expires_at
         FROM v2tx_email_rewards er
         LEFT JOIN v2tx_minute_packs mp ON er.pack_id = mp.id
         WHERE er.user_uuid = ${userUuid}
         ORDER BY er.created_at DESC`
    );
    
    return history as any[];
  }
  
  /**
   * Check if user can receive a specific campaign reward
   */
  async canReceiveReward(userUuid: string, campaignId: string): Promise<boolean> {
    const existing = await db().execute(
      sql`SELECT 1 FROM v2tx_email_rewards 
         WHERE user_uuid = ${userUuid} 
         AND campaign_id = ${campaignId}
         AND status = 'completed'
         LIMIT 1`
    );
    
    return (existing as any[]).length === 0;
  }
  
  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId?: string) {
    const whereClause = campaignId 
      ? sql`WHERE campaign_id = ${campaignId}`
      : sql``;
    
    const stats = await db().execute(
      sql`SELECT 
           campaign_id,
           COUNT(DISTINCT user_uuid) as total_users,
           SUM(minutes_granted) as total_minutes,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
         FROM v2tx_email_rewards
         ${whereClause}
         GROUP BY campaign_id
         ORDER BY campaign_id`
    );
    
    return stats as any[];
  }
  
  /**
   * Retry failed rewards
   */
  async retryFailedRewards() {
    const failedRewards = await db().execute(
      sql`SELECT * FROM v2tx_email_rewards 
         WHERE status = 'failed' 
         AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC
         LIMIT 10`
    );
    
    const results = [];
    
    for (const reward of failedRewards as any[]) {
      try {
        console.log(`Retrying failed reward for user ${reward.user_uuid}, campaign ${reward.campaign_id}`);
        
        const result = await this.grantEmailBonus({
          userUuid: reward.user_uuid,
          minutes: reward.minutes_granted,
          campaignId: reward.campaign_id,
          reason: `Retry: ${reward.campaign_id}`
        });
        
        results.push({
          user_uuid: reward.user_uuid,
          campaign_id: reward.campaign_id,
          success: result.success
        });
      } catch (error: unknown) {
        console.error(`Retry failed for ${reward.user_uuid}:`, error);
        results.push({
          user_uuid: reward.user_uuid,
          campaign_id: reward.campaign_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }
}
