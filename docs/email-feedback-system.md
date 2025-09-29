# 📧 用户反馈邮件系统 - 完整实施方案

## 一、系统概述

### 1.1 核心目标
- 在用户注册后的关键时间点（3天、7天、30天）自动发送个性化邮件
- 收集用户反馈，建立"共创产品"的参与感
- 通过赠送免费分钟数激励用户参与
- 根据用户时区在最佳时间（当地上午9点）发送
- 付费用户获得更多权益和重视

### 1.2 预期效果
- 邮件打开率 > 40%
- 用户回复率 > 15%  
- 7日留存提升 10%+
- 付费转化率提升 5%+

## 二、邮件策略

### 2.1 用户分群策略

| 用户类型 | 触发时机 | 奖励内容 | 邮件重点 | 优先级 |
|---------|---------|---------|---------|---------|
| **新用户-低活跃** | Day 3 (使用<2次) | 30分钟 | 激活引导 | 中 |
| **新用户-活跃** | Day 7 (使用≥1次) | 90分钟 + 25%折扣码 | 反馈收集 | 高 |
| **新付费用户** | 付费后Day 3 | 120分钟 + VIP标识 | 深度反馈 | 最高 |
| **老付费用户** | 每月1次 | 60分钟 | 产品方向 | 最高 |
| **流失用户** | 30天未活跃 | 50分钟 + 50%折扣 | 用户召回 | 低 |
| **取消订阅用户** | 取消时 | 150分钟 | 挽回原因 | 高 |

### 2.2 发送规则
- 每个用户每月最多收到2封邮件
- 同一campaign只能收到1次
- 邮件间隔至少7天
- 付费用户可以收到专属邮件

## 三、技术架构

### 3.1 数据库设计

```sql
-- 1. 扩展用户表
ALTER TABLE v2tx_users ADD COLUMN IF NOT EXISTS 
  country VARCHAR(2),           -- ISO国家代码
  timezone VARCHAR(50),         -- IANA时区
  city VARCHAR(100),           -- 城市
  browser_language VARCHAR(10), -- 浏览器语言
  email_language VARCHAR(10) DEFAULT 'en', -- 邮件语言偏好
  optimal_send_hour INTEGER DEFAULT 9;     -- 最佳发送时间

-- 2. 邮件奖励记录表（防重复发放）
CREATE TABLE IF NOT EXISTS v2tx_email_rewards (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  campaign_id VARCHAR(50) NOT NULL,  -- 'day_3_activation', 'day_7_feedback', etc.
  minutes_granted INTEGER NOT NULL,
  pack_id INTEGER,  -- 关联到minute_packs表
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  granted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_uuid, campaign_id)
);

-- 3. 用户反馈追踪表
CREATE TABLE IF NOT EXISTS v2tx_user_feedback (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  feedback_type VARCHAR(50), -- 'feature', 'bug', 'improvement'
  content TEXT,
  status VARCHAR(50) DEFAULT 'received',
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  implemented_at TIMESTAMP WITH TIME ZONE,
  related_feature_id INTEGER,
  response TEXT
);

-- 4. 邮件发送历史
CREATE TABLE IF NOT EXISTS v2tx_email_history (
  id SERIAL PRIMARY KEY,
  user_uuid VARCHAR(255) NOT NULL,
  campaign_id VARCHAR(50),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  unsubscribed BOOLEAN DEFAULT FALSE
);
```

### 3.2 分钟赠送流程

```
用户符合条件 
  ↓
检查是否已发放（v2tx_email_rewards）
  ↓
创建分钟包（v2tx_minute_packs，30天有效期）
  ↓
更新用户余额（v2tx_user_minutes）
  ↓
记录奖励状态（v2tx_email_rewards.status = 'completed'）
  ↓
发送邮件
  ↓
记录发送历史（v2tx_email_history）
```

## 四、实现代码

### 4.1 核心服务类

