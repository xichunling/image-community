import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import db from './database'
import { requireAuth, type AuthRequest } from './auth'

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})
const avatarUpload = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } })

const router = Router()

// ============ 用户 API ============

router.get('/users', (_req: Request, res: Response) => {
  const users = db.prepare('SELECT * FROM users').all()
  res.json(users)
})

router.get('/users/:id', (req: Request<{ id: string }>, res: Response) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?').get(req.params.id) as any
  if (!user) return res.status(404).json({ error: '用户不存在' })
  const followerCount = (db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(req.params.id) as any).c
  const followingCount = (db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(req.params.id) as any).c
  res.json({ ...user, followerCount, followingCount })
})

router.get('/users/:id/works', (req: Request<{ id: string }>, res: Response) => {
  const works = db.prepare(`
    SELECT w.*, u.nickname as creator_name, u.avatar as creator_avatar
    FROM works w
    JOIN users u ON w.creator_id = u.id
    WHERE w.creator_id = ? AND w.status = 'published'
    ORDER BY w.created_at DESC
  `).all(req.params.id)
  res.json(works)
})

router.get('/users/:id/contributions', (req: Request<{ id: string }>, res: Response) => {
  const works = db.prepare(`
    SELECT w.*, u.nickname as creator_name, u.avatar as creator_avatar
    FROM contributors c
    JOIN works w ON c.work_id = w.id
    JOIN users u ON w.creator_id = u.id
    WHERE c.user_id = ? AND w.status = 'published'
    ORDER BY c.joined_at DESC
  `).all(req.params.id)
  res.json(works)
})

// 上传头像
router.post('/users/avatar', requireAuth, avatarUpload.single('avatar'), (req: AuthRequest, res: Response) => {
  if (!req.file) { res.status(400).json({ error: '请选择图片' }); return }
  const url = `/uploads/${req.file.filename}`
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.userId)
  res.json({ avatar: url })
})

// ============ 关注 API ============

// 关注用户
router.post('/users/:id/follow', requireAuth, (req: AuthRequest, res: Response) => {
  const targetId = Number(req.params.id)
  if (targetId === req.userId) { res.status(400).json({ error: '不能关注自己' }); return }
  try {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.userId, targetId)
    res.json({ message: '关注成功' })
  } catch {
    res.status(409).json({ error: '已关注' })
  }
})

// 取消关注
router.delete('/users/:id/follow', requireAuth, (req: AuthRequest, res: Response) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.userId, Number(req.params.id))
  res.json({ message: '已取消关注' })
})

// 关注状态
router.get('/users/:id/follow-status', requireAuth, (req: AuthRequest, res: Response) => {
  const targetId = Number(req.params.id)
  const isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.userId, targetId)
  const isFollowedBy = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(targetId, req.userId)
  res.json({ isFollowing, isFollowedBy, isMutual: isFollowing && isFollowedBy })
})

// 粉丝列表
router.get('/users/:id/followers', (req: Request<{ id: string }>, res: Response) => {
  const followers = db.prepare('SELECT u.id, u.nickname, u.avatar, u.bio FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ? ORDER BY f.created_at DESC').all(req.params.id)
  res.json(followers)
})

// 关注列表
router.get('/users/:id/following', (req: Request<{ id: string }>, res: Response) => {
  const following = db.prepare('SELECT u.id, u.nickname, u.avatar, u.bio FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ? ORDER BY f.created_at DESC').all(req.params.id)
  res.json(following)
})

// ============ 作品 API ============

router.get('/works', (req: Request<{}, {}, {}, { type?: string; sort?: string }>, res: Response) => {
  const { type, sort } = req.query
  let sql = `
    SELECT w.*, u.nickname as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM works w2 WHERE w2.parent_work_id = w.id) as fork_count,
      (SELECT COUNT(*) FROM comments c WHERE c.work_id = w.id) as comment_count
    FROM works w
    JOIN users u ON w.creator_id = u.id
    WHERE w.status = 'published'
  `
  const params: string[] = []

  if (type && type !== 'all') {
    sql += ' AND w.type = ?'
    params.push(type)
  }

  sql += sort === 'oldest' ? ' ORDER BY w.created_at ASC' : ' ORDER BY w.created_at DESC'

  const works = db.prepare(sql).all(...params)
  res.json(works)
})

