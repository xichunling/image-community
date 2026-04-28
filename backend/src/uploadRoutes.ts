import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { requireAuth } from './auth'

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png'
    const name = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, allowed.includes(ext))
  },
})

const router = Router()

router.post('/image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片' })
  }
  const url = `/uploads/${req.file.filename}`
  res.json({ url })
})

export default router
