import OpenAI from 'openai'
import type { TextProviderInfo, ImageProviderInfo, TextBreakdownRequest, TextBreakdownResult, ImageGenerationRequest, ImageGenerationResult, PageBreakdown } from '../types'
import type { TextProvider, ImageProvider } from '../provider'
import { downloadAndSaveImage } from '../storage'
import { buildTextBreakdownPrompt } from '../prompts'

export class VolcengineTextProvider implements TextProvider {
  readonly id = 'volcengine-text'
  private client: OpenAI
  private model: string

  constructor(config: { apiKey: string; baseUrl: string; model: string }) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
    this.model = config.model
  }

  getInfo(): TextProviderInfo {
    return {
      id: this.id,
      name: '豆包',
      icon: '🌋',
      type: 'text',
      models: [
        { id: 'doubao-1.5-pro-32k', name: 'Doubao 1.5 Pro' },
        { id: 'doubao-1.5-lite-32k', name: 'Doubao 1.5 Lite' },
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

export class VolcengineImageProvider implements ImageProvider {
  readonly id = 'volcengine-image'
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor(config: { apiKey: string; baseUrl: string; model: string }) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl
    this.model = config.model
  }

  getInfo(): ImageProviderInfo {
    return {
      id: this.id,
      name: '豆包 Seedream',
      icon: '🌋',
      type: 'image',
      models: [
        { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0' },
      ],
      enabled: true,
    }
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    try {
      const url = `${this.baseUrl}/images/generations`
      const body = {
        model: this.model,
        prompt: req.prompt,
        size: '2K',
        response_format: 'url',
        sequential_image_generation: 'disabled',
        watermark: true,
        stream: false,
      }

      console.log(`[Volcengine Image] 请求 ${url}, model=${this.model}`)

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        console.error(`[Volcengine Image] HTTP ${resp.status}: ${errText}`)
        return { success: false, error: `HTTP ${resp.status}: ${errText}` }
      }

      const data = await resp.json() as any
      const remoteUrl = data?.data?.[0]?.url

      if (!remoteUrl) {
        console.error('[Volcengine Image] 响应无图片 URL:', JSON.stringify(data))
        return { success: false, error: '生图 API 未返回图片 URL' }
      }

      console.log(`[Volcengine Image] 图片已生成: ${remoteUrl.substring(0, 80)}...`)
      const localPath = await downloadAndSaveImage(remoteUrl)
      return { success: true, imageUrl: localPath }
    } catch (err: any) {
      console.error('[Volcengine Image] 错误:', err.message)
      return { success: false, error: err.message || '图片生成失败' }
    }
  }
}