interface WorkRow extends Record<string, unknown> {
  id: number
  title: string
  parent_work_id: number | null
  root_work_id: number | null
  type: string
}

router.get('/works/:id', (req: Request<{ id: string }>, res: Response) => {
  const work = db.prepare(`
    SELECT w.*, u.nickname as creator_name, u.avatar as creator_avatar
    FROM works w
    JOIN users u ON w.creator_id = u.id
    WHERE w.id = ?
  `).get(req.params.id) as WorkRow | undefined

  if (!work) return res.status(404).json({ error: '作品不存在' })

  const contributors = db.prepare(`
    SELECT u.id, u.nickname, u.avatar, c.role, c.joined_at
    FROM contributors c
    JOIN users u ON c.user_id = u.id
    WHERE c.work_id = ?
    ORDER BY c.joined_at ASC
  `).all(req.params.id)

  let parentWork = null
  if (work.parent_work_id) {
    parentWork = db.prepare(`
      SELECT w.id, w.title, u.nickname as creator_name
      FROM works w
      JOIN users u ON w.creator_id = u.id
      WHERE w.id = ?
    `).get(work.parent_work_id)
  }

  const likeCount = (db.prepare('SELECT COUNT(*) as c FROM work_likes WHERE work_id = ?').get(req.params.id) as { c: number }).c
  const userId = (req as any).userId
  const liked = userId ? !!(db.prepare('SELECT 1 FROM work_likes WHERE work_id = ? AND user_id = ?').get(req.params.id, userId)) : false

  res.json({ ...work, contributors, parentWork, like_count: likeCount, liked })
})

router.get('/works/:id/pages', (req: Request<{ id: string }>, res: Response) => {
  const pages = db.prepare(`
    SELECT * FROM work_pages WHERE work_id = ? ORDER BY page_number ASC
  `).all(req.params.id)
  res.json(pages)
})

interface TreeNodeRow extends Record<string, unknown> {
  id: number
  title: string
  cover_image: string
  type: string
  parent_work_id: number | null
  root_work_id: number | null
  creator_id: number
  created_at: string
  creator_name: string
  creator_avatar: string
  fork_count: number
}

router.get('/works/:id/tree', (req: Request<{ id: string }>, res: Response) => {
  const work = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id) as WorkRow | undefined
  if (!work) return res.status(404).json({ error: '作品不存在' })

  const rootId = work.root_work_id || work.id

  const allWorks = db.prepare(`
    SELECT w.id, w.title, w.cover_image, w.type, w.parent_work_id, w.root_work_id,
      w.creator_id, w.created_at,
      u.nickname as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM works w2 WHERE w2.parent_work_id = w.id) as fork_count
    FROM works w
    JOIN users u ON w.creator_id = u.id
    WHERE (w.root_work_id = ? OR w.id = ?) AND w.status = 'published'
    ORDER BY w.created_at ASC
  `).all(rootId, rootId) as TreeNodeRow[]

  function buildTree(works: TreeNodeRow[], parentId: number | null): (TreeNodeRow & { children: ReturnType<typeof buildTree> })[] {
    return works
      .filter(w => (parentId === null ? w.id === rootId : w.parent_work_id === parentId))
      .map(w => ({
        ...w,
        children: buildTree(works, w.id)
      }))
  }

  const tree = buildTree(allWorks, null)
  res.json(tree.length > 0 ? tree[0] : null)
})

interface PageInput {
  image_url?: string
  description?: string
  dialogue?: string
  ai_generated?: boolean | number
}

