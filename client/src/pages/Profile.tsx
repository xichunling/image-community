import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersApi, creditsApi, tasksApi, followsApi } from '../api'
import type { Work } from '../types'
import { useUser } from '../contexts/UserContext'
import FollowListModal from '../components/FollowListModal'
import UserAvatar from '../components/UserAvatar'

export default function Profile() {
  const navigate = useNavigate()
  const { user, logout } = useUser()
  const [works, setWorks] = useState<Work[]>([])
  const [coCreated, setCoCreated] = useState<Work[]>([])
  const [credits, setCredits] = useState<number | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [streak, setStreak] = useState(0)
  const [checkInMsg, setCheckInMsg] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [creditLogs, setCreditLogs] = useState<any[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [w, c] = await Promise.all([
        usersApi.getWorks(user.id),
        usersApi.getContributions(user.id),
      ])
      setWorks(w)
      const myIds = new Set(w.map((x) => x.id))
      setCoCreated(c.filter((x) => !myIds.has(x.id)))
    }
    load()
    creditsApi.status().then(s => {
      setCredits(s.credits)
      setCheckedIn(s.checkedInToday)
      setStreak(s.streak)
    }).catch(() => {})
    tasksApi.list().then(setTasks).catch(() => {})
    creditsApi.logs().then(setCreditLogs).catch(() => {})
    usersApi.getById(user.id).then((u: any) => {
      setFollowerCount(u.followerCount ?? 0)
      setFollowingCount(u.followingCount ?? 0)
    }).catch(() => {})
  }, [user])

  const handleCheckIn = async () => {
    try {
      const res = await creditsApi.checkIn()
      setCheckedIn(true)
      setCredits(res.totalCredits)
      setStreak(res.streak)
      setCheckInMsg(res.message)
      setTimeout(() => setCheckInMsg(''), 3000)
    } catch (err: any) {
      alert(err.message || '签到失败')
    }
  }

  // 未登录：显示登录引导
  if (!user) {
    return (
      <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
        <div className="px-4 pt-5">
          <div className="bg-bg-card rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">👤</div>
            <h2 className="text-lg font-bold">登录影像社区</h2>
            <p className="text-sm text-text-secondary mt-2">登录后可以创作、收藏、互动交流</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-4 px-8 py-2.5 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary/90 transition-colors"
            >
              登录 / 注册
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
      <div className="px-4 pt-5 pb-3">
        <div className="bg-bg-card rounded-2xl p-5 text-center">
          <div className="flex justify-center">
            <div className="relative cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <UserAvatar avatar={user.avatar} nickname={user.nickname} size="lg" />
              <span className="absolute bottom-0 right-0 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px]">+</span>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const res = await usersApi.uploadAvatar(file)
                window.location.reload()
              } catch (err: any) { alert(err.message || '上传失败') }
            }} />
          </div>
          <div className="text-lg font-bold mt-2">{user.nickname}</div>
          <div className="text-xs text-text-secondary mt-1">{user.bio}</div>
          <div className="text-[10px] text-text-secondary mt-1">@{user.username}</div>
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-xl font-bold">{works.length}</div>
              <div className="text-[10px] text-text-secondary">作品</div>
            </div>
            <div className="text-center cursor-pointer" onClick={() => navigate(`/user/${user.id}/followers`)}>
              <div className="text-xl font-bold">{followerCount}</div>
              <div className="text-[10px] text-text-secondary">粉丝</div>
            </div>
            <div className="text-center cursor-pointer" onClick={() => navigate(`/user/${user.id}/following`)}>
              <div className="text-xl font-bold">{followingCount}</div>
              <div className="text-[10px] text-text-secondary">关注</div>
            </div>
            <button
              className="text-center hover:opacity-80 transition-opacity"
              onClick={() => setShowFollowList('followers')}
            >
              <div className="text-xl font-bold">{followerCount}</div>
              <div className="text-[10px] text-text-secondary">粉丝</div>
            </button>
            <button
              className="text-center hover:opacity-80 transition-opacity"
              onClick={() => setShowFollowList('following')}
            >
              <div className="text-xl font-bold">{followingCount}</div>
              <div className="text-[10px] text-text-secondary">关注</div>
            </button>
            <div className="text-center">
              <div className="text-xl font-bold text-primary">{credits ?? '...'}</div>
              <div className="text-[10px] text-text-secondary">积分</div>
            </div>
          </div>

          {/* 签到 */}
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <div className="text-xs text-text-secondary">
              {streak > 0 ? `已连续签到 ${streak} 天` : '每日签到获取积分'}
            </div>
            {checkInMsg ? (
              <span className="text-xs text-success font-medium">{checkInMsg}</span>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checkedIn}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  checkedIn ? 'bg-bg-secondary text-text-secondary' : 'bg-primary text-white hover:bg-primary-light'
                }`}
              >
                {checkedIn ? '今日已签到' : '签到 +100'}
              </button>
            )}
          </div>
          <button
            onClick={() => { logout(); navigate('/') }}
            className="mt-4 px-6 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary hover:text-accent transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>

      {/* 创作任务 */}
      {tasks.length > 0 && (
        <div className="px-4 space-y-2">
          <h3 className="text-sm font-semibold">创作任务</h3>
          {tasks.map((t) => (
            <div key={t.id} onClick={() => navigate(`/task/${t.id}`)} className="flex items-center justify-between bg-bg-card rounded-lg p-3 cursor-pointer hover:scale-[1.01] transition-transform">
              <div className="flex items-center gap-2">
                <span className="text-lg">{t.type === 'comic' ? '📖' : t.type === 'novel' ? '📝' : '🎬'}</span>
                <div>
                  <div className="text-xs text-text-secondary">{new Date(t.created_at).toLocaleDateString()}</div>
                  <div className="text-xs">{t.type === 'comic' ? '漫画' : t.type === 'novel' ? '小说' : '短剧'}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                t.status === 'generating' ? 'bg-primary/20 text-primary-light animate-pulse' :
                t.status === 'completed' ? 'bg-success/20 text-success' :
                t.status === 'cancelled' ? 'bg-text-secondary/20 text-text-secondary' :
                'bg-accent-pink/20 text-accent-pink'
              }`}>
                {t.status === 'generating' ? '生成中...' : t.status === 'completed' ? '待发布' : t.status === 'cancelled' ? '已取消' : '失败'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 积分记录 */}
      <div className="px-4 space-y-2 mt-4">
        <button onClick={() => setShowLogs(!showLogs)} className="text-sm font-semibold flex items-center gap-1">
          积分记录 <span className="text-xs text-text-secondary">{showLogs ? '收起' : '展开'}</span>
        </button>
        {showLogs && (
          <div className="space-y-1">
            {creditLogs.length === 0 && <p className="text-xs text-text-secondary">暂无记录</p>}
            {creditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between bg-bg-card rounded-lg px-3 py-2">
                <div>
                  <div className="text-xs">{log.description || log.type}</div>
                  <div className="text-[10px] text-text-secondary">{new Date(log.created_at).toLocaleString()}</div>
                </div>
                <span className={`text-sm font-medium ${log.amount > 0 ? 'text-success' : 'text-accent-pink'}`}>
                  {log.amount > 0 ? '+' : ''}{log.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My works */}
      <div className="px-4 space-y-2 mt-4">
        <h3 className="text-sm font-semibold">我的作品</h3>
        {works.length === 0 && <p className="text-xs text-text-secondary">还没有创作作品</p>}
        {works.map((w) => (
          <div key={w.id} onClick={() => navigate(`/work/${w.id}`)} className="flex items-center gap-3 bg-bg-card rounded-lg p-3 cursor-pointer hover:scale-[1.01] transition-transform">
            <span className="text-xl">{w.type === 'comic' ? '📖' : w.type === 'novel' ? '📝' : '🎬'}</span>
            <div>
              <div className="text-sm font-medium">{w.title}</div>
              <div className="text-xs text-text-secondary">{w.type === 'comic' ? '漫画' : w.type === 'novel' ? '小说' : '短剧'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Co-created */}
      {coCreated.length > 0 && (
        <div className="px-4 space-y-2 mt-5">
          <h3 className="text-sm font-semibold">参与的共创</h3>
          {coCreated.map((w) => (
            <div key={w.id} onClick={() => navigate(`/work/${w.id}`)} className="flex items-center gap-3 bg-bg-card rounded-lg p-3 cursor-pointer hover:scale-[1.01] transition-transform">
              <span className="text-xl">🤝</span>
              <div>
                <div className="text-sm font-medium">{w.title}</div>
                <div className="text-xs text-text-secondary">by {w.creator_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showFollowList && (
        <FollowListModal
          userId={user.id}
          type={showFollowList}
          onClose={() => setShowFollowList(null)}
        />
      )}
    </div>
  )
}
