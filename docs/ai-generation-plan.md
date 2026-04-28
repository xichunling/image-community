# AI 多 Provider 生图系统实现计划

## Context

当前 AI 创作功能完全是 mock 的——前端用 `setTimeout` + 硬编码模板生成假数据，没有调用任何 AI API，后端也没有 AI 相关路由。需要接入真实的 AI 生图服务（首选火山引擎/豆包），同时构建可扩展的 Provider 框架，支持切换不同服务商（OpenAI DALL-E 等）。前端可选择 provider，后端根据选择调用对应 API 生图。

**核心流程**：两步走——先 LLM 生成分镜脚本，再文生图模型逐页生成漫画图片。

## 架构概览

### 两步生成流程

```
用户输入：梗概 + 风格 + 页数 + 选择 provider
          ↓
Step 1: 调用 LLM 文本模型（豆包 doubao / GPT-4o）
  → 输入：梗概 + 风格 + 页数
  → 输出：结构化 JSON（标题 + 每页的：场景描述 + 对白 + imagePrompt）
          ↓
Step 2: 逐页调用文生图模型（Seedream / DALL-E）
  → 输入：imagePrompt + 对白 + 风格（提示词中包含漫画对白文字）
  → 输出：漫画图片（图文一体）
  → 下载到 public/uploads/
          ↓
返回 { title, description, pages: [{ image_url, description, dialogue }] }
  → Frontend 展示结果 → 用户编辑确认 → 发布
```

### Provider 分离

文字生成和图片生成可以走**不同 provider**：
- 文字 provider：豆包 doubao / OpenAI GPT / 其他 LLM
- 图片 provider：豆包 Seedream / OpenAI DALL-E / 其他生图模型

前端分开选择，后端独立调用。也可以都选同一个 provider（火山引擎一手包办）。

---

## Step 1: 后端 — Provider 框架基础

**新建 `backend/src/ai/types.ts`** — 所有 AI 模块类型定义：

```typescript
// ===== 文字生成（LLM 分镜） =====

interface TextBreakdownRequest {
  synopsis: string      // 用户输入的梗概
  style: string         // 画面风格
  pageCount: number     // 页数
  type: 'comic' | 'drama'
}

interface PageBreakdown {
  pageNumber: number
  description: string    // 场景描述
  dialogue: string       // 对白
  imagePrompt: string    // 给文生图模型用的提示词（包含场景+对白+风格描述）
}

interface TextBreakdownResult {
  success: boolean
  title: string
  description: string
  pages: PageBreakdown[]
  error?: string
}

// ===== 图片生成（文生图） =====

interface ImageGenerationRequest {
  prompt: string        // 来自 PageBreakdown.imagePrompt
  style: string         // 画面风格
  size: string          // 尺寸 '1024x1024' 等
}

interface ImageGenerationResult {
  success: boolean
  imageUrl?: string     // 本地路径 /uploads/xxx.png
  error?: string
}

// ===== Provider 类型分离 =====

interface TextProviderInfo {
  id: string            // 'volcengine-text' | 'openai-text' | 'mock'
  name: string          // '豆包' | 'OpenAI' | 'Mock'
  icon: string          // emoji
  type: 'text'
  models: { id: string; name: string }[]
  enabled: boolean
}

interface ImageProviderInfo {
  id: string            // 'volcengine-image' | 'openai-image' | 'mock'
  name: string          // '豆包 Seedream' | 'DALL-E 3' | 'Mock'
  icon: string
  type: 'image'
  models: { id: string; name: string }[]
  enabled: boolean
}

type ProviderInfo = TextProviderInfo | ImageProviderInfo

// ===== Provider 配置 =====

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string         // 默认模型
}
```

**新建 `backend/src/ai/provider.ts`** — 两类 Provider 接口：

```typescript
// 文字生成 Provider（LLM）
export interface TextProvider {
  readonly id: string
  getInfo(): TextProviderInfo
  generateBreakdown(req: TextBreakdownRequest): Promise<TextBreakdownResult>
}

// 图片生成 Provider（文生图）
export interface ImageProvider {
  readonly id: string
  getInfo(): ImageProviderInfo
  generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult>
}
```

**新建 `backend/src/ai/registry.ts`** — 分类型注册表：
- `registerText(provider)` / `registerImage(provider)`
- `getTextProvider(id)` / `getImageProvider(id)`
- `listTextProviders()` / `listImageProviders()`
- 全局单例 `registry`

**新建 `backend/src/ai/storage.ts`** — 图片下载存储：
- `downloadAndSaveImage(remoteUrl: string): Promise<string>`
- 从远程 URL 下载图片 → 保存到 `backend/public/uploads/ai-{timestamp}-{random}.png`
- 返回可访问路径 `/uploads/xxx.png`
- 已有 `express.static('public')` 自动服务该目录

