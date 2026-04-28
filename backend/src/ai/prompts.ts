import type { TextBreakdownRequest, PageBreakdown } from './types'

export function buildTextBreakdownPrompt(req: TextBreakdownRequest): string {
  const typeLabel = req.type === 'comic' ? '漫画' : '短剧'
  const styleMap: Record<string, string> = {
    cyberpunk: '赛博朋克',
    watercolor: '水彩',
    pixel: '像素风',
    ink: '水墨',
    comic: '美漫',
    anime: '日漫',
  }
  const styleLabel = styleMap[req.style] || req.style

  return `你是一个专业的${typeLabel}分镜编剧。请根据以下梗概，创作一个${req.pageCount}页的${typeLabel}分镜脚本。

梗概：${req.synopsis}
画面风格：${styleLabel}
页数：${req.pageCount}

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "作品标题",
  "description": "作品简介（一句话）",
  "pages": [
    {
      "pageNumber": 1,
      "description": "场景描述（描述这一页画面的场景、人物动作、氛围）",
      "dialogue": "对白（角色的对话或旁白，可为空字符串）",
      "imagePrompt": "图片提示词（英文，用于AI生图，描述这一页的完整画面内容，包含场景、人物、构图、风格关键词。要具体且详细，让生图模型能直接使用。不要包含文字/对白）"
    }
  ]
}

要求：
1. 每页的 imagePrompt 必须是英文，且包含风格描述 "${req.style} style"
2. 故事要有起承转合，节奏合理
3. 场景描述和图片提示词要具体，有画面感
4. 对白要自然、有个性
5. imagePrompt 不需要包含对白文字，因为文字会在画面中叠加显示`
}

export function buildImagePrompt(page: PageBreakdown, style: string, type: 'comic' | 'drama'): string {
  const styleMap: Record<string, string> = {
    cyberpunk: 'cyberpunk style, neon lights, futuristic city',
    watercolor: 'watercolor painting style, soft colors, flowing',
    pixel: 'pixel art style, retro game aesthetic, 16-bit',
    ink: 'chinese ink painting style, brush strokes, monochrome',
    comic: 'american comic book style, bold lines, dynamic composition',
    anime: 'japanese anime style, detailed, vibrant colors',
  }
  const styleDesc = styleMap[style] || `${style} style`

  const dialoguePart = page.dialogue
    ? `, with speech bubble containing text "${page.dialogue}"`
    : ''

  const typeContext = type === 'comic'
    ? 'comic book panel layout, single page'
    : 'film storyboard frame, cinematic'

  return `${page.imagePrompt}, ${styleDesc}, ${typeContext}${dialoguePart}, high quality, detailed`
}
