import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usersApi, followsApi, conversationsApi } from '../api'
import type { Work } from '../types'
import { useUser } from '../contexts/UserContext'
import BackHeader from '../components/BackHeader'
import WorkCard from '../components/WorkCard'
import FollowListModal from '../components/FollowListModal'
import UserAvatar from '../components/UserAvatar'

interface UserInfo {
  id: number
  username: string
  nickname: string
  avatar: string
  bio: string
  followerCount: number
  followingCount: number
}

export default function UserProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useUser()
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [works, setWorks] = useState<Work[]>([])
  const [isFollowing, setIsFollowing] = useState(false)
  const [isMutual, setIsMutual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null)

  const isMe = currentUser && id && currentUser.id === Number(id)

  useEffect(() => {
    if (!id) return
    usersApi.getById(Number(id)).then(setUserInfo as any).catch(() => {})
    usersApi.getWorks(Number(id)).then(setWorks).catch(() => {})
    if (currentUser && !isMe) {
      followsApi.status(Number(id)).then((s) => {
        setIsFollowing(s.isFollowing)
        setIsMutual(s.isMutual)
      }).catch(() => {})
    }
  }, [id, currentUser])

  const handleDM = async () => {
    if (!id || !currentUser) { navigate('/login'); return }
    try {
      const res = await conversationsApi.create(Number(id))
      navigate(`/chat/${res.conversation_id}`)
    } catch (err: any) {
      alert(err.message || '操作失败')
    }
  }

  const handleFollow = async () => {
    if (!id || !currentUser) { navigate('/login'); return }
    setLoading(true)
    try {
      if (isFollowing) {
        await followsApi.unfollow(Number(id))
        setIsFollowing(false)
        setIsMutual(false)
        if (userInfo) setUserInfo({ ...userInfo, followerCount: userInfo.followerCount - 1 })
      } else {
        await followsApi.follow(Number(id))
        setIsFollowing(true)
        if (userInfo) setUserInfo({ ...userInfo, followerCount: userInfo.followerCount + 1 })
        // 重新检查互关
        const s = await followsApi.status(Number(id))
        setIsMutual(s.isMutual)
      }
    } catch (err: any) {
      alert(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  if (!userInfo) return <div className="p-4 text-text-secondary">加载中...</div>

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
      <BackHeader title={userInfo.nickname} />
      <div className="px-4 space-y-4">
        {/* 用户卡片 */}
        <div className="bg-bg-card rounded-2xl p-5 text-center">
          <div className="flex justify-center"><UserAvatar avatar={userInfo.avatar} nickname={userInfo.nickname} size="lg" /></div>
          <div className="text-lg font-bold mt-2">{userInfo.nickname}</div>
          <div className="text-xs text-text-secondary mt-1">{userInfo.bio}</div>
          <div className="text-[10px] text-text-secondary mt-1">@{userInfo.username}</div>

          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <div className="text-xl font-bold">{works.length}</div>
              <div className="text-[10px] text-text-secondary">作品</div>
            </div>
            <button
              className="text-center hover:opacity-80 transition-opacity"
              onClick={() => setShowFollowList('followers')}
            >
              <div className="text-xl font-bold">{userInfo.followerCount}</div>
              <div className="text-[10px] text-text-secondary">粉丝</div>
            </button>
            <button
              className="text-center hover:opacity-80 transition-opacity"
              onClick={() => setShowFollowList('following')}
            >
              <div className="text-xl font-bold">{userInfo.followingCount}</div>
              <div className="text-[10px] text-text-secondary">关注</div>
            </button>
          </div>

          {!isMe && (
            <div className="mt-4 flex gap-2 justify-center">
              <button
                onClick={handleFollow}
                disabled={loading}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isFollowing
                    ? 'bg-bg-secondary border border-border text-text-secondary hover:text-accent-pink'
                    : 'bg-primary text-white hover:bg-primary-light'
                }`}
              >
                {isMutual ? '互相关注' : isFollowing ? '已关注' : '关注'}
              </button>
              <button
                onClick={handleDM}
                className="px-6 py-2 rounded-lg text-sm font-medium bg-bg-secondary border border-border text-text-secondary hover:border-primary hover:text-primary transition-colors"
              >
                私信
              </button>
            </div>
          )}

          {isMe && (
            <button onClick={() => navigate('/profile')} className="mt-4 px-6 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary">
              我的主页
            </button>
          )}
        </div>

        {/* 作品列表 */}
        <h3 className="text-sm font-semibold">TA的作品</h3>
        {works.length === 0 && <p className="text-xs text-text-secondary">还没有作品</p>}
        <div className="grid grid-cols-2 gap-3">
          {works.map((w, i) => (
            <WorkCard key={w.id} work={w} index={i} onClick={() => navigate(`/work/${w.id}`)} />
          ))}
        </div>
      </div>

      {showFollowList && id && (
        <FollowListModal
          userId={Number(id)}
          type={showFollowList}
          onClose={() => setShowFollowList(null)}
        />
      )}
    </div>
  )
}
