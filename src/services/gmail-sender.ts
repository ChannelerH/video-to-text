import tls from 'tls';

interface GmailConfig {
  user: string;
  password: string;
  host?: string;
  port?: number;
}

export class GmailSender {
  private config: GmailConfig;
  
  constructor() {
    const user = process.env.GMAIL_USER || process.env.ERROR_ALERT_FROM || process.env.ERROR_ALERT_EMAIL || 'channelerH@gmail.com';
    const password = process.env.GMAIL_APP_PASSWORD || process.env.ERROR_ALERT_APP_PASSWORD || '';
    
    this.config = {
      user,
      password,
      host: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.GMAIL_SMTP_PORT || 465)
    };
    
    if (!this.config.password) {
      console.warn('[GmailSender] No Gmail app password configured');
    }
  }
  
  private base64(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64');
  }
  
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string
  ): Promise<boolean> {
    if (!this.config.password) {
      console.error('[GmailSender] Cannot send email: No Gmail app password configured');
      return false;
    }
    
    const { user, password, host, port } = this.config;
    
    return new Promise((resolve) => {
      const socket = tls.connect(port!, host!, {
        servername: host,
        rejectUnauthorized: false,
      });
      
      socket.setEncoding('utf8');
      
      const write = (command: string) => {
        socket.write(`${command}\r\n`);
      };
      
      const read = (expected?: number) =>
        new Promise<{ code: number; raw: string }>((readResolve, readReject) => {
          let buffer = '';
          
          const cleanup = () => {
            socket.off('data', onData);
            socket.off('error', onError);
          };
          
          const onError = (err: Error) => {
            cleanup();
            readReject(err);
          };
          
          const onData = (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/).filter(Boolean);
            if (!lines.length) return;
            const lastLine = lines[lines.length - 1];
            if (!/^\d{3} [\s\S]*/.test(lastLine)) {
              return;
            }
            
            cleanup();
            buffer = '';
            const code = Number(lastLine.slice(0, 3));
            if (expected && code !== expected) {
              readReject(new Error(`SMTP expected ${expected}, got ${code}: ${lastLine}`));
              return;
            }
            readResolve({ code, raw: lines.join('\n') });
          };
          
          socket.on('data', onData);
          socket.once('error', onError);
        });
      
      const performSMTP = async () => {
        try {
          await read(); // Initial greeting
          write(`EHLO ${host}`);
          await read(250);
          write('AUTH LOGIN');
          await read(334);
          write(this.base64(user));
          await read(334);
          write(this.base64(password));
          await read(235);
          write(`MAIL FROM:<${user}>`);
          await read(250);
          write(`RCPT TO:<${to}>`);
          await read(250);
          write('DATA');
          await read(354);
          
          // Create email with proper MIME structure
          const boundary = `----=_NextPart_${Date.now()}`;
        const headers = [
            `From: Textuno <${user}>`,
            `To: ${to}`,
            `Subject: ${subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Transfer-Encoding: base64`,
            '',
            Buffer.from(textContent || this.htmlToText(htmlContent), 'utf8').toString('base64'),
            '',
            `--${boundary}`,
            `Content-Type: text/html; charset=utf-8`,
            `Content-Transfer-Encoding: base64`,
            '',
            Buffer.from(htmlContent, 'utf8').toString('base64'),
            '',
            `--${boundary}--`
          ].join('\r\n');
          
          write(`${headers}\r\n.`);
          await read(250);
          write('QUIT');
          await read(221);
          
          console.log(`[GmailSender] Email sent successfully to ${to}`);
          resolve(true);
        } catch (error) {
          console.error('[GmailSender] Failed to send email:', error);
          resolve(false);
        } finally {
          socket.end();
        }
      };
      
      performSMTP().catch(err => {
        console.error('[GmailSender] SMTP error:', err);
        socket.end();
        resolve(false);
      });
    });
  }
  
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  isConfigured(): boolean {
    return !!this.config.password;
  }
}

// Export singleton instance
export const gmailSender = new GmailSender();