router.post('/works', requireAuth, (req: AuthRequest, res: Response) => {
  const { title, description, type, pages, cover_image, allow_fork } = req.body as {
    title: string
    description?: string
    type?: string
    pages?: PageInput[]
    cover_image?: string
    allow_fork?: number
  }
  const creator_id = req.userId!

  if (!title) {
    return res.status(400).json({ error: '标题必填' })
  }

  const result = db.prepare(`
    INSERT INTO works (title, description, type, creator_id, cover_image, allow_fork, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')
  `).run(title, description || '', type || 'comic', creator_id, cover_image || '', allow_fork ?? 1)

  const workId = Number(result.lastInsertRowid)

  db.prepare('UPDATE works SET root_work_id = ? WHERE id = ?').run(workId, workId)
  db.prepare('INSERT INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, creator_id, 'creator')

  if (pages && pages.length > 0) {
    const insertPage = db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)')
    pages.forEach((page, index) => {
      insertPage.run(workId, index + 1, page.image_url || '', page.description || '', page.dialogue || '', page.ai_generated ? 1 : 0)
    })
  }

  res.json({ id: workId, message: '作品创建成功' })
})

// 删除作品（仅创作者可删）
router.delete('/works/:id', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const work = db.prepare('SELECT id, creator_id FROM works WHERE id = ?').get(req.params.id) as { id: number; creator_id: number } | undefined
  if (!work) { res.status(404).json({ error: '作品不存在' }); return }
  if (work.creator_id !== req.userId) { res.status(403).json({ error: '只能删除自己的作品' }); return }

  db.pragma('foreign_keys = OFF')
  db.prepare('DELETE FROM comments WHERE work_id = ?').run(work.id)
  db.prepare('DELETE FROM bookmarks WHERE work_id = ?').run(work.id)
  db.prepare('DELETE FROM work_pages WHERE work_id = ?').run(work.id)
  db.prepare('DELETE FROM contributors WHERE work_id = ?').run(work.id)
  // 清除子作品的 parent 引用
  db.prepare('UPDATE works SET parent_work_id = NULL WHERE parent_work_id = ?').run(work.id)
  db.prepare('DELETE FROM works WHERE id = ?').run(work.id)
  db.pragma('foreign_keys = ON')

  res.json({ message: '作品已删除' })
})

// 查询某页的分支作品
router.get('/works/:id/branches', (req: Request<{ id: string }, {}, {}, { page?: string }>, res: Response) => {
  const page = Number(req.query.page)
  if (!page || page < 1) return res.status(400).json({ error: 'page 参数必填且大于0' })

  const branches = db.prepare(`
    SELECT w.id, w.title, w.description, w.cover_image, w.type, w.created_at, w.fork_from_page,
      u.nickname as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM work_pages wp WHERE wp.work_id = w.id) as page_count
    FROM works w
    JOIN users u ON w.creator_id = u.id
    WHERE w.parent_work_id = ? AND w.fork_from_page = ? AND w.status = 'published'
    ORDER BY w.created_at DESC
  `).all(req.params.id, page)

  res.json(branches)
})

