import { useNavigate } from 'react-router-dom'
import type { Work } from '../types'
import UserAvatar from './UserAvatar'
import LazyImage from './LazyImage'

const gradients = [
  'from-cover-1 to-cover-2',
  'from-cover-3 to-cover-6',
  'from-cover-4 to-cover-1',
  'from-cover-5 to-cover-4',
  'from-cover-6 to-cover-3',
  'from-cover-7 to-cover-1',
  'from-cover-2 to-cover-7',
]

export default function WorkCard({ work, index, onClick }: { work: Work; index: number; onClick: () => void }) {
  const navigate = useNavigate()
  const gradient = gradients[index % gradients.length]

  return (
    <div onClick={onClick} className="rounded-xl overflow-hidden bg-bg-card cursor-pointer hover:scale-[1.02] transition-transform">
      {work.cover_image ? (
        <div className="h-40 relative">
          <LazyImage src={work.cover_image} alt={work.title} className="w-full h-full" />
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60">
            <div className="flex gap-1.5">
              <span className="bg-black/30 text-white text-[10px] px-2 py-0.5 rounded-full">
                {work.type === 'comic' ? '漫画' : work.type === 'novel' ? '小说' : '短剧'}
              </span>
              {work.parent_work_id && (
                <span className="bg-accent/30 text-white text-[10px] px-2 py-0.5 rounded-full">续写</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={`h-40 bg-gradient-to-br ${gradient} p-3 flex flex-col justify-between relative`}>
          <p className="text-white/80 text-xs line-clamp-2">{work.description.substring(0, 40)}...</p>
          <div className="flex gap-1.5">
            <span className="bg-black/30 text-white text-[10px] px-2 py-0.5 rounded-full">
              {work.type === 'comic' ? '漫画' : work.type === 'novel' ? '小说' : '短剧'}
            </span>
            {work.parent_work_id && (
              <span className="bg-accent/30 text-white text-[10px] px-2 py-0.5 rounded-full">续写</span>
            )}
          </div>
        </div>
      )}
      <div className="p-3">
        {work.subtitle && work.parent_work_id ? (
          <div>
            <div className="text-[10px] text-text-secondary truncate">{work.title.replace(`：${work.subtitle}`, '')}</div>
            <div className="text-sm font-semibold truncate">{work.subtitle}</div>
          </div>
        ) : (
          <div className="text-sm font-semibold truncate">{work.title}</div>
        )}
        {work.description && (
          <div className="text-xs text-text-secondary mt-1 line-clamp-2">{work.description}</div>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-text-secondary" onClick={(e) => { e.stopPropagation(); navigate(`/user/${work.creator_id}`) }}>
          <UserAvatar avatar={work.creator_avatar} nickname={work.creator_name || ''} size="sm" />
          <span className="hover:text-primary cursor-pointer">{work.creator_name}</span>
        </div>
        <div className="flex gap-3 mt-1.5 text-xs text-text-secondary">
          <span>🔀 {work.fork_count ?? 0} 续写</span>
          <span>💬 {work.comment_count ?? 0} 评论</span>
        </div>
      </div>
    </div>
  )
}
