import db from './database'
import path from 'path'
import fs from 'fs'

const BACKUP_DIR = path.join(__dirname, '..', 'backups')
const MAX_BACKUPS = 7
const INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 小时

// 确保备份目录存在
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

export function backupNow(): string | null {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(BACKUP_DIR, `data.db.${timestamp}`)

    db.backup(backupPath)
    console.log(`[Backup] 备份完成: ${backupPath}`)

    // 清理旧备份，保留最近 MAX_BACKUPS 个
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('data.db.'))
      .sort()
      .reverse()

    for (const old of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, old))
      console.log(`[Backup] 清理旧备份: ${old}`)
    }

    return backupPath
  } catch (err: any) {
    console.error('[Backup] 备份失败:', err.message)
    return null
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startScheduledBackup() {
  // 启动后立即做一次备份
  backupNow()
  // 每 6 小时一次
  intervalId = setInterval(backupNow, INTERVAL_MS)
  console.log(`[Backup] 定期备份已启动，间隔 ${INTERVAL_MS / 3600000} 小时`)
}

export function stopScheduledBackup() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