router.post('/works/:id/fork', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const parentWork = db.prepare('SELECT * FROM works WHERE id = ?').get(req.params.id) as (WorkRow & { allow_fork?: number }) | undefined
  if (!parentWork) return res.status(404).json({ error: '原作品不存在' })

  // 验证是否允许共创
  if (parentWork.allow_fork === 0) {
    return res.status(403).json({ error: '该作品不允许共创' })
  }

  const { subtitle, description, pages, cover_image, fork_from_page } = req.body as {
    subtitle: string
    description?: string
    pages?: PageInput[]
    cover_image?: string
    fork_from_page?: number
  }
  const creator_id = req.userId!

  if (!subtitle) {
    return res.status(400).json({ error: '副标题必填' })
  }

  // fork 作品标题 = 父作品标题 + ：+ 副标题
  const parentTitle = (parentWork as any).title as string
  const title = `${parentTitle}：${subtitle}`
  const rootId = parentWork.root_work_id || parentWork.id

  const result = db.prepare(`
    INSERT INTO works (title, subtitle, description, type, creator_id, parent_work_id, root_work_id, cover_image, fork_from_page, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `).run(title, subtitle, description || '', parentWork.type, creator_id, parentWork.id, rootId, cover_image || '', fork_from_page || null)

  const workId = Number(result.lastInsertRowid)

  db.prepare('INSERT OR IGNORE INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, creator_id, 'creator')

  const ancestorContributors = db.prepare(
    'SELECT DISTINCT user_id FROM contributors WHERE work_id = ?'
  ).all(parentWork.id) as { user_id: number }[]

  for (const c of ancestorContributors) {
    if (c.user_id !== creator_id) {
      db.prepare('INSERT OR IGNORE INTO contributors (work_id, user_id, role) VALUES (?, ?, ?)').run(workId, c.user_id, 'ancestor')
    }
  }

  // 复制父作品前 fork_from_page 页到新作品
  let startPageNumber = 1
  if (fork_from_page && fork_from_page > 0) {
    const parentPages = db.prepare('SELECT * FROM work_pages WHERE work_id = ? AND page_number <= ? ORDER BY page_number ASC').all(parentWork.id, fork_from_page) as { page_number: number; image_url: string; description: string; dialogue: string; ai_generated: number }[]
    const insertPage = db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)')
    for (const p of parentPages) {
      insertPage.run(workId, p.page_number, p.image_url, p.description, p.dialogue, p.ai_generated)
    }
    startPageNumber = fork_from_page + 1
  }

  if (pages && pages.length > 0) {
    const insertPage = db.prepare('INSERT INTO work_pages (work_id, page_number, image_url, description, dialogue, ai_generated) VALUES (?, ?, ?, ?, ?, ?)')
    pages.forEach((page, index) => {
      insertPage.run(workId, startPageNumber + index, page.image_url || '', page.description || '', page.dialogue || '', page.ai_generated ? 1 : 0)
    })
  }

  res.json({ id: workId, message: '续写创建成功' })
})

// ============ 点亮/点赞 API ============

// 点亮分页（toggle）
router.post('/pages/:id/like', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const pageId = Number(req.params.id)
  const existing = db.prepare('SELECT id FROM page_likes WHERE page_id = ? AND user_id = ?').get(pageId, req.userId)
  if (existing) {
    db.prepare('DELETE FROM page_likes WHERE page_id = ? AND user_id = ?').run(pageId, req.userId)
    res.json({ liked: false })
  } else {
    db.prepare('INSERT INTO page_likes (page_id, user_id) VALUES (?, ?)').run(pageId, req.userId)
    res.json({ liked: true })
  }
})

// 获取作品各页点亮状态
router.get('/works/:id/page-likes', (req: Request<{ id: string }>, res: Response) => {
  const userId = (req as any).userId
  const pages = db.prepare('SELECT id, page_number FROM work_pages WHERE work_id = ? ORDER BY page_number ASC').all(req.params.id) as { id: number; page_number: number }[]

  const result = pages.map(p => {
    const count = (db.prepare('SELECT COUNT(*) as c FROM page_likes WHERE page_id = ?').get(p.id) as { c: number }).c
    const liked = userId ? !!(db.prepare('SELECT 1 FROM page_likes WHERE page_id = ? AND user_id = ?').get(p.id, userId)) : false
    return { page_id: p.id, page_number: p.page_number, like_count: count, liked }
  })

  res.json(result)
})

// 作品点赞（toggle）+ 通知所有贡献者
router.post('/works/:id/like', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const workId = Number(req.params.id)
  const existing = db.prepare('SELECT id FROM work_likes WHERE work_id = ? AND user_id = ?').get(workId, req.userId)
  if (existing) {
    db.prepare('DELETE FROM work_likes WHERE work_id = ? AND user_id = ?').run(workId, req.userId)
    res.json({ liked: false })
  } else {
    db.prepare('INSERT INTO work_likes (work_id, user_id) VALUES (?, ?)').run(workId, req.userId)

    // 通知所有贡献者
    const work = db.prepare('SELECT title FROM works WHERE id = ?').get(workId) as { title: string } | undefined
    const contributors = db.prepare('SELECT DISTINCT user_id FROM contributors WHERE work_id = ?').all(workId) as { user_id: number }[]
    const liker = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId) as { nickname: string }

    for (const c of contributors) {
      if (c.user_id === req.userId) continue
      // 查找或创建系统通知会话
      let conv = db.prepare(`SELECT c.id FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id WHERE c.type = 'private' AND cm.user_id = ? AND c.id IN (SELECT conversation_id FROM conversation_members WHERE user_id = 0)`).get(c.user_id) as { id: number } | undefined
      if (!conv) {
        const convResult = db.prepare("INSERT INTO conversations (type, title) VALUES ('private', '系统通知')").run()
        const convId = Number(convResult.lastInsertRowid)
        db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, c.user_id)
        db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, 0)
        conv = { id: convId }
      }
      const msgContent = JSON.stringify({ type: 'like_notify', workId, workTitle: work?.title || '', likerName: liker.nickname })
      db.prepare("INSERT INTO messages (conversation_id, sender_id, content, msg_type) VALUES (?, 0, ?, 'system')").run(conv.id, msgContent)
    }

    res.json({ liked: true })
  }
})

