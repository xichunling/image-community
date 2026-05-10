import { Router, type Response } from 'express'
import { requireAuth, type AuthRequest } from './auth'
import db from './database'

const router = Router()

// GET /credits/status — 积分余额 + 签到状态
router.get('/status', requireAuth, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.userId) as { credits: number } | undefined
  if (!user) return res.status(404).json({ error: '用户不存在' })

  const today = new Date().toISOString().slice(0, 10)
  const todayCheckIn = db.prepare('SELECT * FROM check_ins WHERE user_id = ? AND check_date = ?').get(req.userId, today)

  // 计算连续签到天数
  const lastCheckIn = db.prepare('SELECT streak FROM check_ins WHERE user_id = ? ORDER BY check_date DESC LIMIT 1').get(req.userId) as { streak: number } | undefined

  res.json({
    credits: user.credits,
    checkedInToday: !!todayCheckIn,
    streak: lastCheckIn?.streak || 0,
  })
})

// POST /credits/check-in — 签到
router.post('/check-in', requireAuth, (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10)

  // 检查今日是否已签到
  const existing = db.prepare('SELECT * FROM check_ins WHERE user_id = ? AND check_date = ?').get(req.userId, today)
  if (existing) {
    return res.status(400).json({ error: '今日已签到' })
  }

  // 计算连续天数
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const lastCheckIn = db.prepare('SELECT streak, check_date FROM check_ins WHERE user_id = ? ORDER BY check_date DESC LIMIT 1').get(req.userId) as { streak: number; check_date: string } | undefined

  let streak = 1
  if (lastCheckIn && lastCheckIn.check_date === yesterday) {
    streak = lastCheckIn.streak + 1
  }

  // 计算积分：基础 100，第 7 天额外 +400
  let creditsEarned = 100
  if (streak % 7 === 0) {
    creditsEarned = 500 // 100 基础 + 400 额外
  }

  // 写入签到记录
  db.prepare('INSERT INTO check_ins (user_id, check_date, streak, credits_earned) VALUES (?, ?, ?, ?)').run(req.userId, today, streak, creditsEarned)

  // 加积分
  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(creditsEarned, req.userId)

  // 积分流水
  const desc = streak % 7 === 0 ? `连续签到${streak}天奖励` : '每日签到'
  db.prepare('INSERT INTO credit_logs (user_id, amount, type, description) VALUES (?, ?, ?, ?)').run(req.userId, creditsEarned, 'checkin', desc)

  const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(req.userId) as { credits: number }

  res.json({
    creditsEarned,
    streak,
    totalCredits: user.credits,
    message: streak % 7 === 0 ? `连续签到${streak}天！额外奖励400积分！` : `签到成功！+${creditsEarned}积分`,
  })
})

// GET /credits/logs — 积分流水
router.get('/logs', requireAuth, (req: AuthRequest, res: Response) => {
  const logs = db.prepare('SELECT id, amount, type, description, task_id, created_at FROM credit_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId)
  res.json(logs)
})

export default router
