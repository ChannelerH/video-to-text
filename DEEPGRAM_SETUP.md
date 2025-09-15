# Deepgram Webhook 签名验证配置

## 为什么需要签名验证？

签名验证确保回调请求确实来自Deepgram，防止：
- 恶意伪造的回调请求
- 中间人攻击
- 数据篡改

## 配置步骤

### 1. 生成Webhook Secret

创建一个安全的随机密钥（至少32字符）：

```bash
# Linux/Mac
openssl rand -hex 32

# 或使用Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. 配置环境变量

在 `.env.local` 中添加：

```env
# Deepgram API配置
DEEPGRAM_API_KEY=your_deepgram_api_key

# Webhook签名验证（强烈推荐）
DEEPGRAM_WEBHOOK_SECRET=your_generated_secret_here

# 严格模式：要求必须有签名（可选）
DEEPGRAM_REQUIRE_SIGNATURE=true

# 异步供应商配置
SUPPLIER_ASYNC=deepgram  # 或 "both" 同时使用deepgram和replicate
```

### 3. 签名验证工作原理

1. 请求时：在 query 里传 `callback`（不要传 `callback_secret`、`callback_method`）。JSON body 只需包含 `{ url: ... }`。
2. 安全做法：我们把基于 `DEEPGRAM_WEBHOOK_SECRET` 和 `job_id` 计算的 HMAC (`cb_sig=HMAC_SHA256(job_id)`) 放到回调 URL 自身作为查询参数，Deepgram会原样回传。
3. 回调时：优先校验 Deepgram 官方签名头（`X-Deepgram-Signature` 等变体）；若缺失或代理剥离，则校验我们埋在 URL 的 `cb_sig`。

### 4. 验证模式

#### 宽松模式（默认）
```env
# 不设置 DEEPGRAM_REQUIRE_SIGNATURE
# 或设置为 false
DEEPGRAM_REQUIRE_SIGNATURE=false
```
- 如果有签名，验证它
- 如果没有签名，仍然接受请求（向后兼容）

#### 严格模式（推荐生产环境）
```env
DEEPGRAM_REQUIRE_SIGNATURE=true
```
- 必须有签名
- 签名必须正确
- 否则拒绝请求

## 故障排查

### 查看日志

回调处理会输出详细日志：

```
[Deepgram Callback] All headers: {...}
[Deepgram Callback] Signature verified successfully
```

### 常见问题

1. 401 Unauthorized
   - 若你传了 `callback_secret` 到 Deepgram，请移除；该参数会导致 400 Invalid query string
   - 检查 `DEEPGRAM_WEBHOOK_SECRET` 是否正确
   - 确认 Deepgram 回调是否带官方签名头；或确保 URL 中的 `cb_sig` 与 `job_id` 匹配

2. Missing signature
   - 官方签名头可能被代理去除；我们已支持用 `cb_sig` 兜底校验
   - 确认 `.env` 设置了 `DEEPGRAM_WEBHOOK_SECRET`

3. **Signature mismatch**
   - 确保环境变量中的secret与请求时使用的完全一致
   - 检查是否有多余的空格或换行符

## 安全建议

1. **生产环境必须启用签名验证**
2. **定期轮换webhook secret**
3. **不要在代码中硬编码secret**
4. **使用HTTPS确保传输安全**
5. **监控异常的401错误**

## 测试验证

1. 发送测试请求：
```bash
curl -X POST http://localhost:3000/api/transcribe/async \
  -H "Content-Type: application/json" \
  -d '{
    "type": "audio_url",
    "content": "https://example.com/audio.mp3"
  }'
```

2. 查看日志确认签名验证成功

3. 故意使用错误的secret测试拒绝机制