**新建 `backend/src/ai/prompts.ts`** — 提示词工程：
- `buildTextBreakdownPrompt(req)` — 让 LLM 将梗概拆分为分镜，输出 JSON
- `buildImagePrompt(pageBreakdown, style, type)` — 构建生图提示词，包含场景描述+对白文字+风格

---

## Step 2: 后端 — Provider 实现（文字 + 图片分开）

每个 Provider 文件导出两类实现（如果该服务商同时提供 LLM 和文生图）。

### 2A. Mock Provider

**新建 `backend/src/ai/providers/mock.ts`**：
- `MockTextProvider` — 用现有 `mockTemplates` 逻辑生成文字分镜，无需 API Key
- `MockImageProvider` — 返回占位图片 URL（生成 SVG 或使用固定占位图），无需 API Key
- 两个都始终可用，用于开发测试

### 2B. 火山引擎/豆包 Provider

**新建 `backend/src/ai/providers/volcengine.ts`**：

- 使用 `openai` SDK（火山 Ark API 兼容 OpenAI 格式）
- `VolcengineTextProvider`：
  - 调用豆包文本模型（`doubao-1.5-pro`）`chat.completions` 接口
  - System prompt 要求输出结构化 JSON（标题 + 每页 description/dialogue/imagePrompt）
  - 配置：`VOLCENGINE_API_KEY`, `VOLCENGINE_TEXT_MODEL`
- `VolcengineImageProvider`：
  - 调用 Seedream 图片生成模型（`images.generate` 接口）
  - 提示词包含场景描述 + 对白文字 + 风格 → 生成图文一体的漫画页
  - 生成后调用 `downloadAndSaveImage()` 下载到本地
  - 配置：`VOLCENGINE_API_KEY`, `VOLCENGINE_IMAGE_MODEL`
- 共享 `VOLCENGINE_BASE_URL`

### 2C. OpenAI Provider

**新建 `backend/src/ai/providers/openai.ts`**：

- `OpenAITextProvider`：用 `gpt-4o-mini` 的 `chat.completions` 生成文字分镜
- `OpenAIImageProvider`：用 `dall-e-3` 的 `images.generate` 生成图片，下载到本地
- 配置：`OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL`

### 2D. 模块入口

**新建 `backend/src/ai/index.ts`**：
- 读取环境变量，实例化各 Provider 并注册到 registry
- 仅在有对应 API Key 时启用该 Provider
- Mock Provider 始终注册

---

## Step 3: 后端 — AI 路由

**新建 `backend/src/aiRoutes.ts`**：

| 路由 | 认证 | 说明 |
|------|------|------|
| `GET /api/ai/providers` | optionalAuth | 列出可用 Provider（分 text/image 两类） |
| `POST /api/ai/generate` | requireAuth | 完整生成：先 LLM 分镜 → 再逐页生图 |
| `POST /api/ai/generate-page` | requireAuth | 单页重新生图（用户对某页不满意） |

**`GET /api/ai/providers` 响应：**
```typescript
{
  textProviders: TextProviderInfo[]
  imageProviders: ImageProviderInfo[]
}
```

**`POST /api/ai/generate` 请求体：**
```typescript
{
  synopsis: string           // 故事梗概
  style: string              // 'cyberpunk' | 'watercolor' | 'pixel' | 'ink' | 'comic' | 'anime'
  type: 'comic' | 'drama'
  pageCount: number          // 2-12
  textProvider: string       // 'volcengine-text' | 'openai-text' | 'mock'
  imageProvider: string      // 'volcengine-image' | 'openai-image' | 'mock'
  textModel?: string         // 可选指定文字模型
  imageModel?: string        // 可选指定图片模型
}
```

**响应：**
```typescript
{
  title: string
  description: string
  pages: Array<{
    pageNumber: number
    description: string
    dialogue: string
    image_url: string       // 本地路径 /uploads/xxx.png
    ai_generated: true
  }>
}
```

**`POST /api/ai/generate-page` 请求体：**
```typescript
{
  provider: string
  style: string
  type: 'comic' | 'drama'
  imagePrompt: string
  dialogue: string
}
```

**修改 `backend/src/index.ts`：**
- 引入 `dotenv`（在最早位置 `import 'dotenv/config'`）
- 引入并挂载 AI 路由：`app.use('/api/ai', aiRoutes)`

---

## Step 4: 后端 — 依赖和配置

**修改 `backend/package.json`：**
```bash
cd backend && npm install openai dotenv
```

**新建 `backend/.env.example`：**
```env
# 火山引擎 / 豆包
VOLCENGINE_API_KEY=
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_IMAGE_MODEL=seedream-5.0-lite
VOLCENGINE_TEXT_MODEL=doubao-1.5-pro-32k

# OpenAI
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_MODEL=dall-e-3
OPENAI_TEXT_MODEL=gpt-4o-mini

# 通用
DEFAULT_AI_PROVIDER=mock
```

