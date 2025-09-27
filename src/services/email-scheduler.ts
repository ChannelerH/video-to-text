import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { EmailBonusMinutesService } from './email-bonus-minutes';
import { getEmailTemplate, renderTemplate } from './email-templates';
import { sendEmail } from './email-sender';
import { PersonalizedPSGenerator } from './ps-generator';

export interface UserEmailCandidate {
  uuid: string;
  email: string;
  nickname?: string;
  locale?: string;
  timezone?: string;
  country?: string;
  created_at: Date;
  subscription_status?: string;
  total_transcriptions?: number;
  total_minutes?: number;
}

type CampaignType =
  | 'day_3_activation'
  | 'day_7_feedback'
  | 'paid_user_feedback'
  | 'win_back';

interface CampaignResult {
  campaign: CampaignType;
  emails_sent: number;
  emails_failed: number;
  minutes_granted_total: number;
  skipped: number;
  error?: string;
}

interface EmailSendOutcome {
  sent: boolean;
  skipped: boolean;
  minutesGranted: number;
}

export class EmailScheduler {
  private bonusService = new EmailBonusMinutesService();
  private psGenerator = new PersonalizedPSGenerator();
  private rateLimitMs = 1000;

  private createEmptyResult(campaign: CampaignType): CampaignResult {
    return {
      campaign,
      emails_sent: 0,
      emails_failed: 0,
      minutes_granted_total: 0,
      skipped: 0,
    };
  }
  
