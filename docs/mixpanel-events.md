# Mixpanel 事件记录

以下汇总当前代码中已埋的 Mixpanel 行为事件，方便分析与后续维护。

## 全局设置
- `MixpanelProvider` 在 App Router 下全局加载 SDK，并在路由变化时上报 `Page View`（`page` 属性包含当前路径）。
- `AppContextProvider` 在获取用户信息后调用 `identify`，同时注册 `plan`、`tier`、`locale` 等超属性，方便所有事件带上统一上下文。
- 浏览器端埋点入口：`src/lib/mixpanel-browser.ts`。
- 服务端埋点入口：`src/lib/mixpanel-server.ts`。

## 事件清单

| 事件名 | 触发位置 | 何时触发 | 关键属性 |
| --- | --- | --- | --- |
| `Page View` | `MixpanelProvider` | 每次路由变化 | `page` |
| `site.navigation_click` | `src/components/blocks/header/index.tsx` | 顶部导航及菜单链接点击（桌面/移动） | `label`, `href`, `target`, `origin`, `parent` |
| `site.hero_cta_click` | `src/components/blocks/hero/index.tsx` | Hero 区 CTA/公告点击 | `label`, `href`, `variant`, `position`, `target` |
| `auth.sign_modal_open` | `src/components/sign/sign_in.tsx` | 顶部 Sign in 按钮弹出登录框 | `source` |
| `auth.provider_sign_in` | `src/components/sign/form.tsx` | 登录弹窗中选择社交登录 | `provider`, `source` |
| `auth.sign_out` | `src/components/dashboard/sidebar.tsx` | 仪表盘退出账号 | `source`, `locale` |
| `landing.cta_click` | `src/components/landing/audio-upload-widget.tsx`, `src/components/landing/audio-upload-widget-enhanced.tsx` | 点击上传区 CTA（文件 / 粘贴 URL） | `source`, `action`, `auth`, `plan` |
| `transcription.upload_start` | 同上 | 选择文件后开始上传 | `method`, `file_name`, `file_size`, `auth`, `plan` |
| `transcription.job_started` | 同上 | 提交转写任务成功（文件/URL） | `method`, `file_name?`, `file_size?`, `auth`, `plan` |
| `transcription.job_failed` | 同上 | 上传或任务提交失败 | 与 job_started 相同 + `error` |
| `transcription.tool_file_selected` | `src/components/tool-interface.tsx`, `src/components/landing/audio-upload-widget-enhanced.tsx` | 任一工具内选择文件 | `source`, `file_name`, `file_size`, `file_type`, `authenticated`, `locale` |
| `transcription.tool_upload_succeeded` | 同上 | 预签名/分片上传完成 | `source`, `method`, `file_*`, `duration_seconds?`, `authenticated`, `locale` |
| `transcription.tool_upload_failed` | 同上 | 上传失败（含回退） | 同上 + `error` |
| `transcription.tool_submit` | 同上 | 发起转写/预览请求（含匿名 Turnstile） | `source`, `input_type`, `action`, `authenticated`, `formats`, `high_accuracy`, `diarization`, `file_*`, `locale` |
| `transcription.tool_result_ready` | 同上 | 完成全量转写 | `source`, `result_type`, `job_id`, `input_type`, `language`, `duration_seconds`, `authenticated`, `locale` |
| `transcription.tool_preview_ready` | 同上 | 生成匿名预览 | `source`, `result_type`, `input_type`, `language`, `authenticated`, `locale`, `auth_required?` |
| `transcription.tool_result_error` | 同上 | 转写过程中任何失败 | `source`, `input_type`, `error`, `stage?`, `authenticated`, `locale` |
| `transcription.tool_download` | 同上 | 下载导出文件/预览 | `source`, `format`, `job_id?`, `method`, `authenticated`, `locale` |
| `transcription.tool_copy` | 同上 | 复制文本/章节/摘要等 | `source`, `context`, `text_length`, `authenticated`, `locale`, `with_chapters?` |
| `transcription.tool_view_history` | `src/components/tool-interface.tsx` | 成功提示中跳转历史列表 | `source`, `href`, `authenticated`, `locale` |
| `transcription.tool_open_editor` | `src/components/landing/audio-upload-widget-enhanced.tsx` | 从增强组件打开仪表盘编辑器 | `source`, `job_id`, `locale` |
| `subscription.upgrade_click` | `src/components/dashboard/sidebar.tsx` | 侧边栏“Upgrade Plan”点击 | `source`, `current_plan`, `tier` |
| `subscription.downgrade_attempt` | `src/components/dashboard/cancel-subscription-modal.tsx` | 在取消弹窗选择某个降级方案时 | `target_plan`, `current_plan`, `locale` |
| `subscription.downgrade_scheduled` | 同上 | 降级被安排到周期末 | 同上 + `effective_at` |
| `subscription.downgrade_immediate` | 同上 | 立即降级成功 | `target_plan`, `current_plan`, `locale` |
| `subscription.cancel_request` | 同上 | 在确认页点击“Cancel Subscription”时 | `current_plan`, `immediate`, `refund_requested`, `reason`, `locale` |
| `subscription.cancel_success` | 同上 | 取消 API 成功返回 | 同上 |
| `subscription.cancel_failed` | 同上 | 取消 API 失败 | 同上 |
| `subscription.purchase_success` | `src/app/api/pay/callback/stripe/route.ts` | Stripe Checkout 成功回调后 | `distinct_id`, `plan`, `order_no`, `locale`, `amount`, `currency` |

## 备注
- 所有事件会自动包含 Mixpanel 注册的超属性（例如 `plan`、`tier`、`locale`）。
- 新增的 `transcription.tool_*` 系列事件都会带上 `source` 字段区分入口（`tool_interface` 或 `audio_widget_enhanced`），便于还原完整用户旅程。
- 服务端事件需要在环境变量中设置 `MIXPANEL_PROJECT_TOKEN`（或复用 `NEXT_PUBLIC_MIXPANEL_TOKEN`）。
- 若要新增事件，建议先在此表补充，再在代码中添加对应 `trackMixpanelEvent`/`trackMixpanelServerEvent` 调用。
