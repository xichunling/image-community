import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { followsApi } from '../api'
import BackHeader from '../components/BackHeader'
import UserAvatar from '../components/UserAvatar'

interface FollowUser {
  id: number
  nickname: string
  avatar: string
  bio: string
}

export default function FollowList() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isFollowers = location.pathname.endsWith('/followers')
  const [users, setUsers] = useState<FollowUser[]>([])

  useEffect(() => {
    if (!id) return
    const fetch = isFollowers ? followsApi.followers : followsApi.following
    fetch(Number(id)).then(setUsers as any).catch(() => {})
  }, [id, isFollowers])

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
      <BackHeader title={isFollowers ? '粉丝' : '关注'} />
      <div className="px-4 space-y-2">
        {users.length === 0 && <p className="text-sm text-text-secondary text-center py-8">{isFollowers ? '暂无粉丝' : '暂未关注任何人'}</p>}
        {users.map((u) => (
          <div key={u.id} onClick={() => navigate(`/user/${u.id}`)} className="flex items-center gap-3 bg-bg-card rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-transform">
            <UserAvatar avatar={u.avatar} nickname={u.nickname} size="md" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{u.nickname}</div>
              {u.bio && <div className="text-xs text-text-secondary truncate">{u.bio}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
