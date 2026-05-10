import { Router, type Response } from 'express'
import bcrypt from 'bcryptjs'
import db from './database'
import { generateToken, requireAuth, type AuthRequest } from './auth'

const router = Router()

// POST /auth/register
router.post('/register', async (req: AuthRequest, res: Response) => {
  const { username, password, nickname } = req.body as {
    username?: string; password?: string; nickname?: string
  }
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、密码和昵称必填' })
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度应为3-20个字符' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6个字符' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return res.status(409).json({ error: '用户名已被使用' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, nickname, avatar, bio) VALUES (?, ?, ?, ?, ?)'
  ).run(username, passwordHash, nickname, '', '')

  const userId = Number(result.lastInsertRowid)
  const token = generateToken(userId)

  res.status(201).json({
    token,
    user: { id: userId, username, nickname, avatar: '', bio: '' }
  })
})

// POST /auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  const { username, password } = req.body as {
    username?: string; password?: string
  }
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码必填' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    | { id: number; username: string; password_hash: string; nickname: string; avatar: string; bio: string }
    | undefined

  if (!user) {
    return res.status(404).json({ error: '该账号未注册，请先注册' })
  }

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ error: '密码错误' })
  }

  const token = generateToken(user.id)
  res.json({
    token,
    user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, bio: user.bio }
  })
})

// GET /auth/me
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?')
    .get(req.userId) as Record<string, unknown> | undefined
  if (!user) {
    return res.status(404).json({ error: '用户不存在' })
  }
  res.json(user)
})

export default router
