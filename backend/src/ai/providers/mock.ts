import type { TextProviderInfo, ImageProviderInfo, TextBreakdownRequest, TextBreakdownResult, ImageGenerationRequest, ImageGenerationResult, PageBreakdown } from '../types'
import type { TextProvider, ImageProvider } from '../provider'

const mockTemplates = [
  { desc: '开篇：故事的世界观展开，一个广阔的场景呈现在眼前', dial: '' },
  { desc: '主角登场，在日常场景中展现性格特点', dial: '又是普通的一天...' },
  { desc: '转折出现，一个意外事件打破了平静', dial: '这是怎么回事？！' },
  { desc: '主角面临选择，气氛变得紧张', dial: '我必须做出决定' },
  { desc: '冲突升级，主角遭遇强大的阻碍', dial: '没想到事情会变成这样...' },
  { desc: '关键时刻，主角获得了新的力量或帮助', dial: '原来如此！我明白了' },
  { desc: '高潮场景，主角与对手正面交锋', dial: '这次，我不会退缩！' },
  { desc: '战斗进入白热化，画面充满张力', dial: '' },
  { desc: '转机出现，意想不到的发展', dial: '不可能...这竟然是...' },
  { desc: '故事迎来阶段性结局，留下悬念', dial: '故事才刚刚开始...' },
  { desc: '尾声：一个新的谜团浮出水面', dial: '' },
  { desc: '彩蛋：暗示下一章的关键线索', dial: '你终于来了...' },
]

export class MockTextProvider implements TextProvider {
  readonly id = 'mock-text'

  getInfo(): TextProviderInfo {
    return {
      id: this.id,
      name: 'Mock',
      icon: '🧪',
      type: 'text',
      models: [{ id: 'mock-text', name: 'Mock LLM' }],
      enabled: true,
    }
  }

  async generateBreakdown(req: TextBreakdownRequest): Promise<TextBreakdownResult> {
    const title = req.synopsis.substring(0, 15) + (req.synopsis.length > 15 ? '...' : '')
    const pages: PageBreakdown[] = Array.from({ length: req.pageCount }, (_, i) => {
      const t = mockTemplates[i % mockTemplates.length]!
      return {
        pageNumber: i + 1,
        description: t.desc,
        dialogue: t.dial,
        imagePrompt: `A ${req.style} style scene: ${t.desc}, detailed illustration`,
      }
    })

    return { success: true, title, description: req.synopsis, pages }
  }
}

export class MockImageProvider implements ImageProvider {
  readonly id = 'mock-image'

  getInfo(): ImageProviderInfo {
    return {
      id: this.id,
      name: 'Mock',
      icon: '🧪',
      type: 'image',
      models: [{ id: 'mock-image', name: 'Mock Image' }],
      enabled: true,
    }
  }

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    // 返回一个 SVG 占位图，不需要下载
    const placeholderUrl = `https://placehold.co/1024x1024/1a1a2e/eee?text=${encodeURIComponent(req.prompt.substring(0, 30))}`
    return { success: true, imageUrl: placeholderUrl }
  }
}
