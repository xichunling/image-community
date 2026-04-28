import { registry } from './registry'
import { MockTextProvider, MockImageProvider } from './providers/mock'
import { VolcengineTextProvider, VolcengineImageProvider } from './providers/volcengine'
import { OpenAITextProvider, OpenAIImageProvider } from './providers/openai'

function initProviders() {
  // Mock Provider 始终注册
  registry.registerText(new MockTextProvider())
  registry.registerImage(new MockImageProvider())

  // 火山引擎/豆包 — 有 API Key 才注册
  const volcKey = process.env.VOLCENGINE_API_KEY
  if (volcKey) {
    const baseUrl = process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
    registry.registerText(new VolcengineTextProvider({
      apiKey: volcKey,
      baseUrl,
      model: process.env.VOLCENGINE_TEXT_MODEL || 'doubao-1.5-pro-32k',
    }))
    registry.registerImage(new VolcengineImageProvider({
      apiKey: volcKey,
      baseUrl,
      model: process.env.VOLCENGINE_IMAGE_MODEL || 'seedream-5.0-lite',
    }))
  }

  // OpenAI — 有 API Key 才注册
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    registry.registerText(new OpenAITextProvider({
      apiKey: openaiKey,
      baseUrl,
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
    }))
    registry.registerImage(new OpenAIImageProvider({
      apiKey: openaiKey,
      baseUrl,
      model: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
    }))
  }
}

initProviders()

export { registry }
