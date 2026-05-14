import type { TextBreakdownRequest, PageBreakdown } from './types'

export function buildTextBreakdownPrompt(req: TextBreakdownRequest): string {
  const typeLabelMap: Record<string, string> = { comic: '漫画', drama: '短剧', novel: '小说' }
  const typeLabel = typeLabelMap[req.type] || '漫画'
  const styleMap: Record<string, string> = {
    cyberpunk: '赛博朋克',
    watercolor: '水彩',
    pixel: '像素风',
    ink: '水墨',
    comic: '美漫',
    anime: '日漫',
  }
  const styleLabel = styleMap[req.style] || req.style

  if (req.type === 'novel') {
    return `你是一个专业的小说作家。请根据以下梗概，创作一个${req.pageCount}章的短篇小说。

梗概：${req.synopsis}
章节数：${req.pageCount}

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "作品标题",
  "description": "作品简介（一句话）",
  "hookDescription": "吸引读者的推荐语（30-50字，制造悬念，不剧透关键剧情，让人想点进来看）",
  "coverPrompt": "cover illustration prompt in English (vertical composition, character portrait or key scene, atmospheric, cinematic lighting, book cover style)",
  "pages": [
    {
      "pageNumber": 1,
      "description": "本章正文内容（300-500字，完整的一章内容）",
      "dialogue": "章节标题",
      "imagePrompt": ""
    }
  ]
}

要求：
1. 每章正文放在 description 字段，章节标题放在 dialogue 字段
2. 故事要有起承转合，节奏合理
3. 文笔流畅，有画面感和代入感
4. imagePrompt 留空字符串
5. hookDescription 是面向读者的推荐语，要吸引人但不能剧透
6. coverPrompt 用英文描述一张适合做封面的竖版海报画面，包含主角形象和氛围`
  }

  return `你是一个专业的${typeLabel}分镜编剧。请根据以下梗概，创作一个${req.pageCount}页的${typeLabel}分镜脚本。

梗概：${req.synopsis}
画面风格：${styleLabel}
页数：${req.pageCount}

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "title": "作品标题",
  "description": "作品简介（一句话）",
  "hookDescription": "吸引读者的推荐语（30-50字，制造悬念，不剧透关键剧情，让人想点进来看）",
  "coverPrompt": "cover poster prompt in English (vertical composition, main character portrait or key dramatic scene, ${req.style} style, atmospheric, cinematic, poster layout)",
  "pages": [
    {
      "pageNumber": 1,
      "description": "旁白/叙述（补充画面无法表达的前因后果、心理活动、时间跳转等内容，显示在画面下方供读者阅读）",
      "dialogue": "角色对白（角色说出的话，将直接显示在画面中的气泡里。如果本页无对白则为空字符串）",
      "imagePrompt": "图片提示词（英文，用于AI生图，描述这一页的完整画面内容，包含场景、人物、构图、表情、动作。要具体详细。必须包含角色对白的气泡文字效果）"
    }
  ]
}

要求：
1. 每页的 imagePrompt 必须是英文，且包含风格描述 "${req.style} style"
2. 故事要有起承转合，节奏合理
3. imagePrompt 中必须包含 speech bubble / dialogue balloon 来展示角色对白，让画面中能看到角色在说话
4. description 字段写旁白叙述——解释画面无法直接表达的信息（如背景故事、内心独白、时间地点变化）
5. dialogue 字段只写角色实际说出的对白台词
6. 对白要自然、有个性，旁白要简洁有信息量
7. hookDescription 是面向读者的推荐语，要吸引人但不能剧透
8. coverPrompt 用英文描述一张适合做封面海报的竖版画面，突出主角形象和故事氛围`
}

export function buildImagePrompt(page: PageBreakdown, style: string, type: 'comic' | 'drama' | 'novel'): string {
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
    ? `, with visible speech bubble containing dialogue "${page.dialogue}"`
    : ''

  const typeContext = type === 'comic'
    ? 'comic book panel layout, single page, manga style speech balloons'
    : 'film storyboard frame, cinematic'

  return `${page.imagePrompt}, ${styleDesc}, ${typeContext}${dialoguePart}, high quality, detailed`
}
