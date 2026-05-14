import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from './auth'
import { registry } from './ai'
import { buildImagePrompt } from './ai/prompts'
import { VolcengineTextProvider, VolcengineImageProvider } from './ai/providers/volcengine'
import db from './database'
import { calculateCredits, estimateMaxCredits } from './pricingConfig'

const router = Router()

// 内存中维护任务的 AbortController，用于取消正在进行的 API 调用
const taskAbortMap = new Map<number, AbortController>()

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

  // fork 上下文（可选）
  const { parentWorkId, forkFromPage } = req.body
  let parentTitle = ''
  if (parentWorkId) {
    const pw = db.prepare('SELECT title FROM works WHERE id = ?').get(parentWorkId) as { title: string } | undefined
    parentTitle = pw?.title || ''
  }

  // 创建任务记录，立即返回
  const inputParams = JSON.stringify({ synopsis, style, type, pageCount, textProvider, imageProvider, parentWorkId: parentWorkId || undefined, forkFromPage: forkFromPage || undefined, parentTitle: parentTitle || undefined })
  const taskResult = db.prepare('INSERT INTO generation_tasks (user_id, type, input_params) VALUES (?, ?, ?)').run(req.userId, type, inputParams)
  const taskId = Number(taskResult.lastInsertRowid)

  res.json({ taskId, message: '创作任务已提交，可在个人页查看进度' })

  // 后台异步执行生成
  const userId = req.userId!
  const abortController = new AbortController()
  taskAbortMap.set(taskId, abortController)

  ;(async () => {
    let usedPromptTokens = 0
    let usedCompletionTokens = 0
    let imageCount = 0
    const typeLabel = type === 'novel' ? '小说' : type === 'comic' ? '漫画' : '短剧'

    try {
      const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })

      if (abortController.signal.aborted) {
        // 文字已生成完但被取消，记录 token 消耗
        usedPromptTokens = textResult.usage?.promptTokens || 0
        usedCompletionTokens = textResult.usage?.completionTokens || 0
        throw new DOMException('Aborted', 'AbortError')
      }

      if (!textResult.success) {
        db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', textResult.error || '文字生成失败', taskId)
        return
      }

      usedPromptTokens = textResult.usage?.promptTokens || 0
      usedCompletionTokens = textResult.usage?.completionTokens || 0

      const pages = []
      for (const page of textResult.pages) {
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')

        if (type === 'novel') {
          pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: undefined, ai_generated: true })
        } else {
          const imagePrompt = buildImagePrompt(page, style, type)
          const imageResult = await imageP!.generateImage({ prompt: imagePrompt, style, size: '2K' })
          if (imageResult.success) imageCount++
          pages.push({
            pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue,
            image_url: imageResult.success ? imageResult.imageUrl : undefined,
            ai_generated: true,
          })
        }
      }

      // 计算并扣除积分
      const finalImageCount = pages.filter(p => p.image_url).length
      const actualCredits = calculateCredits({ promptTokens: usedPromptTokens, completionTokens: usedCompletionTokens, imageCount: finalImageCount })

      db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(actualCredits, userId)
      db.prepare('INSERT INTO credit_logs (user_id, amount, type, description, task_id) VALUES (?, ?, ?, ?, ?)').run(userId, -actualCredits, 'ai_generate', `AI生成${typeLabel}${pageCount}${type === 'novel' ? '章' : '页'}`, taskId)

      console.log(`[任务${taskId}] 完成，扣费${actualCredits}积分`)

      const result = JSON.stringify({ title: textResult.title, description: textResult.description, hookDescription: textResult.hookDescription, coverPrompt: textResult.coverPrompt, pages })
      db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, actualCredits, taskId)
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        // 取消 — 计算部分消耗
        const partialCredits = calculateCredits({ promptTokens: usedPromptTokens, completionTokens: usedCompletionTokens, imageCount })
        if (partialCredits > 0) {
          db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(partialCredits, userId)
          db.prepare('INSERT INTO credit_logs (user_id, amount, type, description, task_id) VALUES (?, ?, ?, ?, ?)').run(userId, -partialCredits, 'ai_generate', `AI生成${typeLabel}(已取消，部分消耗)`, taskId)
          db.prepare('UPDATE generation_tasks SET credits_used = ? WHERE id = ?').run(partialCredits, taskId)
        }
        console.log(`[任务${taskId}] 已取消，部分扣费${partialCredits}积分`)
      } else {
        console.error(`[任务${taskId}] 失败:`, err.message)
        db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败', taskId)
      }
    } finally {
      taskAbortMap.delete(taskId)
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
  const inputParams = task.input_params ? JSON.parse(task.input_params) : {}
  const { title: customTitle, subtitle: customSubtitle, description: customDesc, cover_image, allow_fork } = req.body as { title?: string; subtitle?: string; description?: string; cover_image?: string; allow_fork?: number }
  const description = customDesc || result.hookDescription || result.description

  // 检查是否为 fork 任务
  const parentWorkId = inputParams.parentWorkId || null
  const forkFromPage = inputParams.forkFromPage || null

  let rootId: number | null = null
  let title = ''
  let subtitle = ''
  if (parentWorkId) {
    const parentWork = db.prepare('SELECT root_work_id, id, title FROM works WHERE id = ?').get(parentWorkId) as { root_work_id: number | null; id: number; title: string } | undefined
    rootId = parentWork?.root_work_id || parentWork?.id || null
    // fork 作品：标题 = 父标题：副标题
    subtitle = customSubtitle || result.title || ''
    title = `${parentWork?.title || ''}：${subtitle}`
  } else {
    title = customTitle || result.title
  }

  // 创建作品
  const workResult = db.prepare('INSERT INTO works (title, subtitle, description, type, creator_id, cover_image, allow_fork, parent_work_id, root_work_id, fork_from_page, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    title, subtitle, description, task.type, req.userId, cover_image || '', allow_fork ?? 1,
    parentWorkId, rootId, forkFromPage, 'published'
  )
  const workId = Number(workResult.lastInsertRowid)

  // 如果不是 fork，root 指向自身
  if (!parentWorkId) {
    db.prepare('UPDATE works SET root_work_id = ? WHERE id = ?').run(workId, workId)
  }

  db.prepare('INSERT INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, req.userId, 'creator')

  // fork 时继承上游贡献者
  if (parentWorkId) {
    const ancestorContributors = db.prepare('SELECT DISTINCT user_id FROM contributors WHERE work_id = ?').all(parentWorkId) as { user_id: number }[]
    for (const c of ancestorContributors) {
      if (c.user_id !== req.userId) {
        db.prepare('INSERT OR IGNORE INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, c.user_id, 'ancestor')
      }
    }
  }

  // 复制父作品前 forkFromPage 页
  let startPageNumber = 1
  if (parentWorkId && forkFromPage && forkFromPage > 0) {
    const parentPages = db.prepare('SELECT * FROM work_pages WHERE work_id = ? AND page_number <= ? ORDER BY page_number ASC').all(parentWorkId, forkFromPage) as { page_number: number; image_url: string; description: string; dialogue: string; ai_generated: number }[]
    for (const p of parentPages) {
      db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)').run(workId, p.page_number, p.image_url, p.description, p.dialogue, p.ai_generated)
    }
    startPageNumber = forkFromPage + 1
  }

  // 插入 AI 生成的页面
  for (let i = 0; i < result.pages.length; i++) {
    const page = result.pages[i]
    db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)').run(workId, startPageNumber + i, page.image_url || '', page.description, page.dialogue, 1)
  }

  // 发布后从任务列表移除
  db.prepare('DELETE FROM generation_tasks WHERE id = ?').run(task.id)

  res.json({ id: workId, message: '作品已发布' })
})

