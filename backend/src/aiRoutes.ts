import { Router } from 'express'
import { requireAuth } from './auth'
import { registry } from './ai'
import { buildImagePrompt } from './ai/prompts'

const router = Router()

// 列出可用 Provider（分 text/image 两类）
router.get('/providers', (_req, res) => {
  res.json({
    textProviders: registry.listTextProviders(),
    imageProviders: registry.listImageProviders(),
  })
})

// 完整生成：先 LLM 分镜 → 再逐页生图
router.post('/generate', requireAuth, async (req, res) => {
  const { synopsis, style, type, pageCount, textProvider, imageProvider } = req.body

  if (!synopsis || !style || !type || !pageCount || !textProvider || !imageProvider) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  const textP = registry.getTextProvider(textProvider)
  const imageP = registry.getImageProvider(imageProvider)

  if (!textP) {
    res.status(400).json({ error: `未知的文字 Provider: ${textProvider}` })
    return
  }
  if (!imageP) {
    res.status(400).json({ error: `未知的图片 Provider: ${imageProvider}` })
    return
  }

  try {
    // Step 1: LLM 生成文字分镜
    const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })
    if (!textResult.success) {
      res.status(500).json({ error: textResult.error || '文字生成失败' })
      return
    }

    // Step 2: 逐页生成图片
    const pages = []
    for (const page of textResult.pages) {
      const imagePrompt = buildImagePrompt(page, style, type)
      const imageResult = await imageP.generateImage({ prompt: imagePrompt, style, size: '2K' })

      if (!imageResult.success) {
        console.error(`[AI Generate] 第${page.pageNumber}页生图失败:`, imageResult.error)
      }

      pages.push({
        pageNumber: page.pageNumber,
        description: page.description,
        dialogue: page.dialogue,
        image_url: imageResult.success ? imageResult.imageUrl : undefined,
        image_error: imageResult.success ? undefined : imageResult.error,
        ai_generated: true,
      })
    }

    res.json({
      title: textResult.title,
      description: textResult.description,
      pages,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI 生成失败' })
  }
})

// 单页重新生图
router.post('/generate-page', requireAuth, async (req, res) => {
  const { provider, style, type, imagePrompt, dialogue } = req.body

  if (!provider || !style || !imagePrompt) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  const imageP = registry.getImageProvider(provider)
  if (!imageP) {
    res.status(400).json({ error: `未知的图片 Provider: ${provider}` })
    return
  }

  try {
    const prompt = buildImagePrompt(
      { pageNumber: 1, description: '', dialogue: dialogue || '', imagePrompt },
      style,
      type || 'comic'
    )
    const result = await imageP.generateImage({ prompt, style, size: '1024x1024' })

    if (!result.success) {
      res.status(500).json({ error: result.error || '图片生成失败' })
      return
    }

    res.json({ image_url: result.imageUrl, ai_generated: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '图片生成失败' })
  }
})

export default router
