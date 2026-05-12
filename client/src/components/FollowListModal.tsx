import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { followsApi } from '../api'
import { useUser } from '../contexts/UserContext'
import type { User } from '../types'

interface Props {
  userId: number
  type: 'followers' | 'following'
  onClose: () => void
}

export default function FollowListModal({ userId, type, onClose }: Props) {
  const navigate = useNavigate()
  const { user: currentUser } = useUser()
  const [users, setUsers] = useState<User[]>([])
  const [followingMap, setFollowingMap] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const fetcher = type === 'followers' ? followsApi.followers : followsApi.following
    fetcher(userId).then(setUsers).catch(() => setUsers([]))
  }, [userId, type])

  useEffect(() => {
    if (!currentUser || users.length === 0) return
    Promise.all(users.map((u) => followsApi.status(u.id)
      .then((s) => ({ id: u.id, following: s.isFollowing }))
      .catch(() => ({ id: u.id, following: false }))
    )).then((results) => {
      const map: Record<number, boolean> = {}
      results.forEach((r) => { map[r.id] = r.following })
      setFollowingMap(map)
    })
  }, [users, currentUser])

  const handleToggleFollow = async (targetId: number) => {
    if (!currentUser) { navigate('/login'); return }
    const isFollowing = followingMap[targetId]
    try {
      if (isFollowing) {
        await followsApi.unfollow(targetId)
      } else {
        await followsApi.follow(targetId)
      }
      setFollowingMap((prev) => ({ ...prev, [targetId]: !isFollowing }))
    } catch (err: any) {
      // ignore
    }
  }

  const isMe = (id: number) => currentUser?.id === id

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-bg w-full max-h-[60vh] rounded-t-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">
            {type === 'followers' ? '粉丝' : '关注'}
            {users.length > 0 && <span className="text-text-secondary ml-1">({users.length})</span>}
          </h3>
          <button onClick={onClose} className="text-text-secondary text-lg leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {users.length === 0 && (
            <div className="text-center py-12 text-text-secondary text-sm">
              {type === 'followers' ? '还没有粉丝' : '还没有关注'}
            </div>
          )}
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div
                className="flex items-center gap-2.5 cursor-pointer"
                onClick={() => { onClose(); navigate(`/user/${u.id}`) }}
              >
                <span className="text-xl">{u.avatar || '👤'}</span>
                <div>
                  <div className="text-sm font-medium">{u.nickname}</div>
                  {u.bio && <div className="text-[10px] text-text-secondary truncate max-w-[160px]">{u.bio}</div>}
                </div>
              </div>
              {!isMe(u.id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleFollow(u.id) }}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                    followingMap[u.id]
                      ? 'bg-bg-secondary border border-border text-text-secondary'
                      : 'bg-primary text-white'
                  }`}
                >
                  {followingMap[u.id] ? '已关注' : '关注'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