// ============ 评论 API ============

router.get('/works/:id/comments', (req: Request<{ id: string }>, res: Response) => {
  const comments = db.prepare(`
    SELECT c.*, u.nickname, u.avatar,
      ru.nickname as reply_to_name
    FROM comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN comments pc ON c.parent_id = pc.id
    LEFT JOIN users ru ON pc.user_id = ru.id
    WHERE c.work_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id)
  res.json(comments)
})

router.post('/works/:id/comments', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const { content, parent_id } = req.body as { content?: string; parent_id?: number }
  if (!content) {
    return res.status(400).json({ error: '内容必填' })
  }
  const result = db.prepare('INSERT INTO comments (work_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)').run(req.params.id, req.userId, content, parent_id || null)
  const commentId = Number(result.lastInsertRowid)

  // 发送系统通知给作品作者
  const work = db.prepare('SELECT creator_id, title FROM works WHERE id = ?').get(req.params.id) as { creator_id: number; title: string } | undefined
  if (work && work.creator_id !== req.userId) {
    // 查找或创建与作者的系统通知会话
    let conv = db.prepare(`SELECT c.id FROM conversations c JOIN conversation_members cm ON c.id = cm.conversation_id WHERE c.type = 'private' AND cm.user_id = ? AND c.id IN (SELECT conversation_id FROM conversation_members WHERE user_id = 0)`).get(work.creator_id) as { id: number } | undefined

    if (!conv) {
      // 创建系统通知会话（sender_id=0 作为系统用户）
      const convResult = db.prepare("INSERT INTO conversations (type, title) VALUES ('private', '系统通知')").run()
      const convId = Number(convResult.lastInsertRowid)
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, work.creator_id)
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, 0)
      conv = { id: convId }
    }

    const commenter = db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.userId) as { nickname: string }
    const msgContent = JSON.stringify({ type: 'comment_notify', workId: Number(req.params.id), workTitle: work.title, commentId, commenterName: commenter.nickname, text: content.substring(0, 50) })
    db.prepare("INSERT INTO messages (conversation_id, sender_id, content, msg_type) VALUES (?, 0, ?, 'system')").run(conv.id, msgContent)
  }

  res.json({ message: '评论成功' })
})

// ============ 书架/收藏 API ============

router.get('/users/:id/bookmarks', (req: Request<{ id: string }, {}, {}, { status?: string }>, res: Response) => {
  const { status } = req.query
  let sql = `
    SELECT b.*, w.title, w.description, w.type, w.cover_image,
      u.nickname as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM work_pages wp WHERE wp.work_id = w.id) as total_pages
    FROM bookmarks b
    JOIN works w ON b.work_id = w.id
    JOIN users u ON w.creator_id = u.id
    WHERE b.user_id = ?
  `
  const params: (string | number)[] = [req.params.id]
  if (status && status !== 'all') {
    sql += ' AND b.read_status = ?'
    params.push(status)
  }
  sql += ' ORDER BY b.updated_at DESC'
  const bookmarks = db.prepare(sql).all(...params)
  res.json(bookmarks)
})

router.post('/bookmarks', requireAuth, (req: AuthRequest, res: Response) => {
  const { work_id } = req.body as { work_id?: number }
  if (!work_id) return res.status(400).json({ error: '参数缺失' })
  db.prepare('INSERT OR IGNORE INTO bookmarks (user_id, work_id, read_status) VALUES (?, ?, ?)').run(req.userId, work_id, 'want_read')
  res.json({ message: '已加入书架' })
})

router.put('/bookmarks/:id', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id) as { user_id: number } | undefined
  if (!bookmark || bookmark.user_id !== req.userId) {
    return res.status(403).json({ error: '无权操作' })
  }
  const { read_status, last_read_page } = req.body as { read_status?: string; last_read_page?: number }
  if (read_status) {
    db.prepare('UPDATE bookmarks SET read_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(read_status, req.params.id)
  }
  if (last_read_page !== undefined) {
    db.prepare('UPDATE bookmarks SET last_read_page = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(last_read_page, req.params.id)
  }
  res.json({ message: '已更新' })
})

router.delete('/bookmarks/:id', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id) as { user_id: number } | undefined
  if (!bookmark || bookmark.user_id !== req.userId) {
    return res.status(403).json({ error: '无权操作' })
  }
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(req.params.id)
  res.json({ message: '已移出书架' })
})

router.get('/bookmarks/check', (req: AuthRequest<{}, {}, {}, { work_id?: string }>, res: Response) => {
  const { work_id } = req.query
  if (!req.userId || !work_id) {
    return res.json({ bookmarked: false, bookmark: null })
  }
  const bookmark = db.prepare('SELECT * FROM bookmarks WHERE user_id = ? AND work_id = ?').get(req.userId, work_id)
  res.json({ bookmarked: !!bookmark, bookmark })
})

// ============ 订阅 API ============

router.get('/users/:id/subscriptions', (req: Request<{ id: string }>, res: Response) => {
  const subs = db.prepare(`
    SELECT s.*, w.title, w.description, w.type, w.cover_image,
      u.nickname as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM work_pages wp WHERE wp.work_id = w.id) as total_pages,
      (SELECT COUNT(*) FROM works w2 WHERE w2.parent_work_id = w.id) as current_fork_count
    FROM subscriptions s
    JOIN works w ON s.work_id = w.id
    JOIN users u ON w.creator_id = u.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.params.id) as any[]
  const result = subs.map(s => ({
    ...s,
    has_update: (s.current_fork_count ?? 0) > (s.last_viewed_fork_count ?? 0),
    new_fork_count: Math.max(0, (s.current_fork_count ?? 0) - (s.last_viewed_fork_count ?? 0)),
  }))
  res.json(result)
})