// 取消生成中的任务
router.post('/tasks/:id/cancel', requireAuth, (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT id, status FROM generation_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any
  if (!task) { res.status(404).json({ error: '任务不存在' }); return }
  if (task.status !== 'generating') { res.status(400).json({ error: '只能取消生成中的任务' }); return }

  // 更新状态
  db.prepare('UPDATE generation_tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('cancelled', task.id)

  // 触发 abort
  const controller = taskAbortMap.get(task.id)
  if (controller) controller.abort()

  res.json({ message: '任务已取消' })
})

// 删除任务
router.delete('/tasks/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT id, status FROM generation_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any
  if (!task) { res.status(404).json({ error: '任务不存在' }); return }
  if (task.status === 'generating') { res.status(400).json({ error: '生成中的任务请先取消' }); return }

  db.prepare('DELETE FROM generation_tasks WHERE id = ?').run(task.id)
  res.json({ message: '任务已删除' })
})

// 重新生成任务
router.post('/tasks/:id/regenerate', requireAuth, async (req: AuthRequest, res: Response) => {
  const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any
  if (!task) { res.status(404).json({ error: '任务不存在' }); return }
  if (task.status === 'generating') { res.status(400).json({ error: '任务正在生成中' }); return }

  const inputParams = JSON.parse(task.input_params)
  const { synopsis, style, type, pageCount, textProvider, imageProvider, textConfig, imageConfig } = inputParams
  const isCustom = !!textConfig

  if (!isCustom) {
    // 平台模式 — 检查积分
    const hasImages = type !== 'novel'
    const estimatedCost = estimateMaxCredits(pageCount, hasImages)
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.userId) as { credits: number } | undefined
    if (!user || user.credits < estimatedCost) {
      res.status(403).json({ error: `积分可能不足，预估需要${estimatedCost}积分，当前${user?.credits || 0}积分` })
      return
    }
  }

  // 创建新任务
  const newTaskResult = db.prepare('INSERT INTO generation_tasks (user_id, type, input_params) VALUES (?, ?, ?)').run(req.userId, task.type, task.input_params)
  const newTaskId = Number(newTaskResult.lastInsertRowid)

  res.json({ taskId: newTaskId, message: '重新生成任务已提交' })

  // 启动异步生成
  const userId = req.userId!
  const abortController = new AbortController()
  taskAbortMap.set(newTaskId, abortController)

  if (isCustom) {
    // 自定义模式 — 需要从 user_ai_configs 获取最新 API key
    const config = db.prepare('SELECT * FROM user_ai_configs WHERE user_id = ?').get(userId) as any
    const actualTextConfig = { baseUrl: textConfig.baseUrl, model: textConfig.model, apiKey: config?.text_api_key || '' }
    const actualImageConfig = imageConfig ? { baseUrl: imageConfig.baseUrl, model: imageConfig.model, apiKey: config?.image_api_key || '' } : null

    ;(async () => {
      try {
        const textP = new VolcengineTextProvider(actualTextConfig)
        const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (!textResult.success) {
          db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', textResult.error || '文字生成失败', newTaskId)
          return
        }
        const pages = []
        if (type === 'novel') {
          for (const page of textResult.pages) {
            pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, ai_generated: true })
          }
        } else if (actualImageConfig) {
          for (const page of textResult.pages) {
            if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
            const imgPrompt = buildImagePrompt(page, style, type)
            let imageUrl: string | undefined
            try {
              const resp = await fetch(`${actualImageConfig.baseUrl}/images/generations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${actualImageConfig.apiKey}` },
                body: JSON.stringify({ model: actualImageConfig.model, prompt: imgPrompt, size: '1024x1024', n: 1 }),
                signal: abortController.signal,
              })
              if (resp.ok) {
                const data = await resp.json() as any
                const remoteUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json
                if (remoteUrl) {
                  const { downloadAndSaveImage } = await import('./ai/storage')
                  imageUrl = await downloadAndSaveImage(remoteUrl)
                }
              }
            } catch (e: any) { if (e.name === 'AbortError') throw e }
            pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: imageUrl, ai_generated: true })
          }
        }
        const result = JSON.stringify({ title: textResult.title, description: textResult.description, hookDescription: textResult.hookDescription, coverPrompt: textResult.coverPrompt, pages })
        db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, newTaskId)
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          console.log(`[任务${newTaskId}] 自定义API任务已取消`)
        } else {
          db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败', newTaskId)
        }
      } finally { taskAbortMap.delete(newTaskId) }
    })()
  } else {
    // 平台模式
    const textP = registry.getTextProvider(textProvider)
    const imageP = registry.getImageProvider(imageProvider)

    ;(async () => {
      let usedPromptTokens = 0, usedCompletionTokens = 0, imgCount = 0
      const typeLabel = type === 'novel' ? '小说' : type === 'comic' ? '漫画' : '短剧'
      try {
        const textResult = await textP!.generateBreakdown({ synopsis, style, pageCount, type })
        if (abortController.signal.aborted) {
          usedPromptTokens = textResult.usage?.promptTokens || 0
          usedCompletionTokens = textResult.usage?.completionTokens || 0
          throw new DOMException('Aborted', 'AbortError')
        }
        if (!textResult.success) {
          db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', textResult.error || '文字生成失败', newTaskId)
          return
        }
        usedPromptTokens = textResult.usage?.promptTokens || 0
        usedCompletionTokens = textResult.usage?.completionTokens || 0
        const pages = []
        for (const page of textResult.pages) {
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
          if (type === 'novel') {
            pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: undefined, ai_generated: true })
          } else {
            const imgPrompt = buildImagePrompt(page, style, type)
            const imageResult = await imageP!.generateImage({ prompt: imgPrompt, style, size: '2K' })
            if (imageResult.success) imgCount++
            pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: imageResult.success ? imageResult.imageUrl : undefined, ai_generated: true })
          }
        }
        const finalImageCount = pages.filter(p => p.image_url).length
        const actualCredits = calculateCredits({ promptTokens: usedPromptTokens, completionTokens: usedCompletionTokens, imageCount: finalImageCount })
        db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(actualCredits, userId)
        db.prepare('INSERT INTO credit_logs (user_id, amount, type, description, task_id) VALUES (?, ?, ?, ?, ?)').run(userId, -actualCredits, 'ai_generate', `AI生成${typeLabel}${pageCount}${type === 'novel' ? '章' : '页'}`, newTaskId)
        const result = JSON.stringify({ title: textResult.title, description: textResult.description, hookDescription: textResult.hookDescription, coverPrompt: textResult.coverPrompt, pages })
        db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, actualCredits, newTaskId)
      } catch (err: any) {
        if (err.name === 'AbortError' || abortController.signal.aborted) {
          const partialCredits = calculateCredits({ promptTokens: usedPromptTokens, completionTokens: usedCompletionTokens, imageCount: imgCount })
          if (partialCredits > 0) {
            db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(partialCredits, userId)
            db.prepare('INSERT INTO credit_logs (user_id, amount, type, description, task_id) VALUES (?, ?, ?, ?, ?)').run(userId, -partialCredits, 'ai_generate', `AI生成${typeLabel}(已取消，部分消耗)`, newTaskId)
            db.prepare('UPDATE generation_tasks SET credits_used = ? WHERE id = ?').run(partialCredits, newTaskId)
          }
        } else {
          db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败', newTaskId)
        }
      } finally { taskAbortMap.delete(newTaskId) }
    })()
  }
})

