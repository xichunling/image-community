import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads')

export async function downloadAndSaveImage(remoteUrl: string): Promise<string> {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }

  const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const filepath = path.join(UPLOADS_DIR, filename)

  return new Promise((resolve, reject) => {
    const client = remoteUrl.startsWith('https') ? https : http
    client.get(remoteUrl, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadAndSaveImage(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载图片失败: HTTP ${res.statusCode}`))
        return
      }
      const stream = fs.createWriteStream(filepath)
      res.pipe(stream)
      stream.on('finish', () => resolve(`/uploads/${filename}`))
      stream.on('error', reject)
    }).on('error', reject)
  })
}