router.post('/subscriptions', requireAuth, (req: AuthRequest, res: Response) => {
  const { work_id } = req.body as { work_id?: number }
  if (!work_id) return res.status(400).json({ error: '参数缺失' })
  const currentForkCount = (db.prepare('SELECT COUNT(*) as c FROM works WHERE parent_work_id = ?').get(work_id) as any).c
  db.prepare('INSERT OR IGNORE INTO subscriptions (user_id, work_id, last_viewed_fork_count) VALUES (?, ?, ?)').run(req.userId, work_id, currentForkCount)
  res.json({ message: '已订阅' })
})

router.delete('/subscriptions/:workId', requireAuth, (req: AuthRequest<{ workId: string }>, res: Response) => {
  db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND work_id = ?').run(req.userId, req.params.workId)
  res.json({ message: '已取消订阅' })
})

router.get('/subscriptions/check', (req: AuthRequest<{}, {}, {}, { work_id?: string }>, res: Response) => {
  const { work_id } = req.query
  if (!req.userId || !work_id) {
    return res.json({ subscribed: false, last_viewed_fork_count: 0 })
  }
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND work_id = ?').get(req.userId, work_id) as any
  res.json({ subscribed: !!sub, last_viewed_fork_count: sub?.last_viewed_fork_count ?? 0 })
})

