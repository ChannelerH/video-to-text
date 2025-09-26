# Gmail Email Setup Guide

## 快速开始 - 使用Gmail发送邮件

### 1. 获取Gmail应用密码

1. 登录你的Gmail账户 (channelerH@gmail.com)
2. 访问 Google 账户设置: https://myaccount.google.com/
3. 选择"安全性" → "2步验证"（必须先开启2步验证）
4. 在2步验证页面底部，点击"应用专用密码"
5. 选择应用类型为"邮件"，设备选择"其他"
6. 输入名称如"Video2Text Email"
7. 点击生成，复制16位密码

### 2. 配置环境变量

在 `.env.local` 文件中添加：

```env
# 使用你的Gmail账户
GMAIL_USER=channelerH@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  # 你的16位应用密码

# 如果你已经有ERROR_ALERT_APP_PASSWORD，可以直接用它
# ERROR_ALERT_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Cron和管理员密钥
CRON_SECRET=生成一个随机字符串
ADMIN_API_KEY=生成一个管理员密钥
```

### 3. 测试邮件发送

启动开发服务器：
```bash
npm run dev
```

测试发送邮件：
```bash
# 发送测试邮件
curl -X POST http://localhost:3000/api/admin/send-test-email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "your-email@example.com",
    "templateType": "day3_activation",
    "testData": {
      "userName": "Test User",
      "bonusMinutes": 20
    }
  }'
```

### 4. 手动触发邮件campaign

```bash
# 触发所有邮件campaigns
curl -X POST http://localhost:3000/api/cron/hourly-emails

# 只触发特定campaign
curl -X POST http://localhost:3000/api/cron/hourly-emails \
  -H "Content-Type: application/json" \
  -d '{"campaign": "day3_activation"}'
```

### 5. 查看邮件系统状态

```bash
curl http://localhost:3000/api/admin/email-status
```

## Gmail发送限制

- 每天最多发送 500 封邮件（针对 @gmail.com 账户）
- 每天最多 500 个收件人
- 建议发送速率：每秒不超过 1 封邮件

## 后续升级到专业邮件服务

当用户量增长后，建议升级到专业邮件服务：

1. **Resend** (推荐)
   - 注册账号: https://resend.com
   - 获取API密钥
   - 更新环境变量：
   ```env
   RESEND_API_KEY=re_your_api_key
   EMAIL_FROM="Video2Text <noreply@your-domain.com>"
   EMAIL_REPLY_TO=support@your-domain.com
   # 注释掉Gmail配置
   # GMAIL_USER=...
   # GMAIL_APP_PASSWORD=...
   ```

2. 系统会自动检测并切换到Resend

## 常见问题

### Q: 邮件发送失败
- 检查应用密码是否正确（注意不要包含空格）
- 确认Gmail账户已开启2步验证
- 查看控制台日志了解具体错误

### Q: 如何更改发件人名称
- 使用Gmail时，发件人会显示为"Video2Text <channelerH@gmail.com>"
- 切换到Resend后可以自定义发件人域名

### Q: 如何避免邮件进垃圾箱
- 确保邮件内容质量高，避免垃圾词汇
- 建议收件人将发件地址加入联系人
- 后续使用专业服务并配置SPF/DKIM/DMARC

## 监控和维护

每日检查：
- 查看邮件发送状态
- 检查失败的奖励重试

每周任务：
- 分析邮件打开率
- 调整发送时间和内容

## 支持

遇到问题时：
1. 查看 Vercel Functions 日志
2. 检查数据库中的 v2tx_email_rewards 和 v2tx_email_history 表
3. 使用测试端点进行调试