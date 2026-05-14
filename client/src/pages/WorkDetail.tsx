import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { worksApi, bookmarksApi, commentsApi, followsApi, subscriptionsApi } from '../api'
import type { WorkDetail as WorkDetailType, WorkPage, Comment, PageLikeInfo, BranchWork } from '../types'
import { useUser } from '../contexts/UserContext'
import BackHeader from '../components/BackHeader'
import CommentSection from '../components/CommentSection'
import UserAvatar from '../components/UserAvatar'
import LazyImage from '../components/LazyImage'
import SharePoster from '../components/SharePoster'

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const highlightCommentId = searchParams.get('comment') ? Number(searchParams.get('comment')) : undefined
  const startFromPage = Number(searchParams.get('from_page')) || 0
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const navigate = useNavigate()
  const { user } = useUser()
  const [work, setWork] = useState<WorkDetailType | null>(null)
  const [pages, setPages] = useState<WorkPage[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [followingMap, setFollowingMap] = useState<Record<number, boolean>>({})
  const [followLoading, setFollowLoading] = useState<Record<number, boolean>>({})
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subLoading, setSubLoading] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [pageLikes, setPageLikes] = useState<PageLikeInfo[]>([])
  const [expandedBranches, setExpandedBranches] = useState<Record<number, BranchWork[]>>({})
  const [branchCounts, setBranchCounts] = useState<Record<number, number>>({})
  const [loadingBranches, setLoadingBranches] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([
      worksApi.getById(Number(id)),
      worksApi.getPages(Number(id)),
      commentsApi.list(Number(id)),
      worksApi.getPageLikes(Number(id)),
    ]).then(([w, p, c, likes]) => {
      setWork(w)
      setPages(p)
      setComments(c)
      setPageLikes(likes)
      setExpandedBranches({})
      setBranchCounts({})
    })
    if (user) {
      subscriptionsApi.check(Number(id)).then((s) => setIsSubscribed(s.subscribed)).catch(() => {})
    }
  }, [id, user])

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

  const handleSubscribe = async () => {
    if (!user || !work) { navigate('/login'); return }
    setSubLoading(true)
    try {
      if (isSubscribed) {
        await subscriptionsApi.unsubscribe(work.id)
        setIsSubscribed(false)
      } else {
        await subscriptionsApi.subscribe(work.id)
        setIsSubscribed(true)
      }
    } catch (err: any) {
      // ignore
    } finally {
      setSubLoading(false)
    }
  }

  // 跳转到指定页（从分支进入时）
  useEffect(() => {
    if (startFromPage > 0 && pages.length > 0) {
      const targetPage = startFromPage + 1
      setTimeout(() => {
        const el = pageRefs.current[targetPage]
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [startFromPage, pages])

  // 加载各页分支数量
  useEffect(() => {
    if (!id || pages.length === 0) return
    const counts: Record<number, number> = {}
    Promise.all(
      pages.map(p =>
        worksApi.getBranches(Number(id), p.page_number).then(branches => {
          if (branches.length > 0) counts[p.page_number] = branches.length
        })
      )
    ).then(() => setBranchCounts(counts))
  }, [id, pages])

  const handleLikeWork = useCallback(async () => {
    if (!work) return
    if (!user) { navigate('/login'); return }
    const res = await worksApi.likeWork(work.id)
    setWork(prev => prev ? { ...prev, liked: res.liked, like_count: (prev.like_count || 0) + (res.liked ? 1 : -1) } : prev)
  }, [work, user, navigate])

  const handleLikePage = useCallback(async (pageId: number) => {
    if (!user) { navigate('/login'); return }
    const res = await worksApi.likePage(pageId)
    setPageLikes(prev => prev.map(p =>
      p.page_id === pageId
        ? { ...p, liked: res.liked, like_count: p.like_count + (res.liked ? 1 : -1) }
        : p
    ))
  }, [user, navigate])

  const toggleBranches = useCallback(async (pageNumber: number) => {
    if (!id) return
    if (expandedBranches[pageNumber]) {
      setExpandedBranches(prev => {
        const next = { ...prev }
        delete next[pageNumber]
        return next
      })
      return
    }
    setLoadingBranches(pageNumber)
    try {
      const branches = await worksApi.getBranches(Number(id), pageNumber)
      setExpandedBranches(prev => ({ ...prev, [pageNumber]: branches }))
    } finally {
      setLoadingBranches(null)
    }
  }, [id, expandedBranches])

  const addToShelf = async () => {
    if (!work) return
    if (!user) { navigate('/login'); return }
    const check = await bookmarksApi.check(work.id)
    if (check.bookmarked) { alert('已在书架中'); return }
    await bookmarksApi.create({ work_id: work.id })
    alert('已加入书架')
  }

  const handleDeleteWork = async () => {
    if (!work || !confirm('确定删除此作品？删除后无法恢复。')) return
    try {
      await worksApi.delete(work.id)
      navigate('/profile')
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  if (!work) return <div className="p-4 text-text-secondary">加载中...</div>

  const getPageLike = (pageId: number) => pageLikes.find(p => p.page_id === pageId)

  const renderPageActions = (page: WorkPage) => {
    const pl = getPageLike(page.id)
    const branchCount = branchCounts[page.page_number] || 0
    const isExpanded = !!expandedBranches[page.page_number]

    return (
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border/50">
        {/* 点亮 */}
        <button
          onClick={() => handleLikePage(page.id)}
          className={`flex items-center gap-1 text-xs transition-colors ${pl?.liked ? 'text-amber-400' : 'text-text-secondary hover:text-amber-400'}`}
        >
          <span>{pl?.liked ? '🔥' : '✨'}</span>
          <span>{pl?.like_count || 0}</span>
        </button>

        {/* 分支 */}
        {branchCount > 0 && (
          <button
            onClick={() => toggleBranches(page.page_number)}
            disabled={loadingBranches === page.page_number}
            className={`flex items-center gap-1 text-xs transition-colors ${isExpanded ? 'text-primary' : 'text-text-secondary hover:text-primary'}`}
          >
            <span>🌿</span>
            <span>{branchCount}个分支</span>
          </button>
        )}

        {/* 分叉创作 */}
        {work.allow_fork !== 0 && (
          <button
            onClick={() => user ? navigate(`/fork/${work.id}?from_page=${page.page_number}`) : navigate('/login')}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary transition-colors ml-auto"
          >
            <span>+</span>
            <span>从这里分叉</span>
          </button>
        )}
      </div>
    )
  }

  const renderBranches = (pageNumber: number) => {
    const branches = expandedBranches[pageNumber]
    if (!branches || branches.length === 0) return null

    return (
      <div className="mx-4 mb-3 p-3 bg-bg-secondary/50 rounded-xl border border-border/50 space-y-2">
        <div className="text-xs text-text-secondary mb-1">从第{pageNumber}页分叉的故事线：</div>
        {branches.map(b => (
          <div
            key={b.id}
            onClick={() => navigate(`/work/${b.id}?from_page=${b.fork_from_page}`)}
            className="flex items-center gap-3 bg-bg-card p-2.5 rounded-lg cursor-pointer hover:border-primary border border-transparent transition-colors"
          >
            <UserAvatar avatar={b.creator_avatar} nickname={b.creator_name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{b.title}</div>
              <div className="text-[10px] text-text-secondary">{b.creator_name} · {b.page_count}页</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const pagesContent = (
    <div>
      <h3 className="text-sm font-semibold mb-3">
        {work.type === 'novel' ? `正文 (${pages.length}章)` : `分镜内容 (${pages.length}页)`}
      </h3>
      <div className="space-y-3">
        {pages.map((page) => (
          <div key={page.id} ref={el => { pageRefs.current[page.page_number] = el }}>
            <div className="bg-bg-card rounded-xl overflow-hidden">
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
                    <LazyImage src={page.image_url} alt={`第${page.page_number}页`} className="w-full min-h-[120px]" />
                  ) : (
                    <div className="bg-gradient-to-br from-bg-secondary to-bg-card p-4 min-h-[80px] flex items-center text-sm">
                      {page.description}
                    </div>
                  )}
                  <div className="px-4 py-2">
                    <div className="text-[10px] text-text-secondary">第{page.page_number}页</div>
                    {page.description && (
                      <div className="text-xs text-text-secondary mt-0.5">{page.description}</div>
                    )}
                  </div>
                </>
              )}
              {renderPageActions(page)}
            </div>
            {renderBranches(page.page_number)}
          </div>
        ))}
      </div>
    </div>
  )

  const infoContent = (
    <div className="space-y-5">
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

      <div>
        <div className="text-xs text-text-secondary mb-2">共创者 ({work.contributors.length}人)</div>
        <div className="flex flex-wrap gap-2">
          {work.contributors.map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 bg-bg-card px-2.5 py-1 rounded-full text-xs cursor-pointer" onClick={() => navigate(`/user/${c.id}`)}>
              <UserAvatar avatar={c.avatar} nickname={c.nickname} size="sm" />
              <span>{c.nickname}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                c.role === 'creator' ? 'bg-primary/20 text-primary-light' : 'bg-accent/20 text-accent'
              }`}>
                {c.role === 'creator' ? '创作者' : '上游作者'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* 点赞 */}
        <button
          onClick={handleLikeWork}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm border transition-colors ${
            work.liked
              ? 'bg-accent-pink/10 border-accent-pink/30 text-accent-pink'
              : 'bg-bg-card border-border hover:border-accent-pink text-text-secondary'
          }`}
        >
          <span>{work.liked ? '❤️' : '🤍'}</span>
          <span>{work.like_count || 0}</span>
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
          onClick={() => setShowShare(true)}
          className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors"
        >
          分享
        </button>
      </div>
      {user && user.id === work.creator_id && (
        <button
          onClick={handleDeleteWork}
          className="w-full py-2.5 bg-bg-card border border-accent-pink/30 rounded-lg text-sm text-accent-pink hover:bg-accent-pink/10 transition-colors"
        >
          删除作品
        </button>
      )}

      <CommentSection workId={work.id} comments={comments} highlightId={highlightCommentId} />
    </div>
  )

  return (
    <div className="pb-20 md:pb-6">
      <BackHeader title={work.title} />

      {/* Mobile: vertical layout */}
      <div className="md:hidden px-4 space-y-5">
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
        <div>
          <div className="text-xs text-text-secondary mb-2">共创者 ({work.contributors.length}人)</div>
          <div className="flex flex-wrap gap-2">
            {work.contributors.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 bg-bg-card px-2.5 py-1 rounded-full text-xs cursor-pointer" onClick={() => navigate(`/user/${c.id}`)}>
                <UserAvatar avatar={c.avatar} nickname={c.nickname} size="sm" />
                <span>{c.nickname}</span>
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
        {/* 点赞按钮 - 移动端 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleLikeWork}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border transition-colors ${
              work.liked
                ? 'bg-accent-pink/10 border-accent-pink/30 text-accent-pink'
                : 'bg-bg-card border-border hover:border-accent-pink text-text-secondary'
            }`}
          >
            <span>{work.liked ? '❤️' : '🤍'}</span>
            <span>{work.like_count || 0} 赞</span>
          </button>
        </div>
        {pagesContent}
        <div className="flex gap-2">
          {work.allow_fork !== 0 && (
            <button
              onClick={() => user ? navigate(`/fork/${work.id}`) : navigate('/login')}
              className="flex-1 py-2.5 bg-primary rounded-lg text-sm text-white hover:bg-primary-light transition-colors"
            >
              续写此作品
            </button>
          )}
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
            onClick={() => setShowShare(true)}
            className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors"
          >
            分享
          </button>
          <button
            onClick={handleSubscribe}
            disabled={subLoading}
            className={`flex-1 py-2.5 rounded-lg text-sm transition-colors ${
              isSubscribed
                ? 'bg-bg-card border border-border hover:text-accent-pink'
                : 'bg-bg-card border border-border hover:border-primary'
            }`}
          >
            {isSubscribed ? '已订阅' : '订阅'}
          </button>
        </div>
        {user && user.id === work.creator_id && (
          <button
            onClick={handleDeleteWork}
            className="w-full py-2.5 bg-bg-card border border-accent-pink/30 rounded-lg text-sm text-accent-pink hover:bg-accent-pink/10 transition-colors"
          >
            删除作品
          </button>
        )}
        <CommentSection workId={work.id} comments={comments} highlightId={highlightCommentId} />
      </div>

      {/* PC: left-right layout */}
      <div className="hidden md:flex gap-6 px-6">
        <div className="w-[60%] max-h-[calc(100vh-80px)] overflow-y-auto pr-2">
          {pagesContent}
        </div>
        <div className="w-[40%] max-h-[calc(100vh-80px)] overflow-y-auto">
          {infoContent}
        </div>
      </div>

      {showShare && (
        <SharePoster
          title={work.title}
          description={work.description}
          coverImage={work.cover_image || undefined}
          creatorName={work.creator_name || ''}
          workUrl={`${window.location.origin}${window.location.pathname}#/work/${work.id}`}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}
