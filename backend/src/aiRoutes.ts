import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from './auth'
import { registry } from './ai'
import { buildImagePrompt } from './ai/prompts'
import { VolcengineTextProvider, VolcengineImageProvider } from './ai/providers/volcengine'
import db from './database'
import { calculateCredits, estimateMaxCredits } from './pricingConfig'

const router = Router()

// 列出可用 Provider（分 text/image 两类）
router.get('/providers', (_req, res) => {
  res.json({
    textProviders: registry.listTextProviders(),
    imageProviders: registry.listImageProviders(),
  })
})

// 完整生成：立即返回 taskId，后台异步执行
router.post('/generate', requireAuth, async (req: AuthRequest, res: Response) => {
  const { synopsis, style, type, pageCount, textProvider, imageProvider } = req.body

  if (!synopsis || !style || !type || !pageCount || !textProvider || (type !== 'novel' && !imageProvider)) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }

  // 积分预估检查
  const hasImages = type !== 'novel'
  const estimatedCost = estimateMaxCredits(pageCount, hasImages)
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.userId) as { credits: number } | undefined
  if (!user || user.credits < estimatedCost) {
    res.status(403).json({ error: `积分可能不足，预估需要${estimatedCost}积分，当前${user?.credits || 0}积分` })
    return
  }

  const textP = registry.getTextProvider(textProvider)
  const imageP = registry.getImageProvider(imageProvider)

  if (!textP) {
    res.status(400).json({ error: `未知的文字 Provider: ${textProvider}` })
    return
  }
  if (type !== 'novel' && !imageP) {
    res.status(400).json({ error: `未知的图片 Provider: ${imageProvider}` })
    return
  }

  // 创建任务记录，立即返回
  const inputParams = JSON.stringify({ synopsis, style, type, pageCount, textProvider, imageProvider })
  const taskResult = db.prepare('INSERT INTO generation_tasks (user_id, type, input_params) VALUES (?, ?, ?)').run(req.userId, type, inputParams)
  const taskId = Number(taskResult.lastInsertRowid)

  res.json({ taskId, message: '创作任务已提交，可在个人页查看进度' })

  // 后台异步执行生成
  const userId = req.userId!
  ;(async () => {
    try {
      const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })
      if (!textResult.success) {
        db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', textResult.error || '文字生成失败', taskId)
        return
      }

      const pages = []
      for (const page of textResult.pages) {
        if (type === 'novel') {
          pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: undefined, ai_generated: true })
        } else {
          const imagePrompt = buildImagePrompt(page, style, type)
          const imageResult = await imageP!.generateImage({ prompt: imagePrompt, style, size: '2K' })
          pages.push({
            pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue,
            image_url: imageResult.success ? imageResult.imageUrl : undefined,
            ai_generated: true,
          })
        }
      }

      // 计算并扣除积分
      const imageCount = pages.filter(p => p.image_url).length
      const actualCredits = calculateCredits({
        promptTokens: textResult.usage?.promptTokens || 0,
        completionTokens: textResult.usage?.completionTokens || 0,
        imageCount,
      })

      db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(actualCredits, userId)
      db.prepare('INSERT INTO credit_logs (user_id, amount, type, description, task_id) VALUES (?, ?, ?, ?, ?)').run(userId, -actualCredits, 'ai_generate', `AI生成${type === 'novel' ? '小说' : type === 'comic' ? '漫画' : '短剧'}${pageCount}${type === 'novel' ? '章' : '页'}`, taskId)

      console.log(`[任务${taskId}] 完成，扣费${actualCredits}积分`)

      const result = JSON.stringify({ title: textResult.title, description: textResult.description, pages })
      db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, actualCredits, taskId)
    } catch (err: any) {
      console.error(`[任务${taskId}] 失败:`, err.message)
      db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败', taskId)
    }
  })()
})

// 获取用户的生成任务列表
router.get('/tasks', requireAuth, (req: AuthRequest, res: Response) => {
  const tasks = db.prepare('SELECT id, status, type, credits_used, created_at, completed_at, error FROM generation_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.userId)
  res.json(tasks)
})

// 获取任务详情（含生成结果）
router.get('/tasks/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any
  if (!task) { res.status(404).json({ error: '任务不存在' }); return }
  if (task.result) task.result = JSON.parse(task.result)
  if (task.input_params) task.input_params = JSON.parse(task.input_params)
  res.json(task)
})

