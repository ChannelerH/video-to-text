import { Resend } from 'resend';
import { gmailSender } from './gmail-sender';

// Initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Gmail configuration
const gmailUser = process.env.GMAIL_USER || process.env.ERROR_ALERT_FROM || process.env.ERROR_ALERT_EMAIL || 'channelerH@gmail.com';
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD || process.env.ERROR_ALERT_APP_PASSWORD;

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

// Simple email sending using fetch to call existing API
async function sendViaExistingAPI(options: EmailOptions): Promise<boolean> {
  try {
    // Use the existing demo send-email API that already works with Resend
    const response = await fetch('http://localhost:3000/api/demo/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emails: [options.to],
        subject: options.subject,
        content: options.html
      })
    });
    
    const result = await response.json();
    return result.success !== false;
  } catch (error) {
    console.error('[EmailSender] Failed to send via existing API:', error);
    return false;
  }
}

export class EmailSender {
  private from: string;
  private replyTo: string;
  private useResend: boolean;
  
  constructor() {
    this.useResend = !!resend;
    
    if (this.useResend) {
      this.from = process.env.EMAIL_FROM || 'V2TX <noreply@video2text.app>';
      this.replyTo = process.env.EMAIL_REPLY_TO || 'support@video2text.app';
      console.log('[EmailSender] Using Resend for email delivery');
    } else {
      // For now, we'll use a simplified approach without nodemailer
      this.from = `V2TX <${gmailUser}>`;
      this.replyTo = gmailUser;
      console.log('[EmailSender] Gmail configuration detected, but using simplified approach');
    }
  }
  
  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (resend) {
        // Use Resend API directly
        const { data, error } = await resend.emails.send({
          from: options.from || this.from,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          replyTo: options.replyTo || this.replyTo,
          tags: options.tags || []
        });
        
        if (error) {
          console.error('[Resend] Failed to send email:', error);
          return false;
        }
        
        console.log(`[Resend] Email sent successfully to ${options.to}:`, data?.id);
        return true;
        
      } else if (gmailSender.isConfigured()) {
        // Use Gmail SMTP directly
        console.log('[EmailSender] Using Gmail SMTP to send email...');
        const success = await gmailSender.sendEmail(
          options.to,
          options.subject,
          options.html,
          options.text
        );
        return success;
        
      } else if (process.env.RESEND_SENDER_EMAIL) {
        // Try using the existing demo API endpoint
        console.log('[EmailSender] Attempting to use existing demo API...');
        return await sendViaExistingAPI(options);
        
      } else {
        // For testing - just log the email
        console.log('[EmailSender] Email service not configured. Would send email:');
        console.log(`  To: ${options.to}`);
        console.log(`  Subject: ${options.subject}`);
        console.log(`  From: ${options.from || this.from}`);
        
        // In development, consider it successful for testing
        if (process.env.NODE_ENV === 'development') {
          console.log('[EmailSender] Development mode - returning success for testing');
          return true;
        }
        
        return false;
      }
      
    } catch (error) {
      console.error('[EmailSender] Error sending email:', error);
      return false;
    }
  }
  
  /**
   * Send email with retry logic
   */
  async sendEmailWithRetry(
    options: EmailOptions, 
    maxRetries: number = 3
  ): Promise<boolean> {
    let attempt = 0;
    let lastError;
    
    while (attempt < maxRetries) {
      try {
        const success = await this.sendEmail(options);
        if (success) return true;
        
        attempt++;
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
        }
      } catch (error) {
        lastError = error;
        attempt++;
      }
    }
    
    console.error(`Failed to send email after ${maxRetries} attempts:`, lastError);
    return false;
  }
  
  /**
   * Send batch emails with rate limiting
   */
  async sendBatch(
    emails: EmailOptions[],
    rateLimit: number = 10 // emails per second
  ): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };
    const delayMs = 1000 / rateLimit;
    
    for (const email of emails) {
      const success = await this.sendEmail(email);
      
      if (success) {
        results.sent++;
      } else {
        results.failed++;
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    return results;
  }
  
  /**
   * Validate email address
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Create email tags for tracking
   */
  createTags(campaign: string, userType: string): { name: string; value: string }[] {
    return [
      { name: 'campaign', value: campaign },
      { name: 'user_type', value: userType },
      { name: 'environment', value: process.env.NODE_ENV || 'development' }
    ];
  }
}

// Export singleton instance
export const emailSender = new EmailSender();

// Export sendEmail function for backward compatibility
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  return emailSender.sendEmail({ to, subject, html, text });
}
