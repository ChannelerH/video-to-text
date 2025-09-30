# Vercel FFmpeg 配置指南 ✅

## 问题
Vercel 的 serverless 函数默认不包含 ffmpeg，会出现以下错误：
```
spawn ffmpeg ENOENT
Could not find ffmpeg executable
```

## ✅ 已实施的解决方案

### 1. 安装必要的包
```bash
pnpm add ffmpeg-static @ffmpeg-installer/ffmpeg fluent-ffmpeg
pnpm add -D @types/fluent-ffmpeg
```

### 2. 优化 `getFfmpegPath()` 函数
- ✅ 自动尝试多个 ffmpeg 路径
- ✅ 自动设置可执行权限（chmod 755）
- ✅ 支持环境变量 `FFMPEG_PATH` 覆盖
- ✅ 详细的日志输出，方便调试

### 3. Next.js Webpack 配置
在 `next.config.mjs` 中确保 ffmpeg 二进制文件被正确打包到 serverless 函数中。

### 4. Vercel 函数配置
在 `vercel.json` 中增加了内存限制，确保有足够资源运行 ffmpeg。

## 部署到 Vercel

### 方法 A：自动检测（推荐）
直接部署，代码会自动检测并使用正确的 ffmpeg 路径。

### 方法 B：手动指定（可选）
如果自动检测失败，在 Vercel 项目设置中添加环境变量：
```
FFMPEG_PATH=/var/task/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
```

## 测试

部署后查看 Vercel 日志，会看到详细的路径解析过程：
```
[ffmpeg-path] @ffmpeg-installer/ffmpeg path: /var/task/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
[ffmpeg-path] Using @ffmpeg-installer: /var/task/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
[ffmpeg] Binary: /var/task/node_modules/@ffmpeg-installer/linux-x64/ffmpeg
```

## 如果仍然失败

如果部署后仍然报错，尝试以下方法：

### 1. 检查日志
查看 Vercel 函数日志，确认 ffmpeg 路径是否正确。

### 2. 增加内存
在 `vercel.json` 中调整函数内存：
```json
{
  "functions": {
    "app/api/**/*": {
      "maxDuration": 60,
      "memory": 3008
    }
  }
}
```

### 3. 使用 Vercel CLI 本地测试
```bash
vercel dev
```

### 4. 联系支持
如果以上方法都不行，可能需要：
- 升级到 Vercel Pro（支持更多资源）
- 使用其他平台（Railway、Fly.io、AWS Lambda）
- 使用外部 API 处理音频（如 Cloudflare Workers）