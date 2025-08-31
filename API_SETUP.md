# API 设置说明

## 🚀 快速开始

### 1. 获取 Replicate API Token

1. 访问 [Replicate.com](https://replicate.com/)
2. 注册并登录账户
3. 前往 [API Tokens 页面](https://replicate.com/account/api-tokens)
4. 点击 "Create Token" 创建新的 API Token
5. 复制生成的 Token

### 2. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# Replicate API Configuration
REPLICATE_API_TOKEN=r8_your_actual_token_here

# Next.js Configuration  
NEXT_PUBLIC_WEB_URL=http://localhost:3000
```

### 3. 使用的 Replicate 模型

**模型ID**: `openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e`

**模型详情**:
- **名称**: OpenAI Whisper (by Replicate)
- **版本**: Large-v3 (最新版本)
- **支持语言**: 100+ 种语言
- **输入格式**: 音频文件 (MP3, WAV, M4A 等)
- **输出格式**: JSON (包含文本、时间戳、置信度等)

**定价**: 
- 约 $0.0045/分钟
- 按实际音频时长计费
- 免费额度: $10 (新用户)

## 🧪 测试功能

### YouTube URL 测试
```
示例URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

### 文件上传测试
支持格式：
- **视频**: MP4, MOV, WebM, AVI
- **音频**: MP3, M4A, WAV, OGG, FLAC
- **最大大小**: 500MB

## 📁 API 端点

### 1. 转录 API
```
POST /api/transcribe
```

**请求体** (YouTube):
```json
{
  "type": "youtube_url",
  "content": "https://www.youtube.com/watch?v=VIDEO_ID",
  "action": "preview", // 或 "transcribe"
  "options": {
    "formats": ["txt", "srt", "vtt"],
    "language": "auto"
  }
}
```

**请求体** (文件):
```json
{
  "type": "file_upload", 
  "content": "/path/to/uploaded/file",
  "action": "transcribe",
  "options": {
    "formats": ["txt", "srt"]
  }
}
```

### 2. 上传 API
```
POST /api/upload
```

**请求**: FormData
- `file`: 文件对象
- `mode`: "video" 或 "audio"

### 3. 下载 API
```
GET /api/download?type=youtube&id=VIDEO_ID&format=srt
```

## 🎯 处理逻辑

### YouTube 处理流程:
1. ✅ 验证 YouTube URL
2. ✅ 检查缓存 (90天保留)
3. ✅ **优先**: 提取现有字幕 (免费、1-2秒)
4. ✅ **备选**: AI转录音频 (付费、2-5分钟)
5. ✅ 生成多种格式 (TXT/SRT/VTT/JSON/MD)
6. ✅ 智能缓存结果

### 文件处理流程:
1. ✅ 验证文件类型/大小
2. ✅ 安全存储到服务器
3. ✅ AI转录处理
4. ✅ 按用户等级缓存

## 💰 成本优化

### 缓存策略:
- **YouTube内容**: 全局缓存，90天保留
- **用户文件**: 私有缓存，按用户等级保留
- **预期节省**: 30-50% 成本

### 用户等级缓存:
- **免费用户**: 不缓存 (0天)
- **日通用户**: 7天缓存
- **月付用户**: 30天缓存
- **年付用户**: 90天缓存

## 🔧 故障排除

### 常见问题:

1. **"Invalid YouTube URL"**
   - 检查URL格式是否正确
   - 确保视频是公开的，非年龄限制

2. **"Transcription failed"**
   - 检查 Replicate API Token 是否正确
   - 确保账户有足够余额
   - 检查网络连接

3. **"File too large"**
   - 当前限制 500MB
   - 可以在 `/api/upload/route.ts` 中调整 `MAX_FILE_SIZE`

4. **"Unsupported file type"**
   - 检查文件格式是否在支持列表中
   - 确保文件未损坏

## 📊 监控和统计

访问缓存统计：
```
GET /api/transcribe?action=stats
```

检查缓存状态：
```  
GET /api/transcribe?action=check&type=youtube&identifier=VIDEO_ID
```

## 🛡️ 安全考虑

- ✅ 文件类型验证
- ✅ 文件大小限制  
- ✅ 安全文件名生成
- ✅ 自动文件清理 (24小时)
- ✅ 用户数据隔离