  /**
   * Process Day 3 activation emails for low-activity users
   */
  async processDay3Activation(): Promise<CampaignResult> {
    console.log('Processing Day 3 activation emails...');
    const summary = this.createEmptyResult('day_3_activation');

    try {
      const users = await db().execute(sql`
        SELECT 
          u.uuid,
          u.email,
          u.nickname,
          u.locale,
          u.timezone,
          u.country,
          u.created_at,
          u.subscription_status,
          COUNT(t.id) as total_transcriptions
        FROM v2tx_users u
        LEFT JOIN v2tx_transcriptions t ON u.uuid = t.user_uuid
        WHERE 
          DATE(u.created_at) = DATE(NOW() - INTERVAL '3 days')
          AND (u.subscription_status IS NULL OR u.subscription_status = 'free')
          AND NOT EXISTS (
            SELECT 1 FROM v2tx_email_rewards er 
            WHERE er.user_uuid = u.uuid 
            AND er.campaign_id = 'day_3_activation'
          )
        GROUP BY u.uuid, u.email, u.nickname, u.locale, u.timezone, u.country, u.created_at, u.subscription_status
        HAVING COUNT(t.id) < 2
      `);

      for (const user of users as unknown as UserEmailCandidate[]) {
        try {
          const outcome = await this.sendActivationEmail(user);
          if (outcome.skipped) {
            summary.skipped += 1;
          } else if (outcome.sent) {
            summary.emails_sent += 1;
            summary.minutes_granted_total += outcome.minutesGranted;
          }
        } catch (error) {
          summary.emails_failed += 1;
          console.error(`Failed to send activation email to ${user.email}:`, error);
        } finally {
          await this.delay(this.rateLimitMs);
        }
      }

      await this.logCampaignExecution(
        'day_3_activation',
        summary.emails_sent,
        summary.emails_failed
      );

      console.log(
        `Day 3 activation: sent ${summary.emails_sent}, failed ${summary.emails_failed}, skipped ${summary.skipped}`
      );
    } catch (error) {
      console.error('Failed to process Day 3 emails:', error);
      summary.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return summary;
  }
  
  /**
   * Process Day 7 feedback emails for active users
   */
  async processDay7Feedback(): Promise<CampaignResult> {
    console.log('Processing Day 7 feedback emails...');
    const summary = this.createEmptyResult('day_7_feedback');

    try {
      const users = await db().execute(sql`
        SELECT 
          u.uuid,
          u.email,
          u.nickname,
          u.locale,
          u.timezone,
          u.country,
          u.created_at,
          u.subscription_status,
          COUNT(t.id) as total_transcriptions,
          COALESCE(SUM(t.cost_minutes), 0) as total_minutes
        FROM v2tx_users u
        LEFT JOIN v2tx_transcriptions t ON u.uuid = t.user_uuid
        WHERE 
          DATE(u.created_at) = DATE(NOW() - INTERVAL '7 days')
          AND (u.subscription_status IS NULL OR u.subscription_status = 'free')
          AND NOT EXISTS (
            SELECT 1 FROM v2tx_email_rewards er 
            WHERE er.user_uuid = u.uuid 
            AND er.campaign_id = 'day_7_feedback'
          )
        GROUP BY u.uuid, u.email, u.nickname, u.locale, u.timezone, u.country, u.created_at, u.subscription_status
        HAVING COUNT(t.id) >= 1
      `);

      for (const user of users as unknown as UserEmailCandidate[]) {
        try {
          const outcome = await this.sendFeedbackEmail(user);
          if (outcome.skipped) {
            summary.skipped += 1;
          } else if (outcome.sent) {
            summary.emails_sent += 1;
            summary.minutes_granted_total += outcome.minutesGranted;
          }
        } catch (error) {
          summary.emails_failed += 1;
          console.error(`Failed to send feedback email to ${user.email}:`, error);
        } finally {
          await this.delay(this.rateLimitMs);
        }
      }

      await this.logCampaignExecution(
        'day_7_feedback',
        summary.emails_sent,
        summary.emails_failed
      );

      console.log(
        `Day 7 feedback: sent ${summary.emails_sent}, failed ${summary.emails_failed}, skipped ${summary.skipped}`
      );
    } catch (error) {
      console.error('Failed to process Day 7 emails:', error);
      summary.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return summary;
  }
  
  /**
   * Process paid user feedback emails
   */
  async processPaidUserFeedback(): Promise<CampaignResult> {
    console.log('Processing paid user feedback emails...');
    const summary = this.createEmptyResult('paid_user_feedback');

    try {
      const users = await db().execute(sql`
        SELECT 
          u.uuid,
          u.email,
          u.nickname,
          u.locale,
          u.timezone,
          u.country,
          u.subscription_status,
          COUNT(t.id) as total_transcriptions,
          COALESCE(SUM(t.cost_minutes), 0) as total_minutes
        FROM v2tx_users u
        LEFT JOIN v2tx_transcriptions t ON u.uuid = t.user_uuid
        INNER JOIN v2tx_orders o ON u.uuid = o.user_uuid
        WHERE 
          o.status = 'paid'
          AND DATE(o.paid_at) = DATE(NOW() - INTERVAL '3 days')
          AND u.subscription_status IN ('basic', 'pro', 'premium')
          AND NOT EXISTS (
            SELECT 1 FROM v2tx_email_rewards er 
            WHERE er.user_uuid = u.uuid 
            AND er.campaign_id = 'paid_user_feedback'
          )
        GROUP BY u.uuid, u.email, u.nickname, u.locale, u.timezone, u.country, u.subscription_status
        LIMIT 20
      `);

      for (const user of users as unknown as UserEmailCandidate[]) {
        try {
          const outcome = await this.sendPaidUserFeedbackEmail(user);
          if (outcome.skipped) {
            summary.skipped += 1;
          } else if (outcome.sent) {
            summary.emails_sent += 1;
            summary.minutes_granted_total += outcome.minutesGranted;
          }
        } catch (error) {
          summary.emails_failed += 1;
          console.error(`Failed to send paid feedback email to ${user.email}:`, error);
        } finally {
          await this.delay(this.rateLimitMs);
        }
      }

      await this.logCampaignExecution(
        'paid_user_feedback',
        summary.emails_sent,
        summary.emails_failed
      );

      console.log(
        `Paid user feedback: sent ${summary.emails_sent}, failed ${summary.emails_failed}, skipped ${summary.skipped}`
      );
    } catch (error) {
      console.error('Failed to process paid user emails:', error);
      summary.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return summary;
  }

  /**
   * Process inactive user win-back emails
   */
  async processInactiveUsers(): Promise<CampaignResult> {
    console.log('Processing inactive user emails...');
    const summary = this.createEmptyResult('win_back');

    try {
      const users = await db().execute(sql`
        SELECT 
          u.uuid,
          u.email,
          u.nickname,
          u.locale,
          u.timezone,
          u.country,
          u.subscription_status,
          MAX(t.created_at) as last_usage
        FROM v2tx_users u
        LEFT JOIN v2tx_transcriptions t ON u.uuid = t.user_uuid
        WHERE 
          (u.subscription_status IS NULL OR u.subscription_status = 'free')
          AND u.created_at < NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM v2tx_email_rewards er 
            WHERE er.user_uuid = u.uuid 
            AND er.campaign_id = 'win_back'
            AND er.created_at > NOW() - INTERVAL '60 days'
          )
        GROUP BY u.uuid, u.email, u.nickname, u.locale, u.timezone, u.country, u.subscription_status
        HAVING 
          MAX(t.created_at) < NOW() - INTERVAL '30 days'
          OR MAX(t.created_at) IS NULL
        LIMIT 50
      `);

      for (const user of users as unknown as UserEmailCandidate[]) {
        try {
          const outcome = await this.sendWinBackEmail(user);
          if (outcome.skipped) {
            summary.skipped += 1;
          } else if (outcome.sent) {
            summary.emails_sent += 1;
            summary.minutes_granted_total += outcome.minutesGranted;
          }
        } catch (error) {
          summary.emails_failed += 1;
          console.error(`Failed to send win-back email to ${user.email}:`, error);
        } finally {
          await this.delay(this.rateLimitMs);
        }
      }

      await this.logCampaignExecution('win_back', summary.emails_sent, summary.emails_failed);

      console.log(
        `Win-back: sent ${summary.emails_sent}, failed ${summary.emails_failed}, skipped ${summary.skipped}`
      );
    } catch (error) {
      console.error('Failed to process inactive emails:', error);
      summary.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return summary;
  }

  /**
   * Send activation email (Day 3)
   */
  private async sendActivationEmail(user: UserEmailCandidate): Promise<EmailSendOutcome> {
    // Grant bonus minutes
    const grantResult = await this.bonusService.grantEmailBonus({
      userUuid: user.uuid,
      minutes: 30,
      campaignId: 'day_3_activation',
      reason: 'Day 3 Activation Bonus',
      validDays: 30
    });
    
    if (!grantResult.success) {
      return {
        sent: false,
        skipped: true,
        minutesGranted: 0,
      };
    }
    
    const template = getEmailTemplate('day3_activation', user.locale || 'en');
    if (!template) {
      throw new Error('Template not found');
    }
    
    const ps = await this.psGenerator.generateCampaignPS(user.uuid, 'day3_activation');
    const rendered = renderTemplate(template, {
      userName: user.nickname || 'there',
      minutesGranted: 30,
      currentBalance: grantResult.newBalance,
      ps
    });
    
    const delivered = await sendEmail(
      user.email,
      rendered.subject,
      rendered.html,
      rendered.text
    );

    if (!delivered) {
      throw new Error('Email delivery failed');
    }

    await this.recordEmailSent(user.uuid, 'day_3_activation');

    console.log(`✅ Sent Day 3 activation email to ${user.email}`);

    return {
      sent: true,
      skipped: false,
      minutesGranted: grantResult.minutesGranted ?? 30,
    };
  }
  
  /**
   * Send feedback email (Day 7)
   */
  private async sendFeedbackEmail(user: UserEmailCandidate): Promise<EmailSendOutcome> {
    // Grant bonus minutes
    const grantResult = await this.bonusService.grantEmailBonus({
      userUuid: user.uuid,
      minutes: 90,
      campaignId: 'day_7_feedback',
      reason: 'Day 7 Co-Creator Bonus',
      validDays: 30
    });
    
    if (!grantResult.success) {
      return {
        sent: false,
        skipped: true,
        minutesGranted: 0,
      };
    }
    
    const userNumber = await this.getUserNumber(user.uuid);
    const template = getEmailTemplate('day7_feedback', user.locale || 'en');
    if (!template) {
      throw new Error('Template not found');
    }
    
    const ps = await this.psGenerator.generateCampaignPS(user.uuid, 'day7_feedback');
    const rendered = renderTemplate(template, {
      userName: user.nickname || 'there',
      userNumber,
      daysUsed: 7,
      totalMinutes: Math.round(user.total_minutes || 0),
      minutesGranted: 90,
      currentBalance: grantResult.newBalance,
      couponCode: 'COFOUNDER25',
      ps
    });
    
    const delivered = await sendEmail(
      user.email,
      rendered.subject,
      rendered.html,
      rendered.text
    );

    if (!delivered) {
      throw new Error('Email delivery failed');
    }

    await this.recordEmailSent(user.uuid, 'day_7_feedback', { minutes_granted: 90 });
    
    console.log(`✅ Sent Day 7 feedback email to ${user.email}`);

    return {
      sent: true,
      skipped: false,
      minutesGranted: grantResult.minutesGranted ?? 90,
    };
  }
  
  /**
   * Send paid user feedback email
   */
  private async sendPaidUserFeedbackEmail(user: UserEmailCandidate): Promise<EmailSendOutcome> {
    // Grant more minutes for paid users
    const grantResult = await this.bonusService.grantEmailBonus({
      userUuid: user.uuid,
      minutes: 120,
      campaignId: 'paid_user_feedback',
      reason: 'PRO User Feedback Bonus',
      validDays: 60
    });
    
    if (!grantResult.success) {
      return {
        sent: false,
        skipped: true,
        minutesGranted: 0,
      };
    }
    
    const totalHours = Math.round((user.total_minutes || 0) / 60);
    const template = getEmailTemplate('paid_user_feedback', user.locale || 'en');
    if (!template) {
      throw new Error('Template not found');
    }
    
    const ps = await this.psGenerator.generateCampaignPS(user.uuid, 'paid_user_feedback');
    const rendered = renderTemplate(template, {
      userName: user.nickname || 'there',
      totalHours,
      minutesGranted: 120,
      currentBalance: grantResult.newBalance,
      ps
    });
    
    const delivered = await sendEmail(
      user.email,
      rendered.subject,
      rendered.html,
      rendered.text
    );

    if (!delivered) {
      throw new Error('Email delivery failed');
    }

    await this.recordEmailSent(user.uuid, 'paid_user_feedback', { minutes_granted: 120 });
    
    console.log(`✅ Sent paid user feedback email to ${user.email}`);

    return {
      sent: true,
      skipped: false,
      minutesGranted: grantResult.minutesGranted ?? 120,
    };
  }
  
  /**
   * Send win-back email
   */
  private async sendWinBackEmail(user: UserEmailCandidate): Promise<EmailSendOutcome> {
    // Grant bonus minutes
    const grantResult = await this.bonusService.grantEmailBonus({
      userUuid: user.uuid,
      minutes: 50,
      campaignId: 'win_back',
      reason: 'Win-back Bonus',
      validDays: 14
    });
    
    if (!grantResult.success) {
      return {
        sent: false,
        skipped: true,
        minutesGranted: 0,
      };
    }
    
    const template = getEmailTemplate('win_back', user.locale || 'en');
    if (!template) {
      throw new Error('Template not found');
    }
    
    const ps = await this.psGenerator.generateCampaignPS(user.uuid, 'win_back');
    const rendered = renderTemplate(template, {
      userName: user.nickname || 'there',
      minutesGranted: 50,
      currentBalance: grantResult.newBalance,
      ps
    });
    
    const delivered = await sendEmail(
      user.email,
      rendered.subject,
      rendered.html,
      rendered.text
    );

    if (!delivered) {
      throw new Error('Email delivery failed');
    }

    await this.recordEmailSent(user.uuid, 'win_back', { minutes_granted: 50 });
    
    console.log(`✅ Sent win-back email to ${user.email}`);

    return {
      sent: true,
      skipped: false,
      minutesGranted: grantResult.minutesGranted ?? 50,
    };
  }
  
  /**
   * Helper: Get user's signup order number
   */
  private async getUserNumber(userUuid: string): Promise<number> {
    const result = await db().execute(
      sql`SELECT COUNT(*) + 1 as user_number
         FROM v2tx_users
         WHERE created_at < (
           SELECT created_at FROM v2tx_users WHERE uuid = ${userUuid}
         )`
    );
    
    return Number((result as unknown as any[])[0]?.user_number || 100);
  }
  
  /**
   * Helper: Record email sent
   */
  private async recordEmailSent(userUuid: string, campaignId: string, metadata?: any) {
    const payload = metadata ? JSON.stringify(metadata) : '{}';
    await db().execute(
      sql`INSERT INTO v2tx_email_history 
         (user_uuid, campaign_id, sent_at, metadata)
         VALUES (${userUuid}, ${campaignId}, NOW(), ${payload}::jsonb)`
    );
  }
  
  /**
   * Helper: Log campaign execution
   */
  private async logCampaignExecution(jobType: string, successCount: number, failCount: number) {
    const totalMinutes = await db().execute(
      sql`SELECT COALESCE(SUM(minutes_granted), 0) as total
         FROM v2tx_email_rewards
         WHERE campaign_id = ${jobType}
         AND DATE(granted_at) = DATE(NOW())`
    );
    
    await db().execute(
      sql`INSERT INTO v2tx_email_campaign_logs 
         (job_type, executed_at, emails_sent, emails_failed, minutes_granted_total, details)
         VALUES (
           ${jobType}, 
           NOW(), 
           ${successCount}, 
           ${failCount},
           ${(totalMinutes as unknown as any[])[0]?.total || 0},
           ${JSON.stringify({ timestamp: new Date().toISOString() })}
         )`
    );
  }
  
  /**
   * Helper: Delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Process all daily campaigns
   */
  async processAllCampaigns(): Promise<CampaignResult[]> {
    const handlers: Array<() => Promise<CampaignResult>> = [
      () => this.processDay3Activation(),
      () => this.processDay7Feedback(),
      () => this.processPaidUserFeedback(),
      () => this.processInactiveUsers(),
    ];

    const results: CampaignResult[] = [];
    for (const handler of handlers) {
      results.push(await handler());
    }
    return results;
  }

  async processCampaign(campaign: CampaignType): Promise<CampaignResult> {
    switch (campaign) {
      case 'day_3_activation':
        return this.processDay3Activation();
      case 'day_7_feedback':
        return this.processDay7Feedback();
      case 'paid_user_feedback':
        return this.processPaidUserFeedback();
      case 'win_back':
        return this.processInactiveUsers();
      default:
        throw new Error(`Unsupported campaign: ${campaign}`);
    }
  }
}
