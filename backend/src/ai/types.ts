// ===== 文字生成（LLM 分镜） =====

export interface TextBreakdownRequest {
  synopsis: string
  style: string
  pageCount: number
  type: 'comic' | 'drama'
}

export interface PageBreakdown {
  pageNumber: number
  description: string
  dialogue: string
  imagePrompt: string
}

export interface TextBreakdownResult {
  success: boolean
  title: string
  description: string
  pages: PageBreakdown[]
  error?: string
}

// ===== 图片生成（文生图） =====

export interface ImageGenerationRequest {
  prompt: string
  style: string
  size: string
}

export interface ImageGenerationResult {
  success: boolean
  imageUrl?: string
  error?: string
}

// ===== Provider 元信息 =====

export interface TextProviderInfo {
  id: string
  name: string
  icon: string
  type: 'text'
  models: { id: string; name: string }[]
  enabled: boolean
}

export interface ImageProviderInfo {
  id: string
  name: string
  icon: string
  type: 'image'
  models: { id: string; name: string }[]
  enabled: boolean
}

export type ProviderInfo = TextProviderInfo | ImageProviderInfo

// ===== Provider 配置 =====

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}
