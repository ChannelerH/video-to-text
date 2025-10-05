import { NextResponse } from 'next/server';
import { getEmailTemplate, renderTemplate } from '@/services/email-templates';
import { sendEmail } from '@/services/email-sender';
import { PersonalizedPSGenerator } from '@/services/ps-generator';
import { readJson } from '@/lib/read-json';

// Test endpoint to send a sample email
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
    const body = await readJson<{
      to?: string;
      templateType?: string;
      testData?: Record<string, any>;
    }>(request);
    const { 
      to, 
      templateType = 'day3_activation',
      testData = {}
    } = body;
    
    if (!to) {
      return NextResponse.json(
        { error: 'Missing recipient email' },
        { status: 400 }
      );
    }
    
    // Get template
    const template = getEmailTemplate(templateType as any);
    if (!template) {
      return NextResponse.json(
        { error: `Template '${templateType}' not found` },
        { status: 404 }
      );
    }
    
    // Generate test PS
    const psGenerator = new PersonalizedPSGenerator();
    const ps = await psGenerator.generateCampaignPS(
      testData.userUuid || 'test-user',
      templateType
    );
    
    // Prepare template data
    const templateData = {
      userName: testData.userName || 'Test User',
      bonusMinutes: testData.bonusMinutes || 20,
      loginLink: testData.loginLink || 'https://harku.io/signin',
      feedbackLink: testData.feedbackLink || 'https://harku.io/feedback',
      unsubscribeLink: testData.unsubscribeLink || '#',
      personalizedPS: ps,
      ...testData
    };
    
    // Render email
    const { html, text } = renderTemplate(template, templateData);
    
    // Send test email
    const success = await sendEmail(
      to,
      `[TEST] ${template.subject}`,
      html,
      text
    );
    
    return NextResponse.json({
      success,
      test_mode: true,
      timestamp: new Date().toISOString(),
      template_type: templateType,
      recipient: to,
      ps_generated: ps
    });
    
  } catch (error) {
    console.error('Failed to send test email:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send test email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
