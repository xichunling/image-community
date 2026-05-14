import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { conversationsApi } from '../api'
import type { Message, User, Conversation } from '../types'
import { useUser } from '../contexts/UserContext'
import BackHeader from '../components/BackHeader'
import UserAvatar from '../components/UserAvatar'

export default function Chat() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [members, setMembers] = useState<User[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!id) return
    const data = await conversationsApi.getMessages(Number(id))
    setConversation(data.conversation)
    setMembers(data.members)
    setMessages(data.messages)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || !id) return
    await conversationsApi.sendMessage(Number(id), { content: input.trim() })
    setInput('')
    load()
  }

  const title = conversation?.type === 'private'
    ? members.find((m) => m.id !== user?.id)?.nickname ?? '私聊'
    : conversation?.title ?? '群聊'

  return (
    <div className="pb-0 md:max-w-[700px] md:mx-auto">
      <BackHeader title={title} />

      <div className="px-4 pb-16 min-h-[calc(100vh-60px)]">
        {conversation?.type === 'group' && conversation.work_id && (
          <div className="text-center text-xs text-text-secondary py-2 bg-bg-secondary rounded-lg mb-3">
            共创群聊 · {members.length}人
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => {
            if (msg.msg_type === 'system') {
              let parsed: any = null
              try { parsed = JSON.parse(msg.content) } catch {}
              if (parsed?.type === 'comment_notify') {
                return (
                  <div key={msg.id} onClick={() => navigate(`/work/${parsed.workId}?comment=${parsed.commentId}`)} className="text-center cursor-pointer">
                    <div className="inline-block bg-bg-secondary rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-primary/10 transition-colors">
                      <span className="text-primary font-medium">{parsed.commenterName}</span> 评论了你的作品「{parsed.workTitle}」：{parsed.text}
                    </div>
                  </div>
                )
              }
              return (
                <div key={msg.id} className="text-center">
                  <span className="text-[10px] text-text-secondary bg-bg-secondary px-2 py-1 rounded">{msg.content}</span>
                </div>
              )
            }
            const isMine = msg.sender_id === user?.id
            return (
              <div key={msg.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                <div className="shrink-0">
                  <UserAvatar avatar={msg.sender_avatar} nickname={msg.sender_name} size="sm" />
                </div>
                <div className={`max-w-[70%] ${isMine ? 'text-right' : ''}`}>
                  <div className="text-[10px] text-text-secondary">{msg.sender_name}</div>
                  <div className={`inline-block mt-0.5 px-3 py-2 rounded-xl text-sm ${
                    isMine ? 'bg-primary text-white rounded-tr-sm' : 'bg-bg-card text-text rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] md:max-w-[700px] bg-bg-card border-t border-border flex gap-2 p-3 z-40">
        <input
          className="flex-1 bg-bg-secondary border border-border rounded-full px-4 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
          placeholder="输入消息..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} className="px-5 py-2 bg-primary rounded-full text-sm text-white hover:bg-primary-light transition-colors">发送</button>
      </div>
    </div>
  )
}
