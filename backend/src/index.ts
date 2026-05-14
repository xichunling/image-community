import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import routes from './routes'
import authRoutes from './authRoutes'
import aiRoutes from './aiRoutes'
import uploadRoutes from './uploadRoutes'
import creditsRoutes from './creditsRoutes'
import { optionalAuth } from './auth'
import seedData from './seed'
import { checkpointAndClose } from './database'
import { startScheduledBackup, stopScheduledBackup, backupNow } from './backup'

const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))

// 全局可选认证：有 token 则解析 userId，无 token 也放行
app.use('/api', optionalAuth)

// 认证路由
app.use('/api/auth', authRoutes)

// 业务路由
app.use('/api', routes)

// AI 路由
app.use('/api/ai', aiRoutes)

// 上传路由
app.use('/api/upload', uploadRoutes)

// 积分路由
app.use('/api/credits', creditsRoutes)

// 静态服务前端构建产物
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist')
app.use(express.static(clientDist))

// SPA fallback：非 /api 请求都返回 index.html
app.get(/.*/,  (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

seedData()

const server = app.listen(PORT, () => {
  console.log(`影像社区服务已启动: http://localhost:${PORT}`)
  startScheduledBackup()
})

// 优雅关机
function gracefulShutdown(signal: string) {
  console.log(`[Shutdown] 收到 ${signal}，开始优雅关机...`)
  server.close(() => {
    console.log('[Shutdown] HTTP 服务已停止')
    stopScheduledBackup()
    backupNow()
    checkpointAndClose()
    console.log('[Shutdown] 关机完成')
    process.exit(0)
  })
  // 5 秒后强制退出
  setTimeout(() => {
    console.error('[Shutdown] 超时，强制退出')
    checkpointAndClose()
    process.exit(1)
  }, 5000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