// 生成封面图
router.post('/generate-cover', requireAuth, async (req: AuthRequest, res: Response) => {
  const { coverPrompt, provider, style } = req.body

  if (!coverPrompt) {
    res.status(400).json({ error: '缺少封面提示词' })
    return
  }

  // 支持平台 provider 或自定义 config
  const { customConfig } = req.body
  let imageUrl: string | undefined

  try {
    if (customConfig && customConfig.baseUrl && customConfig.apiKey && customConfig.model) {
      // 自定义 API
      const url = `${customConfig.baseUrl}/images/generations`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customConfig.apiKey}` },
        body: JSON.stringify({ model: customConfig.model, prompt: coverPrompt, size: '1024x1024', n: 1 }),
      })
      if (resp.ok) {
        const data = await resp.json() as any
        const remoteUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json
        if (remoteUrl) {
          const { downloadAndSaveImage } = await import('./ai/storage')
          imageUrl = await downloadAndSaveImage(remoteUrl)
        }
      }
    } else if (provider) {
      // 平台 provider
      const imageP = registry.getImageProvider(provider)
      if (!imageP) {
        res.status(400).json({ error: `未知的图片 Provider: ${provider}` })
        return
      }
      const result = await imageP.generateImage({ prompt: coverPrompt, style: style || '', size: '1024x1024' })
      if (result.success) imageUrl = result.imageUrl
    } else {
      res.status(400).json({ error: '需要指定 provider 或 customConfig' })
      return
    }

    if (!imageUrl) {
      res.status(500).json({ error: '封面生成失败' })
      return
    }
    res.json({ cover_image: imageUrl })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '封面生成失败' })
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
  const { synopsis, style, type, pageCount, textConfig, imageConfig, parentWorkId, forkFromPage } = req.body

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

  let parentTitle = ''
  if (parentWorkId) {
    const pw = db.prepare('SELECT title FROM works WHERE id = ?').get(parentWorkId) as { title: string } | undefined
    parentTitle = pw?.title || ''
  }

  // 创建任务记录，立即返回
  const inputParams = JSON.stringify({ synopsis, style, type, pageCount, textConfig: { baseUrl: textConfig.baseUrl, model: textConfig.model }, imageConfig: imageConfig ? { baseUrl: imageConfig.baseUrl, model: imageConfig.model } : null, parentWorkId: parentWorkId || undefined, forkFromPage: forkFromPage || undefined, parentTitle: parentTitle || undefined })
  const taskResult = db.prepare('INSERT INTO generation_tasks (user_id, type, input_params) VALUES (?, ?, ?)').run(req.userId, type, inputParams)
  const taskId = Number(taskResult.lastInsertRowid)

  res.json({ taskId, message: '创作任务已提交，可在个人页查看进度' })

  // 后台异步执行
  const userId = req.userId!
  const abortController = new AbortController()
  taskAbortMap.set(taskId, abortController)

  ;(async () => {
    try {
      const textP = new VolcengineTextProvider({ apiKey: textConfig.apiKey, baseUrl: textConfig.baseUrl, model: textConfig.model })

      const textResult = await textP.generateBreakdown({ synopsis, style, pageCount, type })

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')

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
          if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')

          const imagePrompt = buildImagePrompt(page, style, type)
          let imageUrl: string | undefined

          try {
            const url = `${imageConfig.baseUrl}/images/generations`
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${imageConfig.apiKey}` },
              body: JSON.stringify({ model: imageConfig.model, prompt: imagePrompt, size: '1024x1024', n: 1 }),
              signal: abortController.signal,
            })
            if (resp.ok) {
              const data = await resp.json() as any
              const remoteUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json
              if (remoteUrl) {
                const { downloadAndSaveImage } = await import('./ai/storage')
                imageUrl = await downloadAndSaveImage(remoteUrl)
              }
            }
          } catch (e: any) {
            if (e.name === 'AbortError') throw e
          }

          pages.push({ pageNumber: page.pageNumber, description: page.description, dialogue: page.dialogue, image_url: imageUrl, ai_generated: true })
        }
      }

      console.log(`[任务${taskId}] 自定义API生成完成`)
      const result = JSON.stringify({ title: textResult.title, description: textResult.description, hookDescription: textResult.hookDescription, coverPrompt: textResult.coverPrompt, pages })
      db.prepare('UPDATE generation_tasks SET status = ?, result = ?, credits_used = 0, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', result, taskId)
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        console.log(`[任务${taskId}] 自定义API任务已取消`)
        // 自定义 API 不消耗积分，无需扣费
      } else {
        console.error(`[任务${taskId}] 自定义API失败:`, err.message)
        db.prepare('UPDATE generation_tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('failed', err.message || 'AI 生成失败，请检查 API 配置', taskId)
      }
    } finally {
      taskAbortMap.delete(taskId)
    }
  })()
})

export default router
