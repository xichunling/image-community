import OpenAI from 'openai'
import type { TextProviderInfo, ImageProviderInfo, TextBreakdownRequest, TextBreakdownResult, ImageGenerationRequest, ImageGenerationResult, PageBreakdown } from '../types'
import type { TextProvider, ImageProvider } from '../provider'
import { downloadAndSaveImage } from '../storage'
import { buildTextBreakdownPrompt } from '../prompts'

export class OpenAITextProvider implements TextProvider {
  readonly id = 'openai-text'
  private client: OpenAI
  private model: string

  constructor(config: { apiKey: string; baseUrl: string; model: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model
  }

  getInfo(): TextProviderInfo {
    return {
      id: this.id,
      name: 'OpenAI',
      icon: '🤖',
      type: 'text',
      models: [
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4o', name: 'GPT-4o' },
      ],
      enabled: true,
    }
  }

  async generateBreakdown(req: TextBreakdownRequest): Promise<TextBreakdownResult> {
    const prompt = buildTextBreakdownPrompt(req)

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: '你是一个专业的漫画/短剧分镜编剧。请严格按要求输出JSON格式。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, title: '', description: '', pages: [], error: 'LLM 返回内容为空' }
    }

    try {
      const parsed = JSON.parse(content)
      const pages: PageBreakdown[] = (parsed.pages || []).map((p: any, i: number) => ({
        pageNumber: p.pageNumber || i + 1,
        description: p.description || '',
        dialogue: p.dialogue || '',
        imagePrompt: p.imagePrompt || '',
      }))
      return {
        success: true,
        title: parsed.title || '未命名作品',
        description: parsed.description || '',
        pages,
      }
    } catch {
      return { success: false, title: '', description: '', pages: [], error: 'JSON 解析失败' }
    }
  }
}

export class OpenAIImageProvider implements ImageProvider {
  readonly id = 'openai-image'
  private client: OpenAI
  private model: string

  constructor(config: { apiKey: string; baseUrl: string; model: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model
  }

  getInfo(): ImageProviderInfo {
    return {
      id: this.id,
      name: 'DALL-E 3',
      icon: '🤖',
      type: 'image',
      models: [
        { id: 'dall-e-3', name: 'DALL-E 3' },
        { id: 'dall-e-2', name: 'DALL-E 2' },
      ],
      enabled: true,
    }
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    try {
      const response = await this.client.images.generate({
        model: this.model,
        prompt: req.prompt,
        size: req.size as '1024x1024',
        n: 1,
      })

      const remoteUrl = response.data?.[0]?.url
      if (!remoteUrl) {
        return { success: false, error: '生图 API 未返回图片 URL' }
      }

      const localPath = await downloadAndSaveImage(remoteUrl)
      return { success: true, imageUrl: localPath }
    } catch (err: any) {
      return { success: false, error: err.message || '图片生成失败' }
    }
  }
}
