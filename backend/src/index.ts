import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import routes from './routes'
import authRoutes from './authRoutes'
import aiRoutes from './aiRoutes'
import { optionalAuth } from './auth'
import seedData from './seed'

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

seedData()

app.listen(PORT, () => {
  console.log(`影像社区服务已启动: http://localhost:${PORT}`)
})