router.put('/subscriptions/:workId/viewed', requireAuth, (req: AuthRequest<{ workId: string }>, res: Response) => {
  const currentForkCount = (db.prepare('SELECT COUNT(*) as c FROM works WHERE parent_work_id = ?').get(req.params.workId) as any).c
  db.prepare('UPDATE subscriptions SET last_viewed_fork_count = ? WHERE user_id = ? AND work_id = ?').run(currentForkCount, req.userId, req.params.workId)
  res.json({ message: '已更新' })
})

// ============ 消息 API ============

interface ConversationRow extends Record<string, unknown> {
  id: number
  type: string
  title: string
  work_id: number | null
  last_message?: string
  last_sender?: string
}

router.get('/users/:id/conversations', (req: Request<{ id: string }>, res: Response) => {
  const conversations = db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
      (SELECT COALESCE(u2.nickname, '系统') FROM messages m2 LEFT JOIN users u2 ON m2.sender_id = u2.id WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1) as last_sender,
      (SELECT m3.created_at FROM messages m3 WHERE m3.conversation_id = c.id ORDER BY m3.created_at DESC LIMIT 1) as last_message_time,
      (SELECT m4.msg_type FROM messages m4 WHERE m4.conversation_id = c.id ORDER BY m4.created_at DESC LIMIT 1) as last_msg_type
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    WHERE cm.user_id = ?
    ORDER BY last_message_time DESC
  `).all(req.params.id) as ConversationRow[]

  interface MemberRow { id: number; nickname: string; avatar: string }

  const convWithMembers = conversations.map(conv => {
    const members = db.prepare(`
      SELECT u.id, u.nickname, u.avatar
      FROM conversation_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.conversation_id = ? AND cm.user_id != 0
    `).all(conv.id) as MemberRow[]

    let displayName: string = conv.title
    let displayAvatar = ''
    if (conv.type === 'private') {
      const other = members.find(m => m.id !== parseInt(req.params.id))
      if (other) {
        displayName = other.nickname
        displayAvatar = other.avatar
      } else if (conv.title === '系统通知') {
        displayName = '系统通知'
        displayAvatar = ''
      }
    }

    return { ...conv, members, displayName, displayAvatar }
  })

  res.json(convWithMembers)
})

router.post('/conversations', requireAuth, (req: AuthRequest, res: Response) => {
  const { target_user_id } = req.body as { target_user_id?: number }
  if (!target_user_id) return res.status(400).json({ error: '参数缺失' })
  if (target_user_id === req.userId) return res.status(400).json({ error: '不能和自己创建会话' })

  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(target_user_id) as any
  if (!targetUser) return res.status(404).json({ error: '用户不存在' })

  // 查找是否已有两人之间的私聊会话
  const existing = db.prepare(`
    SELECT c.id FROM conversations c
    WHERE c.type = 'private'
      AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ?)
      AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = ?)
      AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
    LIMIT 1
  `).get(req.userId, target_user_id) as { id: number } | undefined

  if (existing) {
    return res.json({ conversation_id: existing.id, created: false })
  }

  const result = db.prepare('INSERT INTO conversations (type) VALUES (?)').run('private')
  const convId = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, req.userId)
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(convId, target_user_id)
  res.json({ conversation_id: convId, created: true })
})

router.get('/conversations/:id/messages', (req: Request<{ id: string }>, res: Response) => {
  const messages = db.prepare(`
    SELECT m.*, COALESCE(u.nickname, '系统') as sender_name, COALESCE(u.avatar, '') as sender_avatar
    FROM messages m
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.id)

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id)
  const members = db.prepare(`
    SELECT u.id, u.nickname, u.avatar
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = ?
  `).all(req.params.id)

  res.json({ conversation: conv, members, messages })
})

router.post('/conversations/:id/messages', requireAuth, (req: AuthRequest<{ id: string }>, res: Response) => {
  const { content, msg_type } = req.body as { content?: string; msg_type?: string }
  if (!content) return res.status(400).json({ error: '内容必填' })
  db.prepare('INSERT INTO messages (conversation_id, sender_id, content, msg_type) VALUES (?, ?, ?, ?)').run(
    req.params.id, req.userId, content, msg_type || 'text'
  )
  res.json({ message: '发送成功' })
})

export default router
