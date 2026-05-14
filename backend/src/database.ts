import Database from 'better-sqlite3'
import path from 'path'
import bcrypt from 'bcryptjs'

const db: InstanceType<typeof Database> = new Database(path.join(__dirname, '..', 'data.db'))

// 启用WAL模式提升性能
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('wal_autocheckpoint = 1000')

// 关机时调用：强制 checkpoint 并关闭连接
export function checkpointAndClose() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
    console.log('[DB] WAL checkpoint 完成，数据库已关闭')
  } catch (err: any) {
    console.error('[DB] checkpoint 失败:', err.message)
  }
}

// 创建表结构
db.exec(`
  -- 用户表
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 作品表
  CREATE TABLE IF NOT EXISTS works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    type TEXT CHECK(type IN ('comic', 'drama', 'novel')) NOT NULL DEFAULT 'comic',
    creator_id INTEGER NOT NULL,
    parent_work_id INTEGER DEFAULT NULL,
    root_work_id INTEGER DEFAULT NULL,
    status TEXT CHECK(status IN ('draft', 'published')) NOT NULL DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (parent_work_id) REFERENCES works(id),
    FOREIGN KEY (root_work_id) REFERENCES works(id)
  );

  -- 作品页面/分镜表
  CREATE TABLE IF NOT EXISTS work_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    image_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    dialogue TEXT DEFAULT '',
    ai_generated INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id)
  );

  -- 共创贡献者表（记录作品链上的所有参与者）
  CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'creator',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(work_id, user_id)
  );

  -- 评论表
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 收藏/书架表
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    work_id INTEGER NOT NULL,
    read_status TEXT CHECK(read_status IN ('want_read', 'reading', 'finished')) NOT NULL DEFAULT 'want_read',
    last_read_page INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (work_id) REFERENCES works(id),
    UNIQUE(user_id, work_id)
  );

  -- 消息/会话表
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('private', 'group')) NOT NULL DEFAULT 'private',
    title TEXT DEFAULT '',
    work_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id)
  );

  -- 会话成员
  CREATE TABLE IF NOT EXISTS conversation_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(conversation_id, user_id)
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT CHECK(msg_type IN ('text', 'image', 'work_share', 'system')) NOT NULL DEFAULT 'text',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
`)

// 用户 AI 配置表
db.exec(`
  CREATE TABLE IF NOT EXISTS user_ai_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    text_base_url TEXT DEFAULT '',
    text_api_key TEXT DEFAULT '',
    text_model TEXT DEFAULT '',
    image_base_url TEXT DEFAULT '',
    image_api_key TEXT DEFAULT '',
    image_model TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 签到表
  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_date TEXT NOT NULL,
    streak INTEGER DEFAULT 1,
    credits_earned INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`)

// AI 生成任务表
db.exec(`
  CREATE TABLE IF NOT EXISTS generation_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT CHECK(status IN ('generating','completed','failed','cancelled')) NOT NULL DEFAULT 'generating',
    type TEXT NOT NULL DEFAULT 'comic',
    input_params TEXT NOT NULL,
    result TEXT,
    error TEXT,
    credits_used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 积分流水表
  CREATE TABLE IF NOT EXISTS credit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT DEFAULT '',
    task_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 关注表
  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(id),
    FOREIGN KEY (following_id) REFERENCES users(id),
    UNIQUE(follower_id, following_id)
  );

  -- 订阅表
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    work_id INTEGER NOT NULL,
    last_viewed_fork_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (work_id) REFERENCES works(id),
    UNIQUE(user_id, work_id)
  );
`)

// 迁移：users 表加 credits 字段
const creditsCol = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).find(c => c.name === 'credits')
if (!creditsCol) {
  db.exec("ALTER TABLE users ADD COLUMN credits INTEGER DEFAULT 1000")
}

// 迁移：为已有数据库添加 username/password_hash 列
const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
const columnNames = userColumns.map(c => c.name)
if (!columnNames.includes('username')) {
  db.exec('ALTER TABLE users ADD COLUMN username TEXT UNIQUE')
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
  const hash = bcrypt.hashSync('123456', 10)
  const oldUsers = db.prepare("SELECT id FROM users WHERE username IS NULL OR username = ''").all() as { id: number }[]
  for (const u of oldUsers) {
    db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = ?").run(`user${u.id}`, hash, u.id)
  }
}

// 迁移：generation_tasks 表支持 'cancelled' 状态（重建表以更新 CHECK 约束）
const taskCheckInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='generation_tasks'").get() as { sql: string } | undefined
if (taskCheckInfo && !taskCheckInfo.sql.includes('cancelled')) {
  db.exec(`
    CREATE TABLE generation_tasks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT CHECK(status IN ('generating','completed','failed','cancelled')) NOT NULL DEFAULT 'generating',
      type TEXT NOT NULL DEFAULT 'comic',
      input_params TEXT NOT NULL,
      result TEXT,
      error TEXT,
      credits_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    INSERT INTO generation_tasks_new SELECT * FROM generation_tasks;
    DROP TABLE generation_tasks;
    ALTER TABLE generation_tasks_new RENAME TO generation_tasks;
  `)
}

// 迁移：comments 表加 parent_id 字段（支持回复）
const commentCols = (db.prepare("PRAGMA table_info(comments)").all() as { name: string }[]).map(c => c.name)
if (!commentCols.includes('parent_id')) {
  db.exec("ALTER TABLE comments ADD COLUMN parent_id INTEGER DEFAULT NULL")
}

// 迁移：works 表加 allow_fork、fork_from_page、subtitle 字段
const workCols = (db.prepare("PRAGMA table_info(works)").all() as { name: string }[]).map(c => c.name)
if (!workCols.includes('allow_fork')) {
  db.exec("ALTER TABLE works ADD COLUMN allow_fork INTEGER DEFAULT 1")
}
if (!workCols.includes('fork_from_page')) {
  db.exec("ALTER TABLE works ADD COLUMN fork_from_page INTEGER DEFAULT NULL")
}
if (!workCols.includes('subtitle')) {
  db.exec("ALTER TABLE works ADD COLUMN subtitle TEXT DEFAULT ''")
}

// 点亮分页表
db.exec(`
  CREATE TABLE IF NOT EXISTS page_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES work_pages(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(page_id, user_id)
  );
`)

// 作品点赞表
db.exec(`
  CREATE TABLE IF NOT EXISTS work_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(work_id, user_id)
  );
`)

export default db
