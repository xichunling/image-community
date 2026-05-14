import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { bookmarksApi, subscriptionsApi } from '../api'
import type { Bookmark, Subscription } from '../types'
import { useUser } from '../contexts/UserContext'

const statusFilters = [
  { value: 'all', label: '全部' },
  { value: 'reading', label: '在读' },
  { value: 'want_read', label: '想读' },
  { value: 'finished', label: '已读完' },
  { value: 'subscribed', label: '订阅' },
]

const gradients = [
  'from-cover-1 to-cover-2',
  'from-cover-3 to-cover-6',
  'from-cover-4 to-cover-1',
  'from-cover-5 to-cover-4',
  'from-cover-6 to-cover-3',
  'from-cover-7 to-cover-1',
  'from-cover-2 to-cover-7',
]

const statusLabels: Record<string, string> = { reading: '在读', want_read: '想读', finished: '已读完' }
const statusColors: Record<string, string> = { reading: 'bg-accent/20 text-accent', want_read: 'bg-primary/20 text-primary-light', finished: 'bg-success/20 text-success' }

export default function Shelf() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [status, setStatus] = useState('all')
  const { user } = useUser()
  const navigate = useNavigate()

  const load = async () => {
    if (!user) return
    if (status === 'subscribed') {
      const data = await subscriptionsApi.list(user.id)
      setSubscriptions(data)
    } else {
      const data = await bookmarksApi.list(user.id, status)
      setBookmarks(data)
    }
  }

  useEffect(() => { load() }, [user, status])

  const handleSubClick = async (sub: Subscription) => {
    await subscriptionsApi.markViewed(sub.work_id)
    navigate(`/work/${sub.work_id}`)
  }

  const updateStatus = async (id: number, read_status: string) => {
    await bookmarksApi.update(id, { read_status })
    load()
  }

  const remove = async (id: number) => {
    await bookmarksApi.remove(id)
    load()
  }

  return (
    <div className="pb-20 md:pb-6">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-bg to-bg-secondary px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">书架</h1>
      </div>

      <div className="flex gap-1 px-4 py-2">
        {statusFilters.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} className={`px-4 py-1.5 rounded-full text-xs transition-colors ${status === f.value ? 'bg-primary text-white' : 'bg-bg-card text-text-secondary'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3 mt-2">
        {/* 订阅列表 */}
        {status === 'subscribed' && (
          <>
            {subscriptions.length === 0 && (
              <div className="text-center py-20">
                <div className="text-4xl">🔔</div>
                <p className="text-sm text-text-secondary mt-3">还没有订阅作品</p>
                <button onClick={() => navigate('/')} className="mt-3 px-6 py-2 bg-primary rounded-lg text-sm text-white">去发现页逛逛</button>
              </div>
            )}
            {subscriptions.map((sub) => (
              <div key={sub.id} onClick={() => handleSubClick(sub)} className="flex gap-3 bg-bg-card rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-transform relative">
                <div className={`w-16 h-20 bg-gradient-to-br ${gradients[sub.work_id % gradients.length]} rounded-lg flex items-center justify-center text-xs text-white shrink-0`}>
                  {sub.type === 'comic' ? '漫画' : sub.type === 'novel' ? '小说' : '短剧'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{sub.title}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{sub.creator_avatar} {sub.creator_name}</div>
                  <div className="text-[10px] text-text-secondary mt-1">
                    {sub.total_pages}页 · {sub.current_fork_count}次续写
                  </div>
                  <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => subscriptionsApi.unsubscribe(sub.work_id).then(load)}
                      className="text-[10px] px-2 py-0.5 bg-bg-secondary rounded text-text-secondary hover:text-accent-pink"
                    >
                      取消订阅
                    </button>
                  </div>
                </div>
                <span className={`absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded-full ${
                  sub.has_update ? 'bg-success/20 text-success' : 'bg-bg-secondary text-text-secondary'
                }`}>
                  {sub.has_update ? `● ${sub.new_fork_count}条更新` : '已是最新'}
                </span>
              </div>
            ))}
          </>
        )}

        {/* 书架列表 */}
        {status !== 'subscribed' && (
          <>
        {bookmarks.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl">📚</div>
            <p className="text-sm text-text-secondary mt-3">书架空空如也</p>
            <button onClick={() => navigate('/')} className="mt-3 px-6 py-2 bg-primary rounded-lg text-sm text-white">去发现页逛逛</button>
          </div>
        )}
        {bookmarks.map((bm) => {
          const progress = (bm.total_pages ?? 0) > 0 ? Math.round(((bm.last_read_page ?? 0) / bm.total_pages!) * 100) : 0
          return (
            <div key={bm.id} onClick={() => navigate(`/work/${bm.work_id}`)} className="flex gap-3 bg-bg-card rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-transform relative">
              <div className={`w-16 h-20 bg-gradient-to-br ${gradients[bm.work_id % gradients.length]} rounded-lg flex items-center justify-center text-xs text-white shrink-0`}>
                {bm.type === 'comic' ? '漫画' : '短剧'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{bm.title}</div>
                <div className="text-xs text-text-secondary mt-0.5">{bm.creator_avatar} {bm.creator_name}</div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[10px] text-text-secondary">{bm.last_read_page}/{bm.total_pages}页</span>
                </div>
                <div className="flex gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                  {bm.read_status !== 'reading' && (
                    <button onClick={() => updateStatus(bm.id, 'reading')} className="text-[10px] px-2 py-0.5 bg-bg-secondary rounded text-text-secondary hover:text-accent">标记在读</button>
                  )}
                  {bm.read_status !== 'finished' && (
                    <button onClick={() => updateStatus(bm.id, 'finished')} className="text-[10px] px-2 py-0.5 bg-bg-secondary rounded text-text-secondary hover:text-success">标记读完</button>
                  )}
                  <button onClick={() => remove(bm.id)} className="text-[10px] px-2 py-0.5 bg-bg-secondary rounded text-text-secondary hover:text-accent-pink">移除</button>
                </div>
              </div>
              <span className={`absolute top-3 right-3 text-[10px] px-1.5 py-0.5 rounded ${statusColors[bm.read_status] ?? ''}`}>
                {statusLabels[bm.read_status] ?? ''}
              </span>
            </div>
          )
        })}
          </>
        )}
      </div>
    </div>
  )
}
