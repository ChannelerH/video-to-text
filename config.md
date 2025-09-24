下面是按功能分组的 .env 配置清单，标注了「必需/可选」及用途，给你一份能跑起来的最小集和进阶项。

核心必需

DATABASE_URL: Postgres 连接串（必需）。例如：postgres://user:pass@host:5432/db
NEXT_PUBLIC_WEB_URL: 站点基础地址（前端/回调用）。例如：https://v2tx.example.com
REPLICATE_API_TOKEN: Replicate 的 API Key（转写 Whisper；强烈建议配置）
STORAGE_ENDPOINT / STORAGE_REGION / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET: R2/S3 兼容存储（上传/YouTube 语言探针必需）
STORAGE_DOMAIN: 存储公共域名（可选，没配则走 r2.dev 公域）
DEEPGRAM_API_KEY: Deepgram Key（可选；有则启用 Deepgram 优先策略与语言探针；无则仅 Whisper）
示例最小配置

若你只想本地跑通：请至少设置 DATABASE_URL、NEXT_PUBLIC_WEB_URL、REPLICATE_API_TOKEN、STORAGE_*；有 Deepgram 则再加 DEEPGRAM_API_KEY。
转写/功能调优

PREVIEW_ALLOW_ANON: 是否允许未登录预览（可选，默认行为见代码）
SKIP_YOUTUBE_CAPTIONS: 'true' 则跳过 YouTube 字幕直接音频转写（可选）
YOUTUBE_SPEED_MODE: 'true' 开更激进下载参数（可选）
YOUTUBE_CDN_PROXY: YouTube 下载的 CDN 代理（可选）
队列（可选，默认关闭）

Q_ENABLED: 'true' 开启简单 FIFO 队列
Q_CAP_TOTAL: 全局并发上限（默认 4）
Q_CAP_PRO / Q_CAP_BASIC / Q_CAP_FREE: 分层容量（仅在 lib/priority-queue.ts 场景用）
Q_SLOT_SEC: 单槽估时（默认 60）
Q_TIMEOUT_MS: 等待超时（默认 120000）
配额/超量计费（可选）

OVERAGE_ENABLED: 'true' 开启超量分钟记录
OVERAGE_CENTS_PER_MINUTE: 超量每分钟美分，默认 5
OVERAGE_STRIPE_ENABLED: 'true' 则为超量生成 Stripe 发票项
STRIPE_SECRET_KEY: 仅用于超量开票的开关判定（见 src/services/overage.ts）
注意：Stripe 客户端实际读取的是 STRIPE_PRIVATE_KEY（src/integrations/stripe），因此生产使用 Stripe 时应同时配置 STRIPE_PRIVATE_KEY；否则会报 “STRIPE_PRIVATE_KEY is not set”。
支付（Stripe/Creem，二选一或都配）

PAY_PROVIDER: 'stripe' | 'creem'（默认 stripe）
Stripe:
STRIPE_PRIVATE_KEY: 服务端私钥（强制要求于集成层）
STRIPE_WEBHOOK_SECRET: Webhook 校验
STRIPE_INTRO_COUPON_ID: 新人券 ID（可选）
Creem:
CREEM_API_KEY / CREEM_ENV('test'|'production') / CREEM_WEBHOOK_SECRET / CREEM_PRODUCTS（可选）
鉴权/登录（可选）

NEXT_PUBLIC_AUTH_ENABLED: 'true' 开启登录 UI（任一 provider 开也会启用）
Google OAuth:
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED='true'
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
GitHub OAuth:
NEXT_PUBLIC_AUTH_GITHUB_ENABLED='true'
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
Google One Tap:
NEXT_PUBLIC_AUTH_GOOGLE_ONE_TAP_ENABLED='true'
NEXT_PUBLIC_AUTH_GOOGLE_ID
AI/文本增强（可选）

PUNCTUATE_LLM_ENABLED='true'：启用中文标点/分句 LLM 修正
PUNCTUATE_LLM_KEY / PUNCTUATE_LLM_BASE / PUNCTUATE_LLM_MODEL / PUNCTUATE_LLM_CHUNK_SIZE / PUNCTUATE_LLM_CONCURRENCY / PUNCTUATE_LLM_BATCH_DELAY_MS
DEEPSEEK_API_KEY / DEEPSEEK_API_BASE / DEEPSEEK_MODEL（章节生成、标点可复用）
OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL（备用/演示）
OPENROUTER_API_KEY / SILICONFLOW_API_KEY / SILICONFLOW_BASE_URL（演示 API）
管理/运营（可选）

ADMIN_SECRET: 管理接口密钥（如 /api/admin/**）
ADMIN_EMAILS: 逗号分隔的管理员邮箱
前端显示/分析（可选）

NEXT_PUBLIC_PROJECT_NAME / NEXT_PUBLIC_DEFAULT_THEME / NEXT_PUBLIC_LOCALE_DETECTION
NEXT_PUBLIC_GOOGLE_ADCODE / NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
NEXT_PUBLIC_PLAUSIBLE_DOMAIN / NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL
NEXT_PUBLIC_OPENPANEL_CLIENT_ID
NEXT_PUBLIC_PAY_SUCCESS_URL / NEXT_PUBLIC_PAY_CANCEL_URL / NEXT_PUBLIC_PAY_FAIL_URL
NEXT_PUBLIC_MIXPANEL_TOKEN（启用 Mixpanel 行为分析必填）
MIXPANEL_PROJECT_TOKEN（可选：单独的服务端 token，便于后端事件上报）
调试/工具（可选）

DEBUG_TRANSCRIPTION / DEBUG_DEEPGRAM_RAW / DEBUG_DEEPGRAM_RAW_FILE: 转写调试开关
FFMPEG_PATH: 指定 ffmpeg 可执行路径（如本地剪裁/处理时用）
NODE_ENV: production/development
Cloudflare R2（再次强调）

必配：STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_BUCKET
可选：STORAGE_REGION（默认 auto）、STORAGE_DOMAIN（有自定义域名更好）
YouTube 语言探针和上传能力依赖该存储配置
