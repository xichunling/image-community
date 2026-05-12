import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { worksApi, bookmarksApi, commentsApi, followsApi } from '../api'
import type { WorkDetail as WorkDetailType, WorkPage, Comment } from '../types'
import { useUser } from '../contexts/UserContext'
import BackHeader from '../components/BackHeader'
import CommentSection from '../components/CommentSection'

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const [work, setWork] = useState<WorkDetailType | null>(null)
  const [pages, setPages] = useState<WorkPage[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [followingMap, setFollowingMap] = useState<Record<number, boolean>>({})
  const [followLoading, setFollowLoading] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (!id) return
    Promise.all([
      worksApi.getById(Number(id)),
      worksApi.getPages(Number(id)),
      commentsApi.list(Number(id)),
    ]).then(([w, p, c]) => {
      setWork(w)
      setPages(p)
      setComments(c)
    })
  }, [id])

  useEffect(() => {
    if (!user || !work) return
    const contribIds = work.contributors.map((c) => c.id).filter((cid) => cid !== user.id)
    if (contribIds.length === 0) return
    Promise.all(contribIds.map((cid) =>
      followsApi.status(cid).then((s) => ({ id: cid, following: s.isFollowing })).catch(() => ({ id: cid, following: false }))
    )).then((results) => {
      const map: Record<number, boolean> = {}
      results.forEach((r) => { map[r.id] = r.following })
      setFollowingMap(map)
    })
  }, [work, user])

  const handleToggleFollow = async (targetId: number) => {
    if (!user) { navigate('/login'); return }
    setFollowLoading((prev) => ({ ...prev, [targetId]: true }))
    try {
      if (followingMap[targetId]) {
        await followsApi.unfollow(targetId)
        setFollowingMap((prev) => ({ ...prev, [targetId]: false }))
      } else {
        await followsApi.follow(targetId)
        setFollowingMap((prev) => ({ ...prev, [targetId]: true }))
      }
    } catch (err: any) {
      // ignore
    } finally {
      setFollowLoading((prev) => ({ ...prev, [targetId]: false }))
    }
  }

  const addToShelf = async () => {
    if (!work) return
    if (!user) { navigate('/login'); return }
    const check = await bookmarksApi.check(work.id)
    if (check.bookmarked) {
      alert('已在书架中')
      return
    }
    await bookmarksApi.create({ work_id: work.id })
    alert('已加入书架')
  }

  if (!work) return <div className="p-4 text-text-secondary">加载中...</div>

  return (
    <div className="pb-20">
      <BackHeader title={work.title} />

      <div className="px-4 space-y-5">
        {/* Hero */}
        <div>
          <h2 className="text-lg font-bold">{work.title}</h2>
          <p className="text-sm text-text-secondary mt-1">{work.description}</p>
          {work.parentWork && (
            <button
              onClick={() => navigate(`/work/${work.parentWork!.id}`)}
              className="text-xs text-primary mt-2 hover:underline"
            >
              续写自「{work.parentWork.title}」by {work.parentWork.creator_name}
            </button>
          )}
        </div>

        {/* Contributors */}
        <div>
          <div className="text-xs text-text-secondary mb-2">共创者 ({work.contributors.length}人)</div>
          <div className="flex flex-wrap gap-2">
            {work.contributors.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 bg-bg-card px-2.5 py-1 rounded-full text-xs">
                <span className="cursor-pointer" onClick={() => navigate(`/user/${c.id}`)}>{c.avatar}</span>
                <span className="cursor-pointer" onClick={() => navigate(`/user/${c.id}`)}>{c.nickname}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  c.role === 'creator' ? 'bg-primary/20 text-primary-light' : 'bg-accent/20 text-accent'
                }`}>
                  {c.role === 'creator' ? '创作者' : '上游作者'}
                </span>
                {user && user.id !== c.id && (
                  <button
                    onClick={() => handleToggleFollow(c.id)}
                    disabled={followLoading[c.id]}
                    className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      followingMap[c.id]
                        ? 'bg-bg-secondary text-text-secondary'
                        : 'bg-primary text-white'
                    }`}
                  >
                    {followingMap[c.id] ? '已关注' : '关注'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pages */}
        <div>
          <h3 className="text-sm font-semibold mb-3">
            {work.type === 'novel' ? `正文 (${pages.length}章)` : `分镜内容 (${pages.length}页)`}
          </h3>
          <div className="space-y-3">
            {pages.map((page) => (
              <div key={page.id} className="bg-bg-card rounded-xl overflow-hidden">
                {work.type === 'novel' ? (
                  <div className="p-4">
                    {page.dialogue && (
                      <div className="text-sm font-semibold mb-2">第{page.page_number}章 {page.dialogue}</div>
                    )}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">{page.description}</div>
                  </div>
                ) : (
                  <>
                    {page.image_url ? (
                      <div className="relative">
                        <img src={page.image_url} alt={`第${page.page_number}页`} className="w-full object-cover" />
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-bg-secondary to-bg-card p-4 min-h-[80px] flex items-center text-sm">
                        {page.description}
                      </div>
                    )}
                    <div className="px-4 py-2">
                      <div className="text-[10px] text-text-secondary">第{page.page_number}页</div>
                      {page.dialogue && (
                        <div className="text-sm text-primary-light mt-0.5">"{page.dialogue}"</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => user ? navigate(`/fork/${work.id}`) : navigate('/login')}
            className="flex-1 py-2.5 bg-primary rounded-lg text-sm text-white hover:bg-primary-light transition-colors"
          >
            续写此作品
          </button>
          <button
            onClick={() => navigate(`/work/${work.id}/tree`)}
            className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors"
          >
            创作树
          </button>
          <button
            onClick={addToShelf}
            className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors"
          >
            加入书架
          </button>
          <button
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#/work/${work.id}`
              navigator.clipboard.writeText(url).then(() => alert('链接已复制，发送给朋友即可打开'))
            }}
            className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors"
          >
            分享
          </button>
        </div>

        {/* Comments */}
        <CommentSection workId={work.id} comments={comments} />
      </div>
    </div>
  )
}
