export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailTemplateData {
  userName?: string;
  minutesGranted?: number;
  currentBalance?: number;
  daysUsed?: number;
  totalMinutes?: number;
  totalHours?: number;
  couponCode?: string;
  userNumber?: number;
  ps?: string;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const placeholderPattern = (placeholder: string) => new RegExp(escapeRegExp(placeholder), 'g');

export const EMAIL_TEMPLATES = {
  // Day 3 Activation Email (Low activity users)
  day3_activation: {
    en: {
      subject: "{{userName}}, need help getting started? 🎁",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9f9f9; border-radius: 10px; padding: 30px; }
    .highlight { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
    .benefits { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .benefits li { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Hi {{userName}} 👋</h2>
    </div>
    
    <div class="content">
      <p>I noticed you signed up for Harku a few days ago but haven't had a chance to fully explore yet.</p>
      
      <p>No worries - getting started with new tools can be overwhelming. That's why I wanted to personally reach out and help.</p>
      
      <div class="highlight">
        <h3>🎁 Here's a little boost to get you started:</h3>
        <p style="font-size: 24px; margin: 10px 0;"><strong>30 bonus minutes</strong></p>
        <p style="opacity: 0.9;">Already added to your account!</p>
      </div>
      
      <p><strong>Quick Start Guide:</strong></p>
      <div class="benefits">
        <ol>
          <li>📁 Upload any video or audio file (or paste a YouTube link)</li>
          <li>⚡ Get instant, accurate transcription</li>
          <li>📥 Download in your preferred format (TXT, SRT, etc.)</li>
        </ol>
      </div>
      
      <p>Common use cases from our users:</p>
      <ul>
        <li>📺 YouTube videos → Blog posts</li>
        <li>🎙️ Podcast episodes → Show notes</li>
        <li>📹 Meeting recordings → Action items</li>
        <li>🎓 Lectures → Study notes</li>
      </ul>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.NEXT_PUBLIC_WEB_URL}" class="button">Try It Now →</a>
      </p>
      
      <p>Need help? Just reply to this email - I personally read every message.</p>
      
      <p>Best,<br>
      Howard<br>
      Founder, Harku</p>
      
      <p style="color: #666; font-style: italic;">{{ps}}</p>
    </div>
    
    <div class="footer">
      <p>You're receiving this because you signed up for Harku</p>
      <p><a href="${process.env.NEXT_PUBLIC_WEB_URL}/unsubscribe" style="color: #666;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
Hi {{userName}},

I noticed you signed up for Harku a few days ago but haven't had a chance to fully explore yet.

Here's a little boost to get you started:
🎁 30 bonus minutes - Already added to your account!

Quick Start:
1. Upload any video or audio file
2. Get instant transcription
3. Download in your preferred format

Need help? Just reply to this email.

Best,
Howard
Founder, Harku

{{ps}}
      `
    }
  },
  
  // Day 7 Feedback Email (Main campaign)
  day7_feedback: {
    en: {
      subject: "{{userName}}, you're among our first 100 co-creators 🚀",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9f9f9; border-radius: 10px; padding: 30px; }
    .highlight { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .question-box { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 15px 0; }
    .rewards { background: #fff; border: 2px dashed #667eea; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .reward-item { margin: 10px 0; padding: 10px; background: #f0f0ff; border-radius: 6px; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Hi {{userName}} 🎉</h2>
      <p style="color: #667eea; font-weight: bold;">You're User #{{userNumber}} - One of Our First 100!</p>
    </div>
    
    <div class="content">
      <p>You're not just an early user - <strong>you're a co-creator of Harku</strong>.</p>
      
      <p>Over the past {{daysUsed}} days, you've transcribed {{totalMinutes}} minutes. But more importantly, you've become part of our product's DNA.</p>
      
      <p><strong>What does this mean?</strong></p>
      <ul>
        <li>Every feature you use shapes our roadmap</li>
        <li>Your workflow becomes our blueprint</li>
        <li>Your challenges become our missions</li>
      </ul>
      
      <div class="question-box">
        <h3>🤔 I have 3 questions that will directly influence our next update:</h3>
        <ol>
          <li><strong>What made you choose Harku?</strong><br>
          <span style="color: #666; font-size: 14px;">Your answer shapes our messaging</span></li>
          
          <li><strong>What's the ONE thing that frustrates you?</strong><br>
          <span style="color: #666; font-size: 14px;">This becomes our top priority</span></li>
          
          <li><strong>If you had a magic wand, what feature would you add?</strong><br>
          <span style="color: #666; font-size: 14px;">This goes straight to our roadmap</span></li>
        </ol>
        
        <p style="text-align: center; margin-top: 20px;">
          <em>Just hit reply and share your thoughts - no forms, no surveys.</em>
        </p>
      </div>
      
      <div class="rewards">
        <h3 style="text-align: center;">🏆 Your Co-Creator Benefits:</h3>
        
        <div class="reward-item">
          <strong>🎁 90 minutes bonus credit</strong><br>
          <span style="color: green;">✓ Already added to your account</span>
        </div>
        
        <div class="reward-item">
          <strong>💎 Lifetime 25% discount</strong><br>
          Code: <code style="background: #f0f0ff; padding: 2px 6px; font-size: 16px; font-weight: bold;">{{couponCode}}</code>
        </div>
        
        <div class="reward-item">
          <strong>📧 Direct line to founder</strong><br>
          Just reply to this email - I read everything personally
        </div>
        
        <div class="reward-item">
          <strong>🚀 "Co-Creator" badge</strong><br>
          <span style="color: #666;">Coming to your profile soon</span>
        </div>
      </div>
      
      <div class="highlight">
        <p style="font-size: 18px; margin: 0;">Your current balance:</p>
        <p style="font-size: 32px; margin: 10px 0;"><strong>{{currentBalance}} minutes</strong></p>
      </div>
      
      <p><strong>The truth is:</strong> Your feedback isn't just "considered" - it's implemented. Last week alone, we shipped 3 features suggested by early users. Yours could be next.</p>
      
      <p>Let's build something amazing together.</p>
      
      <p>Best,<br>
      Howard<br>
      Founder & Your Co-builder<br>
      Harku</p>
      
      <p style="color: #666; font-style: italic;">{{ps}}</p>
      
      <p style="background: #f0f0ff; padding: 15px; border-radius: 6px; margin-top: 20px;">
        <strong>P.P.S.</strong> Want to join our private Co-Creator Slack channel where we discuss features before building them? Just reply "I'm in!"
      </p>
    </div>
    
    <div class="footer">
      <p>You're receiving this because you're one of our first 100 users</p>
      <p><a href="${process.env.NEXT_PUBLIC_WEB_URL}/unsubscribe" style="color: #666;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
Hi {{userName}},

You're User #{{userNumber}} - One of Our First 100!

You're not just an early user - you're a co-creator of Harku.

I have 3 questions that will directly influence our next update:

1. What made you choose Harku?
2. What's the ONE thing that frustrates you?
3. If you had a magic wand, what feature would you add?

Your Co-Creator Benefits:
🎁 90 minutes bonus credit - Already added!
💎 Lifetime 25% discount - Code: {{couponCode}}
📧 Direct line to me - Just reply
🚀 "Co-Creator" badge - Coming soon

Your current balance: {{currentBalance}} minutes

Just hit reply and share your thoughts.

Let's build something amazing together.

Best,
Howard
Founder & Your Co-builder

{{ps}}
      `
    }
  },
  
  // Paid User Feedback Email
  paid_user_feedback: {
    en: {
      subject: "{{userName}}, as a PRO user, your opinion matters most 👑",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .pro-badge { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #333; padding: 5px 15px; border-radius: 20px; display: inline-block; font-weight: bold; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9f9f9; border-radius: 10px; padding: 30px; }
    .highlight { background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #333; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; }
    .priority-box { background: #fff; border: 2px solid #FFD700; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="pro-badge">PRO USER</span>
      <h2>Hi {{userName}} 👑</h2>
    </div>
    
    <div class="content">
      <p><strong>You're not just a user - you're an investor in Harku's future.</strong></p>
      
      <p>You've transcribed {{totalHours}} hours this month. That's amazing! But more importantly, you've chosen to trust us with your work.</p>
      
      <div class="priority-box">
        <h3>🎯 Your feedback has PRIORITY status</h3>
        
        <p>I have 3 questions that will <strong>DIRECTLY</strong> influence our next sprint:</p>
        
        <ol>
          <li><strong>What feature would save you the most time?</strong><br>
          → We'll prioritize this immediately</li>
          
          <li><strong>What's still frustrating about Harku?</strong><br>
          → I'll personally ensure this gets fixed</li>
          
          <li><strong>What integration would be most valuable?</strong><br>
          → Your vote counts double as a PRO user</li>
        </ol>
      </div>
      
      <div class="highlight">
        <h3>Your PRO Partner Benefits:</h3>
        <p>👑 120 bonus minutes (added!)</p>
        <p>🚀 Early access to ALL new features</p>
        <p>📞 Monthly 15-min call with me</p>
        <p>🎯 Your features get priority dev time</p>
      </div>
      
      <p>Reply to this email - I read and respond to every PRO user personally within 24 hours.</p>
      
      <p>Best,<br>
      Howard<br>
      Founder & Your Product Partner</p>
      
      <p style="color: #666; font-style: italic;">{{ps}}</p>
    </div>
    
    <div class="footer">
      <p>You're receiving this as a valued PRO user</p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
Hi {{userName}},

[PRO USER]

You're not just a user - you're an investor in Harku's future.

Your feedback has PRIORITY status.

3 questions for our next sprint:
1. What feature would save you the most time?
2. What's still frustrating?
3. What integration would be most valuable?

Your PRO Partner Benefits:
👑 120 bonus minutes (added!)
🚀 Early access to ALL features
📞 Monthly founder calls
🎯 Priority development

Reply directly - I respond within 24 hours.

Best,
Howard

{{ps}}
      `
    }
  },
  
  // Win-back Email (30 days inactive)
  win_back: {
    en: {
      subject: "{{userName}}, we miss you (and have something special) 🎁",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .content { background: #f9f9f9; border-radius: 10px; padding: 30px; }
    .offer { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin: 25px 0; }
    .button { display: inline-block; padding: 15px 40px; background: white; color: #667eea; text-decoration: none; border-radius: 6px; font-weight: bold; }
    .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <h2>Hi {{userName}} 👋</h2>
      
      <p>It's been a while since we've seen you at Harku. We hope everything's okay!</p>
      
      <p>If you moved on to another tool, we understand. But if you just got busy (happens to all of us!), we'd love to welcome you back.</p>
      
      <div class="offer">
        <h3>🎁 Welcome Back Offer</h3>
        <p style="font-size: 24px; margin: 15px 0;"><strong>50 FREE minutes</strong></p>
        <p style="font-size: 20px; margin: 15px 0;">PLUS</p>
        <p style="font-size: 24px; margin: 15px 0;"><strong>50% OFF your next purchase</strong></p>
        <p style="opacity: 0.9;">Code: COMEBACK50</p>
        
        <p style="margin-top: 25px;">
          <a href="${process.env.NEXT_PUBLIC_WEB_URL}" class="button">Claim Your Minutes →</a>
        </p>
      </div>
      
      <p><strong>What's new since you left:</strong></p>
      <ul>
        <li>✨ 2x faster processing</li>
        <li>🎯 99.5% accuracy (up from 97%)</li>
        <li>🌍 Support for 50+ languages</li>
        <li>📱 New mobile experience</li>
      </ul>
      
      <p>No hard feelings if you don't need Harku anymore. But if you do, we're here with open arms (and free minutes!).</p>
      
      <p>Best,<br>
      Howard<br>
      Harku Team</p>
      
      <p style="color: #666; font-style: italic;">{{ps}}</p>
    </div>
    
    <div class="footer">
      <p>This is a one-time win-back offer</p>
      <p><a href="${process.env.NEXT_PUBLIC_WEB_URL}/unsubscribe" style="color: #666;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
Hi {{userName}},

It's been a while! We hope everything's okay.

Welcome Back Offer:
🎁 50 FREE minutes
💰 50% OFF next purchase
Code: COMEBACK50

What's new:
✨ 2x faster
🎯 99.5% accuracy
🌍 50+ languages

We're here if you need us!

Best,
Howard

{{ps}}
      `
    }
  }
};

export function getEmailTemplate(
  templateName: string,
  language: string = 'en'
): EmailTemplate | null {
  const template = EMAIL_TEMPLATES[templateName as keyof typeof EMAIL_TEMPLATES];
  if (!template) return null;
  
  return template?.[language as keyof typeof template] || template?.['en'];
}

export function renderTemplate(
  template: EmailTemplate, 
  data: EmailTemplateData
): EmailTemplate {
  let html = template.html;
  let text = template.text || '';
  let subject = template.subject;
  
  // Replace all placeholders
  Object.entries(data).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const replacement = value?.toString() || '';
    
    html = html.replace(placeholderPattern(placeholder), replacement);
    text = text.replace(placeholderPattern(placeholder), replacement);
    subject = subject.replace(placeholderPattern(placeholder), replacement);
  });
  
  // Default values for missing placeholders
  const defaults = {
    userName: 'there',
    ps: 'P.S. Reply directly to this email - I read everything personally.',
    couponCode: 'COFOUNDER25'
  };
  
  Object.entries(defaults).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    html = html.replace(placeholderPattern(placeholder), value);
    text = text.replace(placeholderPattern(placeholder), value);
    subject = subject.replace(placeholderPattern(placeholder), value);
  });
  
  return { subject, html, text };
}
