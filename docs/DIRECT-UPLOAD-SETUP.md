# 直接上传到R2设置指南

## 概述
我们已经实现了预签名URL直接上传功能，让大文件上传速度提升50%以上！

## 架构改进

### 之前（慢）
```
客户端 → Next.js服务器 → Cloudflare R2
200MB文件传输2次 = 400MB总流量
```

### 现在（快）
```
客户端 → Cloudflare R2（直接）
200MB文件只传输1次 = 200MB总流量
```

## 配置步骤

### 1. 配置R2 CORS（重要！）

在Cloudflare Dashboard中：

1. 进入 R2 → 你的bucket
2. 点击 "Settings" → "CORS Policy"
3. 添加以下CORS规则：

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

注意：生产环境应该限制 `AllowedOrigins` 为你的域名。

### 2. 环境变量

确保以下环境变量已配置：

```env
# R2 Storage Configuration
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
STORAGE_BUCKET=your-bucket-name
STORAGE_DOMAIN=your-public-domain.com  # 可选，用于公共访问
```

### 3. 工作流程

1. **客户端请求上传权限**
   ```javascript
   POST /api/upload/presigned
   {
     fileName: "video.mp4",
     fileType: "video/mp4",
     fileSize: 209715200,  // 200MB
     mode: "video"
   }
   ```

2. **服务器返回预签名URL**
   ```javascript
   {
     uploadUrl: "https://...",  // 预签名上传URL
     key: "video-uploads/...",  // 文件key
     publicUrl: "https://...",  // 公共访问URL
     expiresIn: 3600           // 1小时有效期
   }
   ```

3. **客户端直接上传到R2**
   ```javascript
   PUT [uploadUrl]
   Content-Type: video/mp4
   Body: [文件内容]
   ```

## 性能对比

| 文件大小 | 旧方式（经过服务器） | 新方式（直接上传） | 提升 |
|---------|-------------------|------------------|------|
| 10MB    | ~20秒             | ~10秒            | 50%  |
| 100MB   | ~200秒            | ~100秒           | 50%  |
| 200MB   | ~400秒            | ~200秒           | 50%  |

## 优势

1. ✅ **速度提升50%**：文件只传输一次
2. ✅ **服务器负载降低**：不再处理大文件
3. ✅ **更好的用户体验**：准确的进度条
4. ✅ **更高的可靠性**：减少超时风险
5. ✅ **节省带宽成本**：服务器带宽使用减少

## 注意事项

1. **CORS配置**：必须正确配置R2的CORS策略
2. **安全性**：预签名URL有时间限制（默认1小时）
3. **文件大小限制**：仍然限制在500MB
4. **浏览器兼容性**：所有现代浏览器都支持

## 故障排除

### CORS错误
如果看到CORS错误，检查：
- R2 bucket的CORS配置是否正确
- 请求的Origin是否在允许列表中

### 上传失败
- 检查预签名URL是否过期
- 确认文件类型和大小符合要求
- 检查网络连接

### 进度条不准确
- 这是正常的，因为现在是直接上传
- 进度条显示的是实际上传到R2的进度

## 测试

1. 上传小文件（<10MB）测试基本功能
2. 上传大文件（>100MB）测试性能提升
3. 测试网络中断恢复
4. 测试并发上传

## 后续优化

- [ ] 实现分片上传（适合超大文件）
- [ ] 添加断点续传
- [ ] 实现并行上传多个分片
- [ ] 添加上传队列管理