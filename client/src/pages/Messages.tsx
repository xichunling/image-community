import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { conversationsApi } from '../api'
import type { Conversation } from '../types'
import { useUser } from '../contexts/UserContext'

export default function Messages() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const { user } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) return
    conversationsApi.list(user.id).then(setConversations)
  }, [user])

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px]">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-bg to-bg-secondary px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">消息</h1>
      </div>

      <div className="px-4 space-y-2 mt-2">
        {conversations.length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl">💬</div>
            <p className="text-sm text-text-secondary mt-3">还没有消息</p>
            <p className="text-xs text-text-secondary mt-1">去作品详情页找共创伙伴交流吧</p>
          </div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => navigate(`/chat/${conv.id}`)}
            className="flex items-center gap-3 bg-bg-card rounded-xl p-3 cursor-pointer hover:scale-[1.01] transition-transform"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${
              conv.displayName === '系统通知' ? 'bg-accent/20' : conv.type === 'private' ? 'bg-primary/20' : 'bg-accent/20'
            }`}>
              {conv.displayName === '系统通知' ? '🔔' : conv.type === 'private' ? (conv.displayAvatar || '👤') : '👥'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {conv.displayName || conv.title || '会话'}
                {conv.type === 'group' && <span className="ml-1.5 text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">共创群</span>}
              </div>
              <div className="text-xs text-text-secondary truncate mt-0.5">
                {conv.last_sender ? `${conv.last_sender}: ` : ''}{conv.last_message || '暂无消息'}
              </div>
            </div>
            <div className="text-[10px] text-text-secondary shrink-0">
              {conv.members ? `${conv.members.length}人` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
