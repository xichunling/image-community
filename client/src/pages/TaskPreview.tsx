import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { tasksApi, aiApi, uploadApi } from '../api'
import BackHeader from '../components/BackHeader'
import LazyImage from '../components/LazyImage'

export default function TaskPreview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [desc, setDesc] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [coverLoading, setCoverLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [allowFork, setAllowFork] = useState(true)
  const coverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!id) return
    tasksApi.getById(Number(id)).then((t) => {
      setTask(t)
      if (t.result) {
        setTitle(t.result.title || '')
        setSubtitle(t.result.title || '')
        setDesc(t.result.hookDescription || t.result.description || '')
      }
    })
  }, [id])

  const handleGenerateCover = async () => {
    if (!task?.result?.coverPrompt) { alert('无封面提示词'); return }
    setCoverLoading(true)
    try {
      const inputParams = task.input_params
      // 判断是否有自定义 imageConfig
      let data: any = { coverPrompt: task.result.coverPrompt, style: inputParams?.style || '' }
      if (inputParams?.imageConfig) {
        // 自定义模式 — 需重新获取完整 config
        const config = await aiApi.getConfig()
        data.customConfig = { baseUrl: config.image_base_url, apiKey: config.image_api_key, model: config.image_model }
      } else if (inputParams?.imageProvider) {
        data.provider = inputParams.imageProvider
      } else {
        // fallback: 使用平台默认图片 provider
        const providers = await aiApi.getProviders()
        if (providers.imageProviders.length > 0) {
          data.provider = providers.imageProviders[0]!.id
        }
      }
      const res = await aiApi.generateCover(data)
      setCoverImage(res.cover_image)
    } catch (err: any) {
      alert(err.message || '封面生成失败')
    } finally {
      setCoverLoading(false)
    }
  }

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await uploadApi.image(file)
      setCoverImage(res.url)
    } catch (err: any) {
      alert(err.message || '上传失败')
    }
  }

  const handlePublish = async () => {
    if (!id) return
    if (!coverImage) {
      if (!confirm('生成或上传封面图可以更好地吸引读者，确定不添加封面直接发布吗？')) return
    }
    setPublishing(true)
    try {
      const isFork = !!task?.input_params?.parentWorkId
      const res = await tasksApi.publish(Number(id), {
        title: isFork ? undefined : title,
        subtitle: isFork ? subtitle : undefined,
        description: desc,
        cover_image: coverImage || undefined,
        allow_fork: allowFork ? 1 : 0,
      })
      navigate(`/work/${res.id}`)
    } catch (err: any) {
      alert(err.message || '发布失败')
    } finally {
      setPublishing(false)
    }
  }

  const handleCancel = useCallback(async () => {
    if (!id || !confirm('确定取消生成？已产生的消耗仍会扣除积分。')) return
    setCancelling(true)
    try {
      await tasksApi.cancel(Number(id))
      setTask((prev: any) => prev ? { ...prev, status: 'cancelled' } : prev)
    } catch (err: any) {
      alert(err.message || '取消失败')
    } finally {
      setCancelling(false)
    }
  }, [id])

  const handleDelete = useCallback(async () => {
    if (!id || !confirm('确定删除此任务？')) return
    try {
      await tasksApi.delete(Number(id))
      navigate('/profile')
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }, [id, navigate])

  const handleRegenerate = useCallback(async () => {
    if (!id || !confirm('确定重新生成？将创建新任务。')) return
    try {
      const res = await tasksApi.regenerate(Number(id))
      navigate(`/task/${res.taskId}`)
    } catch (err: any) {
      alert(err.message || '重新生成失败')
    }
  }, [id, navigate])

  if (!task) return <div className="p-4 text-text-secondary">加载中...</div>

  if (task.status === 'generating') {
    return (
      <div className="pb-20">
        <BackHeader title="创作任务" />
        <div className="px-4 py-12 text-center">
          <div className="text-4xl animate-pulse mb-4">⏳</div>
          <div className="text-sm text-text-secondary mb-6">正在生成中，请稍后再来查看...</div>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="px-6 py-2.5 bg-accent-pink/10 border border-accent-pink/30 rounded-lg text-sm text-accent-pink hover:bg-accent-pink/20 transition-colors disabled:opacity-50"
          >
            {cancelling ? '取消中...' : '取消生成'}
          </button>
        </div>
      </div>
    )
  }

  if (task.status === 'failed') {
    return (
      <div className="pb-20">
        <BackHeader title="创作任务" />
        <div className="px-4 py-12 text-center">
          <div className="text-4xl mb-4">❌</div>
          <div className="text-sm text-accent-pink mb-6">{task.error || '生成失败'}</div>
          <div className="flex gap-3 justify-center">
            <button onClick={handleRegenerate} className="px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg text-sm text-primary hover:bg-primary/20 transition-colors">
              重新生成
            </button>
            <button onClick={handleDelete} className="px-4 py-2.5 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary hover:border-accent-pink transition-colors">
              删除任务
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (task.status === 'cancelled') {
    return (
      <div className="pb-20">
        <BackHeader title="创作任务" />
        <div className="px-4 py-12 text-center">
          <div className="text-4xl mb-4">🚫</div>
          <div className="text-sm text-text-secondary mb-2">任务已取消</div>
          {task.credits_used > 0 && (
            <div className="text-xs text-text-secondary mb-6">已消耗 {task.credits_used} 积分（部分生成）</div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={handleRegenerate} className="px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-lg text-sm text-primary hover:bg-primary/20 transition-colors">
              重新生成
            </button>
            <button onClick={handleDelete} className="px-4 py-2.5 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary hover:border-accent-pink transition-colors">
              删除任务
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pages = task.result?.pages || []

  return (
    <div className="pb-20">
      <BackHeader title="预览并发布" />
      <div className="px-4 space-y-4">
        {/* 封面图 */}
        <div>
          <label className="text-xs text-text-secondary">封面海报（可选）</label>
          <input type="file" accept="image/*" ref={coverInputRef} className="hidden" onChange={handleUploadCover} />
          {coverImage ? (
            <div className="mt-2 relative rounded-xl overflow-hidden">
              <LazyImage src={coverImage} alt="封面" className="w-full h-48" />
              <div className="absolute top-2 right-2 flex gap-1.5">
                <button onClick={() => coverInputRef.current?.click()} className="px-2 py-1 bg-black/50 text-white text-[10px] rounded">更换</button>
                <button onClick={() => setCoverImage('')} className="px-2 py-1 bg-black/50 text-white text-[10px] rounded">移除</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleGenerateCover}
                disabled={coverLoading}
                className="flex-1 py-2.5 bg-primary/10 border border-primary/30 rounded-lg text-xs text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {coverLoading ? '生成中...' : 'AI 生成封面'}
              </button>
              <button
                onClick={() => coverInputRef.current?.click()}
                className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-xs text-text-secondary hover:border-primary transition-colors"
              >
                上传封面
              </button>
            </div>
          )}
        </div>

        {task?.input_params?.parentWorkId ? (
          <div>
            <label className="text-xs text-text-secondary">副标题（主标题继承自父作品）</label>
            <div className="flex items-center gap-0 mt-1">
              <span className="shrink-0 bg-bg-secondary border border-border border-r-0 rounded-l-lg px-3 py-2 text-sm text-text-secondary truncate max-w-[40%]">{task.input_params.parentTitle || ''}：</span>
              <input className="flex-1 bg-bg-card border border-border rounded-r-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="你的故事线名称" />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-text-secondary">作品标题</label>
            <input className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
        <div>
          <label className="text-xs text-text-secondary">作品简介（展示给读者的推荐语）</label>
          <textarea className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary resize-none" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>

        {task.credits_used > 0 && (
          <div className="text-xs text-text-secondary">本次生成消耗 {task.credits_used} 积分</div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2">
            {task.type === 'novel' ? `章节内容 (${pages.length}章)` : `分镜内容 (${pages.length}页)`}
          </h3>
          <div className="space-y-2">
            {pages.map((page: any, i: number) => (
              <div key={i} className="bg-bg-card rounded-xl overflow-hidden">
                {task.type === 'novel' ? (
                  <div className="p-3">
                    {page.dialogue && <div className="text-sm font-semibold mb-1">第{i + 1}章 {page.dialogue}</div>}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-text-secondary">{page.description}</div>
                  </div>
                ) : (
                  <>
                    {page.image_url && <img src={page.image_url} alt={`第${i + 1}页`} className="w-full" />}
                    <div className="p-3">
                      <div className="text-[10px] text-text-secondary">第{page.pageNumber}页</div>
                      {page.dialogue && <div className="text-sm text-primary-light mt-0.5">"{page.dialogue}"</div>}
                      <div className="text-xs text-text-secondary mt-1">{page.description}</div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-bg-card border border-border rounded-lg px-3 py-2.5">
          <div>
            <div className="text-sm">允许共创</div>
            <div className="text-[10px] text-text-secondary">其他用户可以从任意分页分叉续写</div>
          </div>
          <button
            onClick={() => setAllowFork(!allowFork)}
            className={`w-10 h-5.5 rounded-full transition-colors relative ${allowFork ? 'bg-primary' : 'bg-border'}`}
          >
            <div className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${allowFork ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button onClick={handlePublish} disabled={publishing || coverLoading} className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors disabled:opacity-50">
          {publishing ? '发布中...' : coverLoading ? '封面生成中，请稍候...' : '确认发布'}
        </button>
        <div className="flex gap-2">
          <button onClick={handleRegenerate} className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-text-secondary hover:border-primary transition-colors">
            重新生成
          </button>
          <button onClick={handleDelete} className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm text-accent-pink hover:border-accent-pink transition-colors">
            删除任务
          </button>
        </div>
      </div>
    </div>
  )
}