// 确认发布任务结果为作品
router.post('/tasks/:id/publish', requireAuth, (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any
  if (!task) { res.status(404).json({ error: '任务不存在' }); return }
  if (task.status !== 'completed') { res.status(400).json({ error: '任务未完成，无法发布' }); return }
  if (!task.result) { res.status(400).json({ error: '任务无生成结果' }); return }

  const result = JSON.parse(task.result)
  const { title: customTitle, description: customDesc } = req.body as { title?: string; description?: string }
  const title = customTitle || result.title
  const description = customDesc || result.description

  // 创建作品
  const workResult = db.prepare('INSERT INTO works (title, description, type, creator_id, status) VALUES (?, ?, ?, ?, ?)').run(title, description, task.type, req.userId, 'published')
  const workId = Number(workResult.lastInsertRowid)
  db.prepare('UPDATE works SET root_work_id = ? WHERE id = ?').run(workId, workId)
  db.prepare('INSERT INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, req.userId, 'creator')

  // 插入页面
  for (const page of result.pages) {
    db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)').run(workId, page.pageNumber, page.image_url || '', page.description, page.dialogue, 1)
  }

  res.json({ id: workId, message: '作品已发布' })
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

// 获取用户自定义 AI 配置
router.get('/config', requireAuth, (req: AuthRequest, res: Response) => {
  const config = db.prepare('SELECT text_base_url, text_api_key, text_model, image_base_url, image_api_key, image_model FROM user_ai_configs WHERE user_id = ?').get(req.userId) as Record<string, string> | undefined
  res.json(config || { text_base_url: '', text_api_key: '', text_model: '', image_base_url: '', image_api_key: '', image_model: '' })
})

// 保存用户自定义 AI 配置
router.put('/config', requireAuth, (req: AuthRequest, res: Response) => {
  const { text_base_url, text_api_key, text_model, image_base_url, image_api_key, image_model } = req.body

  const existing = db.prepare('SELECT id FROM user_ai_configs WHERE user_id = ?').get(req.userId)
  if (existing) {
    db.prepare('UPDATE user_ai_configs SET text_base_url=?, text_api_key=?, text_model=?, image_base_url=?, image_api_key=?, image_model=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
      .run(text_base_url || '', text_api_key || '', text_model || '', image_base_url || '', image_api_key || '', image_model || '', req.userId)
  } else {
    db.prepare('INSERT INTO user_ai_configs (user_id, text_base_url, text_api_key, text_model, image_base_url, image_api_key, image_model) VALUES (?,?,?,?,?,?,?)')
      .run(req.userId, text_base_url || '', text_api_key || '', text_model || '', image_base_url || '', image_api_key || '', image_model || '')
  }
  res.json({ message: '配置已保存' })
})

// 使用用户自定义 API 生成（不消耗积分，异步模式）
router.post('/generate-custom', requireAuth, async (req: AuthRequest, res: Response) => {
  const { synopsis, style, type, pageCount, textConfig, imageConfig } = req.body

  console.log(`[generate-custom] user=${req.userId}, type=${type}, textConfig.baseUrl=${textConfig?.baseUrl}, model=${textConfig?.model}, keyLength=${textConfig?.apiKey?.length}`)

  if (!synopsis || !style || !type || !pageCount || !textConfig) {
    res.status(400).json({ error: '缺少必要参数' })
    return
  }
  if (!textConfig.baseUrl || !textConfig.apiKey || !textConfig.model) {
    res.status(400).json({ error: '文字模型配置不完整' })
    return
  }
  if (type !== 'novel' && (!imageConfig || !imageConfig.baseUrl || !imageConfig.apiKey || !imageConfig.model)) {
    res.status(400).json({ error: '图片模型配置不完整' })
    return
  }

  // 创建任务记录，立即返回
  const inputParams = JSON.stringify({ synopsis, style, type, pageCount, textConfig: { baseUrl: textConfig.baseUrl, model: textConfig.model }, imageConfig: imageConfig ? { baseUrl: imageConfig.baseUrl, model: imageConfig.model } : null })
  const taskResult = db.prepare('INSERT INTO generation_tasks (user_id, type, input_params) VALUES (?, ?, ?)').run(req.userId, type, inputParams)
  const taskId = Number(taskResult.lastInsertRowid)

  res.json({ taskId, message: '创作任务已提交，可在个人页查看进度' })

  // 后台异步执行
  const userId = req.userId!
  ;(async () => {
    try {
      const textP = new VolcengineTextProvider({ apiKey: textConfig.apiKey, baseUrl: textConfig.baseUrl, model: textConfig.model })

      const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })
      if (!textResult.success) {
        db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', textResult.error || '文字生成失败', taskId)
        return
      }

      const pages = []
      if (type === 'novel') {
        for (const page of textResult.pages) {
          pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, ai_generated: true })
        }
      } else {
        for (const page of textResult.pages) {
          const imagePrompt = buildImagePrompt(page, style, type)
          let imageUrl: string | undefined

          try {
            const url = `${imageConfig.baseUrl}/images/generations`
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imageConfig.apiKey}` },
              body: JSON.stringify({ model: imageConfig.model, prompt: imagePrompt, size: '1024x1024', n: 1 }),
            })
            if (resp.ok) {
              const data = await resp.json() as any
              const remoteUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json
              if (remoteUrl) {
                const { downloadAndSaveImage } = await import('./ai/storage')
                imageUrl = await downloadAndSaveImage(remoteUrl)
              }
            }
          } catch {}

          pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: imageUrl, ai_generated: true })
        }
      }

      console.log(`[任务${taskId}] 自定义API生成完成`)
      const result = JSON.stringify({ title: textResult.title, description: textResult.description, pages })
      db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, taskId)
    } catch (err: any) {
      console.error(`[任务${taskId}] 自定义API失败:`, err.message)
      db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败，请检查 API 配置', taskId)
    }
  })()
})

export default router
