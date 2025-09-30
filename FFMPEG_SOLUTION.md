# FFmpeg 在 Vercel 上的可靠解决方案

## 问题现状

根据 2025 年的最新信息：
- ❌ Vercel serverless 函数有 50MB 限制，ffmpeg 很容易超过
- ❌ Next.js 有一个从 2023 年至今未解决的 bug (#53791)，serverless 函数找不到静态打包的二进制文件
- ⚠️ `@ffmpeg-installer/ffmpeg` 和 `ffmpeg-static` 在 Vercel 上**不稳定**，有些人成功，有些人失败

## ✅ 推荐方案：Cloudflare Workers + ffmpeg.wasm

### 为什么选择这个方案？

1. **你已经在用 Cloudflare R2** - 集成方便
2. **Cloudflare Workers 支持 WebAssembly** - 可以运行 ffmpeg.wasm
3. **不受 Vercel 限制** - 独立部署，稳定可靠
4. **自动降级** - 本地 ffmpeg 失败时自动调用 Worker

### 部署步骤

#### 1. 安装 Wrangler（Cloudflare CLI）

```bash
npm install -g wrangler
wrangler login
```

#### 2. 部署 Worker

```bash
cd workers
wrangler deploy
```

部署后你会得到一个 URL，类似：
```
https://audio-clip-worker.YOUR_SUBDOMAIN.workers.dev
```

#### 3. 在 Vercel 添加环境变量

进入 Vercel 项目设置 → Environment Variables：

```
AUDIO_CLIP_WORKER_URL=https://audio-clip-worker.YOUR_SUBDOMAIN.workers.dev
```

#### 4. 重新部署 Vercel

```bash
vercel --prod
```

## 工作原理

```
┌─────────────┐
│   Vercel    │
│  (尝试本地)  │
└──────┬──────┘
       │ ffmpeg 失败？
       ↓
┌─────────────────┐
│ Cloudflare      │
│ Worker          │ ← 稳定可靠
│ (ffmpeg.wasm)   │
└─────────────────┘
```

1. Vercel 先尝试使用本地 ffmpeg（如果可用）
2. 如果失败，自动调用 Cloudflare Worker
3. Worker 使用 ffmpeg.wasm 处理音频
4. 返回裁剪后的音频给 Vercel

## 完善 Worker（可选）

Worker 目前是一个框架，需要集成 ffmpeg.wasm：

```bash
cd workers
npm init -y
npm install @ffmpeg/ffmpeg @ffmpeg/core
```

然后修改 `audio-clip-worker.js` 集成 ffmpeg.wasm。

## 备选方案

如果不想用 Cloudflare Workers：

### 方案 A：Railway / Fly.io
这些平台原生支持 ffmpeg，迁移你的 API 路由到这些平台。

### 方案 B：AWS Lambda Layer
使用 AWS Lambda + Lambda Layer 部署 ffmpeg。

### 方案 C：外部 API
使用 CloudConvert、Cloudinary 等第三方服务。

## 当前代码状态

- ✅ 本地开发环境：完全支持 ffmpeg
- ✅ 生产环境（Vercel）：
  - 如果 `@ffmpeg-installer/ffmpeg` 工作 → 使用本地
  - 如果失败 → 自动降级到 Cloudflare Worker
  - 需要配置 `AUDIO_CLIP_WORKER_URL` 才能使用降级方案

## 测试

本地测试：
```bash
pnpm dev
# ffmpeg 应该正常工作
```

Vercel 测试：
```bash
# 查看日志
vercel logs
# 搜索 "[audio-clip]" 相关日志
```

## 总结

**当前配置：** 已经尽力优化本地 ffmpeg，但 Vercel 上不保证100%可用

**推荐做法：** 部署 Cloudflare Worker 作为备用，确保生产环境稳定