```typescript
// src/services/email-bonus-minutes.ts
export class EmailBonusMinutesService {
  /**
   * 为邮件活动赠送分钟包
   */
  async grantEmailBonus(params: {
    userUuid: string;
    minutes: number;
    campaignId: string;
    reason: string;
    validDays?: number;
  }) {
    const { userUuid, minutes, campaignId, reason, validDays = 30 } = params;
    
    // 1. 检查是否已发放
    const existing = await checkExistingReward(userUuid, campaignId);
    if (existing) return { success: false, reason: 'already_granted' };
    
    // 2. 创建分钟包
    const orderNo = `EMAIL_${campaignId}_${userUuid}_${Date.now()}`;
    const validMonths = Math.ceil(validDays / 30);
    
    await addMinutesWithExpiry(
      userUuid, 
      minutes,
      0,
      validMonths,
      orderNo
    );
    
    // 3. 记录奖励
    await recordReward(userUuid, campaignId, minutes);
    
    // 4. 返回新余额
    const balance = await getUserBalance(userUuid);
    
    return {
      success: true,
      minutesGranted: minutes,
      newBalance: balance,
      expiresAt: new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
    };
  }
}
```

### 4.2 时区调度器

```typescript
// src/services/timezone-scheduler.ts
export class TimezoneEmailScheduler {
  /**
   * 每小时执行，发送对应时区的邮件
   */
  async processHourlyEmails() {
    const currentUTCHour = new Date().getUTCHours();
    
    // 确定当前是哪些时区的早上9点
    const targetTimezones = this.getTimezonesAt9AM(currentUTCHour);
    
    for (const timezone of targetTimezones) {
      await this.sendEmailsForTimezone(timezone);
    }
  }
  
  private getTimezonesAt9AM(utcHour: number): string[] {
    const mapping = {
      1: ['Asia/Shanghai', 'Asia/Hong_Kong'],  // UTC+8
      0: ['Asia/Tokyo', 'Asia/Seoul'],          // UTC+9
      9: ['Europe/London'],                      // UTC+0
      8: ['Europe/Paris', 'Europe/Berlin'],     // UTC+1
      14: ['America/New_York'],                 // UTC-5
      17: ['America/Los_Angeles'],              // UTC-8
    };
    
    return mapping[utcHour] || [];
  }
}
```

### 4.3 个性化内容生成

```typescript
// src/services/personalized-email.ts
export class PersonalizedEmailService {
  async generateContent(userId: string, campaignType: string) {
    const user = await getUserDetails(userId);
    const feedback = await getUserFeedbackHistory(userId);
    const usage = await getUserUsageStats(userId);
    
    // 生成个性化P.S.
    const ps = this.generatePS(user, feedback, usage);
    
    // 选择模板
    const template = this.getTemplate(campaignType, user);
    
    return {
      subject: template.subject.replace('{{name}}', user.name),
      body: template.body
        .replace('{{name}}', user.name)
        .replace('{{usage_hours}}', usage.totalHours)
        .replace('{{ps}}', ps)
    };
  }
  
  private generatePS(user: any, feedback: any[], usage: any): string {
    // 基于真实数据生成P.S.
    if (feedback.find(f => f.status === 'completed')) {
      const feature = feedback.find(f => f.status === 'completed');
      return `P.S. The "${feature.title}" you requested is now live!`;
    }
    
    if (user.isPaid && user.daysSincePaid < 7) {
      return "P.S. Welcome to PRO! Your feedback has priority.";
    }
    
    if (usage.hoursThisMonth > 10) {
      return `P.S. ${usage.hoursThisMonth} hours this month - you're on fire!`;
    }
    
    return "P.S. Reply directly - I read every email personally.";
  }
}
```

## 五、自动触发机制

### 5.1 Vercel Cron Job配置

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/hourly-emails",
      "schedule": "0 * * * *"  // 每小时执行
    },
    {
      "path": "/api/cron/daily-stats",
      "schedule": "0 0 * * *"   // 每天统计
    }
  ]
}
```

### 5.2 Cron Job实现

```typescript
// app/api/cron/hourly-emails/route.ts
export async function GET(request: Request) {
  // 验证请求
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const scheduler = new TimezoneEmailScheduler();
  const bonusService = new EmailBonusMinutesService();
  
  try {
    // 执行时区邮件发送
    await scheduler.processHourlyEmails();
    
    return Response.json({ 
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron failed:', error);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
```

### 5.3 备选方案：GitHub Actions

```yaml
# .github/workflows/email-campaigns.yml
name: Hourly Email Campaigns

on:
  schedule:
    - cron: '0 * * * *'  # 每小时
  workflow_dispatch:

jobs:
  send-emails:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger email campaigns
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-domain.com/api/cron/hourly-emails
```

## 六、邮件模板

### 6.1 Day 7 反馈邮件（重点）

