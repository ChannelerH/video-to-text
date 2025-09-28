# Email Feedback System Deployment Guide

## Overview
The email feedback system sends automated emails to users at different stages of their journey, collecting feedback and rewarding engagement with bonus minutes.

## Setup Steps

### 1. Database Migration
Run the migration to create necessary tables:
```bash
# Apply the migration
npx drizzle-kit push

# Or if you use migrations
npx drizzle-kit migrate
```

### 2. Environment Variables
Add these to your `.env.local`:
```env
# Email Service (Resend)
RESEND_API_KEY=re_your_api_key_here

# Email Settings
EMAIL_FROM="Textuno <noreply@textuno.io>"
EMAIL_REPLY_TO=support@textuno.io

# Security
CRON_SECRET=generate_random_32_char_string
ADMIN_API_KEY=your_admin_api_key

# Optional: Customize bonus minutes
EMAIL_BONUS_MINUTES_DAY3=20
EMAIL_BONUS_MINUTES_DAY7=30
```

### 3. Vercel Configuration
The `vercel.json` has been updated to include the hourly cron job:
```json
{
  "crons": [
    {
      "path": "/api/cron/hourly-emails",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### 4. Deploy to Vercel
```bash
vercel --prod
```

## Email Campaigns

### Campaign Types
1. **Day 3 Activation** - Users who signed up 3 days ago with low activity
   - Grants 20 bonus minutes
   - Encourages first transcription

2. **Day 7 Feedback** - All users at 7 days
   - Grants 30 bonus minutes  
   - Collects product feedback

3. **Paid User Feedback** - Premium users monthly
   - Grants 50 bonus minutes
   - Priority feedback collection

4. **Win-back** - Inactive users after 14 days
   - Grants 40 bonus minutes
   - Re-engagement campaign

## Testing

### Test Endpoints

#### 1. Check System Status
```bash
curl http://localhost:3000/api/admin/email-status \
  -H "x-api-key: your_admin_api_key"
```

#### 2. Send Test Email
```bash
curl -X POST http://localhost:3000/api/admin/send-test-email \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_admin_api_key" \
  -d '{
    "to": "test@example.com",
    "templateType": "day3_activation",
    "testData": {
      "userName": "Test User",
      "bonusMinutes": 20
    }
  }'
```

#### 3. Manual Campaign Trigger
```bash
# Trigger all campaigns
curl -X POST http://localhost:3000/api/cron/hourly-emails

# Trigger specific campaign
curl -X POST http://localhost:3000/api/cron/hourly-emails \
  -H "Content-Type: application/json" \
  -d '{"campaign": "day3_activation"}'
```

#### 4. Grant Test Bonus Minutes
```bash
curl -X POST http://localhost:3000/api/admin/email-status \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_admin_api_key" \
  -d '{
    "userUuid": "test-user-uuid",
    "minutes": 20,
    "campaignId": "test_campaign"
  }'
```

## Monitoring

### Key Metrics to Track
- **Email delivery rate** - Should be >95%
- **Open rate** - Target 30-40%
- **Click rate** - Target 10-15%
- **Bonus redemption** - Track minute pack usage
- **Feedback submission** - Response rate

### Database Queries

Check campaign performance:
```sql
-- Campaign statistics
SELECT 
  campaign_id,
  COUNT(DISTINCT user_uuid) as users,
  SUM(minutes_granted) as total_minutes,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful
FROM v2tx_email_rewards
GROUP BY campaign_id;

-- Recent email activity
SELECT 
  DATE(sent_at) as date,
  COUNT(*) as emails_sent,
  COUNT(opened_at) as opened,
  COUNT(clicked_at) as clicked
FROM v2tx_email_history
WHERE sent_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

## Troubleshooting

### Common Issues

1. **Emails not sending**
   - Check RESEND_API_KEY is set
   - Verify Resend account is active
   - Check email rate limits

2. **Cron not running**
   - Verify CRON_SECRET in Vercel environment
   - Check Vercel Functions logs
   - Ensure cron schedule is correct

3. **Minutes not granted**
   - Check v2tx_email_rewards table for errors
   - Verify minute pack creation in v2tx_minute_packs
   - Check for duplicate prevention constraints

4. **Wrong timezone emails**
   - User timezone detection happens at first login
   - Can be manually updated in v2tx_users table
   - Default is UTC if not detected

## Security Considerations

1. **API Keys**
   - Use strong, random keys for CRON_SECRET and ADMIN_API_KEY
   - Rotate keys regularly
   - Never commit keys to git

2. **Rate Limiting**
   - System limits to 10 emails/second
   - Prevents email bombing
   - Automatic retry for failures

3. **Duplicate Prevention**
   - Unique constraints prevent double rewards
   - Campaign tracking prevents spam
   - 30-day cooldown for repeat campaigns

## Maintenance

### Daily Tasks
- Monitor email delivery metrics
- Check for failed rewards to retry

### Weekly Tasks  
- Review campaign performance
- Analyze user feedback submissions
- Adjust bonus minute amounts if needed

### Monthly Tasks
- Clean up old email history (>90 days)
- Review and update email templates
- Analyze conversion impact

## Support

For issues or questions:
1. Check Vercel Functions logs
2. Query database tables for debugging
3. Test with manual endpoints first
4. Contact support with error details
