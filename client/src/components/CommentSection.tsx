import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Comment } from '../types'
import { commentsApi } from '../api'
import { useUser } from '../contexts/UserContext'
import UserAvatar from './UserAvatar'

export default function CommentSection({ workId, comments: initialComments, highlightId }: { workId: number; comments: Comment[]; highlightId?: number }) {
  const { user } = useUser()
  const navigate = useNavigate()
  const [comments, setComments] = useState(initialComments)
  const [content, setContent] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: number; nickname: string } | null>(null)

  useEffect(() => {
    if (highlightId) {
      setTimeout(() => {
        document.getElementById(`comment-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }, [highlightId])

  const submit = async () => {
    if (!content.trim()) return
    await commentsApi.create(workId, { content: content.trim(), parent_id: replyTo?.id })
    const updated = await commentsApi.list(workId)
    setComments(updated)
    setContent('')
    setReplyTo(null)
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">评论 ({comments.length})</h3>
      {comments.length === 0 && <p className="text-xs text-text-secondary">暂无评论</p>}
      {comments.map((c) => (
        <div
          key={c.id}
          id={`comment-${c.id}`}
          className={`flex gap-2.5 ${highlightId === c.id ? 'bg-primary/10 rounded-lg p-2 -mx-2' : ''}`}
        >
          <div className="shrink-0 cursor-pointer" onClick={() => navigate(`/user/${c.user_id}`)}>
            <UserAvatar avatar={c.avatar} nickname={c.nickname} size="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium cursor-pointer hover:text-primary" onClick={() => navigate(`/user/${c.user_id}`)}>{c.nickname}</span>
              <span className="text-[10px] text-text-secondary">{new Date(c.created_at).toLocaleDateString()}</span>
            </div>
            {c.reply_to_name && (
              <span className="text-[10px] text-primary">回复 @{c.reply_to_name}</span>
            )}
            <div className="text-xs text-text-secondary mt-0.5">{c.content}</div>
            {user && (
              <button
                onClick={() => setReplyTo({ id: c.id, nickname: c.nickname })}
                className="text-[10px] text-text-secondary hover:text-primary mt-1"
              >
                回复
              </button>
            )}
          </div>
        </div>
      ))}
      {user ? (
        <div className="pt-2">
          {replyTo && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-primary">回复 @{replyTo.nickname}</span>
              <button onClick={() => setReplyTo(null)} className="text-[10px] text-text-secondary hover:text-accent-pink">取消</button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
              placeholder={replyTo ? `回复 @${replyTo.nickname}...` : '写评论...'}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button onClick={submit} className="px-4 py-2 bg-primary rounded-lg text-sm text-white hover:bg-primary-light transition-colors">
              发送
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-2">
          <button onClick={() => navigate('/login')} className="text-sm text-primary hover:underline">
            登录后评论
          </button>
        </div>
      )}
    </div>
  )
}