**免费用户版本：**
```
Subject: [Name], you're among our first 100 co-creators 🚀

Hi [Name],

You're one of our first 100 users - this makes you incredibly special to us.

Over the past 7 days, you've transcribed [X] minutes. 
But more importantly, you've become part of our product's DNA.

I have 3 questions that could directly influence our next update:

1. What made you choose Harku?
2. What's the ONE thing that frustrates you?
3. If you had a magic wand, what feature would you add?

As a founding member, you deserve special recognition:
🎁 90 minutes bonus credit (already added to your account)
💎 Lifetime 25% discount code: COFOUNDER25
📧 Direct line to me (just reply to this email)

Your feedback isn't just "considered" - it's implemented.

Let's build something amazing together,

Howard
Founder & Your Co-builder

[PS]
```

**付费用户版本：**
```
Subject: [Name], as a PRO user, your opinion matters most 👑

Hi [Name],

You're not just a user - you're an investor in Harku's future.

[Same questions but with different framing]

Your benefits as a Product Partner:
👑 "PRO Advisor" badge (exclusive)
🎁 120 bonus minutes (already added)
🚀 Early access to ALL new features
📞 Monthly 15-min call with me (optional)
🎯 Your requested feature gets priority

[Personalized PS based on actual data]
```

## 七、监控与优化

### 7.1 关键指标

```typescript
// 监控仪表板
async function getEmailMetrics() {
  return {
    // 发送统计
    totalSent: await getEmailsSent(),
    byTimezone: await getEmailsByTimezone(),
    
    // 效果指标
    openRate: await calculateOpenRate(),
    replyRate: await calculateReplyRate(),
    conversionRate: await calculateConversionRate(),
    
    // 奖励统计
    minutesGranted: await getTotalMinutesGranted(),
    redemptionRate: await getRedemptionRate(),
    
    // 用户反馈
    feedbackReceived: await getFeedbackCount(),
    featuresImplemented: await getImplementedFeatures()
  };
}
```

### 7.2 A/B测试计划

- 测试不同发送时间（9AM vs 10AM）
- 测试不同奖励额度（60 vs 90分钟）
- 测试不同邮件标题
- 测试不同P.S.内容

## 八、实施计划

### Phase 1: 基础功能（Week 1）
- [ ] 创建数据库表
- [ ] 实现分钟赠送服务
- [ ] 创建基础邮件模板（英文）
- [ ] 实现Day 7邮件发送
- [ ] 设置基础Cron Job

### Phase 2: 优化功能（Week 2）
- [ ] 添加时区支持
- [ ] 实现用户分群
- [ ] 添加付费用户特殊处理
- [ ] 实现个性化P.S.
- [ ] 添加监控仪表板

### Phase 3: 扩展功能（Week 3-4）
- [ ] 添加更多邮件类型
- [ ] 实现反馈追踪系统
- [ ] 添加A/B测试
- [ ] 优化发送时间算法
- [ ] 添加更多语言支持

## 九、风险控制

1. **防止邮件进垃圾箱**
   - 使用专业邮件服务（SendGrid/Resend）
   - 控制发送频率
   - 提供明确的退订链接

2. **防止分钟数滥用**
   - 唯一索引防重复
   - 设置有效期
   - 记录所有交易

3. **保护用户隐私**
   - 遵守GDPR/CCPA
   - 提供数据删除选项
   - 加密敏感信息

## 十、成本估算

| 项目 | 成本 | 说明 |
|------|-----|------|
| 分钟赠送 | ~$500/月 | 假设1000用户×90分钟 |
| 邮件服务 | $50/月 | SendGrid/Resend |
| Cron Job | $0 | Vercel免费额度 |
| 开发时间 | 2周 | 1人全职 |

**ROI预期**：
- 留存率提升10% = 增加$2000/月收入
- 付费转化提升5% = 增加$1500/月收入
- 投资回报率 = 600%

## 十一、注意事项

1. **真实性第一**：所有个性化内容必须基于真实数据
2. **尊重用户**：提供退订选项，控制发送频率
3. **持续优化**：根据数据不断调整策略
4. **快速响应**：用户反馈48小时内回复
5. **透明沟通**：告诉用户他们的建议被采纳

---

**最终目标**：让用户感受到他们是产品的共同创造者，而不仅仅是使用者。通过真诚的沟通和实际的奖励，建立长期的信任关系。