**新建 `backend/.env`** — 实际配置（已 gitignore）
**更新 `backend/.gitignore`** — 添加 `.env`

---

## Step 5: 前端 — 类型和 API

**修改 `client/src/types.ts`：**
- 新增 `ProviderInfo`、`AIGenerateRequest`、`AIGenerateResult` 类型
- `PageInput` 增加 `image_url?: string` 字段

**修改 `client/src/api/index.ts`：**
- 新增 `aiApi` 对象：
  - `getProviders()` → `GET /ai/providers`
  - `generate(data)` → `POST /ai/generate`
  - `generatePage(data)` → `POST /ai/generate-page`

---

## Step 6: 前端 — Create 页面改造

**修改 `client/src/pages/Create.tsx`：**

AI 模式新增：
- **文字 Provider 选择器**：展示可用的文字生成 Provider（LLM）
- **图片 Provider 选择器**：展示可用的图片生成 Provider
- 可以都选同一个服务商（如都选豆包），也可以混合搭配
- **模型选择**：每个 provider 下可选具体模型
- **状态**：新增 `textProvider`, `imageProvider`, `textModel`, `imageModel`, `providers` state
- **替换 `submitAI`**：从 setTimeout mock → 调用 `aiApi.generate()`，传入两个 provider
- **进度展示**：显示两阶段状态："正在生成分镜脚本..." → "正在生成第 N 页图片..."
- **结果展示**：显示生成的图片 + 文字，支持编辑
- **单页重新生成**：每页可单独重新生图

**修改 `client/src/components/PagesEditor.tsx`：**
- 当 `page.image_url` 存在时，在描述上方显示 `<img>`
- AI 审阅模式下每页显示"重新生成"按钮

**修改 `client/src/pages/WorkDetail.tsx`：**
- 分镜展示区：有 `image_url` 时显示图片，无图片时保持现有文字渐变背景

---

## 文件变更汇总

| 操作 | 文件 |
|------|------|
| 新建 | `backend/src/ai/types.ts` — 类型定义（TextProvider / ImageProvider 分离） |
| 新建 | `backend/src/ai/provider.ts` — TextProvider + ImageProvider 接口 |
| 新建 | `backend/src/ai/registry.ts` — 分类型注册表 |
| 新建 | `backend/src/ai/storage.ts` — 图片下载存储 |
| 新建 | `backend/src/ai/prompts.ts` — 提示词工程 |
| 新建 | `backend/src/ai/index.ts` — 模块入口 |
| 新建 | `backend/src/ai/providers/mock.ts` — MockTextProvider + MockImageProvider |
| 新建 | `backend/src/ai/providers/volcengine.ts` — VolcengineTextProvider + VolcengineImageProvider |
| 新建 | `backend/src/ai/providers/openai.ts` — OpenAITextProvider + OpenAIImageProvider |
| 新建 | `backend/src/aiRoutes.ts` — 3 个 AI 路由 |
| 新建 | `backend/.env.example` |
| 修改 | `backend/src/index.ts` — 加载 dotenv，挂载 AI 路由 |
| 修改 | `backend/package.json` — 添加 openai, dotenv 依赖 |
| 修改 | `client/src/types.ts` — 添加 AI 相关类型 |
| 修改 | `client/src/api/index.ts` — 添加 aiApi |
| 修改 | `client/src/pages/Create.tsx` — 替换 mock 为真实 API 调用 |
| 修改 | `client/src/components/PagesEditor.tsx` — 显示图片 |
| 修改 | `client/src/pages/WorkDetail.tsx` — 显示图片 |

## 实现顺序

1. **Phase 1**：后端框架 — types/provider/registry/storage/prompts + Mock TextProvider & ImageProvider + AI 路由
2. **Phase 2**：前端对接 — types/api/Create 页面改造，用 Mock Provider 跑通两步生成全流程
3. **Phase 3**：火山引擎 Provider — 接入豆包 LLM（文字分镜）+ Seedream（图片生成）
4. **Phase 4**：OpenAI Provider — 接入 GPT（文字分镜）+ DALL-E（图片生成）
5. **Phase 5**：完善 — WorkDetail 图片展示、单页重新生成、错误处理优化

## 验证方式

1. 启动后端，`curl GET /api/ai/providers` — 返回 mock provider（无 API Key 时）
2. `curl POST /api/ai/generate` 带 mock provider — 返回占位图片 + 文字分镜
3. 配置火山引擎 API Key → 重启 → Provider 列表显示 volcengine
4. 前端 AI 创作 → 选 volcengine → 输入梗概 → 生成 → 看到漫画图片
5. 配置 OpenAI API Key → 前端切换 provider → 生成 → 看到图片
6. 发布作品 → 查看作品详情 → 分镜区显示图片
7. 生成结果页 → 点击单页"重新生成" → 该页图片更新
