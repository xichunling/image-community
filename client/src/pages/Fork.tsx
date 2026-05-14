import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { worksApi, uploadApi, aiApi, creditsApi } from '../api'
import type { WorkDetail as WorkDetailType, WorkPage, PageInput, TextProviderInfo, ImageProviderInfo } from '../types'
import BackHeader from '../components/BackHeader'
import PagesEditor from '../components/PagesEditor'
import LazyImage from '../components/LazyImage'


export default function Fork() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const fromPage = Number(searchParams.get('from_page')) || 0
  const navigate = useNavigate()
  const [parentWork, setParentWork] = useState<WorkDetailType | null>(null)
  const [parentPages, setParentPages] = useState<WorkPage[]>([])
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')

  // Manual fields
  const [subtitle, setSubtitle] = useState('')
  const [desc, setDesc] = useState('')
  const [pages, setPages] = useState<PageInput[]>([{ description: '', dialogue: '' }])

  // AI fields
  const [synopsis, setSynopsis] = useState('')
  const [aiPageCount, setAiPageCount] = useState(4)
  const [aiSource, setAiSource] = useState<'platform' | 'custom'>('platform')
  const [textProviders, setTextProviders] = useState<TextProviderInfo[]>([])
  const [imageProviders, setImageProviders] = useState<ImageProviderInfo[]>([])
  const [selectedTextProvider, setSelectedTextProvider] = useState('')
  const [selectedImageProvider, setSelectedImageProvider] = useState('')
  const [customTextBaseUrl, setCustomTextBaseUrl] = useState('')
  const [customTextApiKey, setCustomTextApiKey] = useState('')
  const [customTextModel, setCustomTextModel] = useState('')
  const [customImageBaseUrl, setCustomImageBaseUrl] = useState('')
  const [customImageApiKey, setCustomImageApiKey] = useState('')
  const [customImageModel, setCustomImageModel] = useState('')
  const [credits, setCredits] = useState<number | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([
      worksApi.getById(Number(id)),
      worksApi.getPages(Number(id)),
    ]).then(([w, p]) => {
      setParentWork(w)
      setParentPages(fromPage > 0 ? p.filter(pg => pg.page_number <= fromPage) : p)
    })
  }, [id, fromPage])

  useEffect(() => {
    aiApi.getProviders().then((res) => {
      const realText = res.textProviders.filter(p => p.id !== 'mock-text')
      const realImage = res.imageProviders.filter(p => p.id !== 'mock-image')
      setTextProviders(realText)
      setImageProviders(realImage)
      if (realText[0]) setSelectedTextProvider(realText[0].id)
      if (realImage[0]) setSelectedImageProvider(realImage[0].id)
    }).catch(() => {})
    creditsApi.status().then(s => setCredits(s.credits)).catch(() => {})
    aiApi.getConfig().then(c => {
      if (c.text_base_url) setCustomTextBaseUrl(c.text_base_url)
      if (c.text_api_key) setCustomTextApiKey(c.text_api_key)
      if (c.text_model) setCustomTextModel(c.text_model)
      if (c.image_base_url) setCustomImageBaseUrl(c.image_base_url)
      if (c.image_api_key) setCustomImageApiKey(c.image_api_key)
      if (c.image_model) setCustomImageModel(c.image_model)
    }).catch(() => {})
  }, [])

  const submitManual = async () => {
    if (!subtitle.trim()) return alert('请输入副标题')
    if (!pages[0]?.description.trim()) return alert('请至少填写第一页场景描述')
    if (!id) return
    const result = await worksApi.fork(Number(id), {
      subtitle: subtitle.trim(),
      description: desc.trim(),
      pages,
      fork_from_page: fromPage || undefined,
    })
    navigate(`/work/${result.id}`)
  }

  const submitAI = async () => {
    if (!synopsis.trim()) return alert('请输入续写梗概')
    if (!parentWork) return

    const workType = parentWork.type
    if (aiSource === 'platform') {
      if (!selectedTextProvider || (workType !== 'novel' && !selectedImageProvider)) return alert('请选择生成服务')
    } else {
      if (!customTextBaseUrl || !customTextApiKey || !customTextModel) return alert('请完整填写文字模型配置')
      if (workType !== 'novel' && (!customImageBaseUrl || !customImageApiKey || !customImageModel)) return alert('请完整填写图片模型配置')
    }

    setAiGenerating(true)
    setAiError('')

    try {
      if (aiSource === 'platform') {
        await aiApi.generate({
          synopsis: synopsis.trim(),
          style: 'anime',
          type: workType,
          pageCount: aiPageCount,
          textProvider: selectedTextProvider,
          imageProvider: selectedImageProvider,
          parentWorkId: Number(id),
          forkFromPage: fromPage || undefined,
        } as any)
      } else {
        await aiApi.generateCustom({
          synopsis: synopsis.trim(),
          style: 'anime',
          type: workType,
          pageCount: aiPageCount,
          textConfig: { baseUrl: customTextBaseUrl.trim(), apiKey: customTextApiKey.trim(), model: customTextModel.trim() },
          imageConfig: { baseUrl: customImageBaseUrl.trim(), apiKey: customImageApiKey.trim(), model: customImageModel.trim() },
          parentWorkId: Number(id),
          forkFromPage: fromPage || undefined,
        } as any)
      }
      alert('创作任务已提交，可在个人页查看进度')
      navigate('/profile')
    } catch (err: any) {
      setAiError(err.message || 'AI 生成失败')
      setAiGenerating(false)
    }
  }

  const handleUpload = async (index: number, file: File): Promise<string> => {
    const result = await uploadApi.image(file)
    const updated = [...pages]
    updated[index] = { ...updated[index]!, image_url: result.url }
    setPages(updated)
    return result.url
  }

  if (!parentWork) return <div className="p-4 text-text-secondary">加载中...</div>

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
      <BackHeader title="续写创作" />

      <div className="px-4 space-y-4">
        <div className="bg-bg-card rounded-xl p-3 border border-primary">
          <div className="text-[10px] text-primary-light">
            {fromPage > 0 ? `从第${fromPage}页分叉续写` : '续写自'}
          </div>
          <div className="text-sm font-semibold mt-0.5">「{parentWork.title}」</div>
          <div className="text-xs text-text-secondary mt-0.5">by {parentWork.creator_name}</div>
        </div>

        {/* 原作品内容预览 */}
        {fromPage > 0 && parentPages.length > 0 && (
          <div>
            <div className="text-xs text-text-secondary mb-2">原作品内容（第1~{fromPage}页）</div>
            <div className="space-y-2 opacity-70">
              {parentPages.map(page => (
                <div key={page.id} className="bg-bg-card rounded-lg overflow-hidden">
                  {parentWork.type === 'novel' ? (
                    <div className="p-3">
                      {page.dialogue && <div className="text-xs font-semibold">第{page.page_number}章 {page.dialogue}</div>}
                      <div className="text-xs leading-relaxed whitespace-pre-wrap text-text-secondary mt-1 line-clamp-3">{page.description}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2">
                      {page.image_url && <LazyImage src={page.image_url} alt="" className="w-12 h-12 rounded" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-text-secondary">第{page.page_number}页</div>
                        {page.dialogue && <div className="text-xs text-primary-light truncate">"{page.dialogue}"</div>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="text-center text-xs text-primary mt-2">↓ 从这里开始你的故事 ↓</div>
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${
              mode === 'manual' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
            }`}
          >
            <div className="text-sm font-medium">✍️ 自己续写</div>
            <div className="text-[10px] text-text-secondary mt-0.5">上传图片，编辑分镜和对白</div>
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${
              mode === 'ai' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
            }`}
          >
            <div className="text-sm font-medium">🤖 AI续写</div>
            <div className="text-[10px] text-text-secondary mt-0.5">描述方向，AI帮你续写</div>
          </button>
        </div>

        {mode === 'manual' ? (
          <>
            <div>
              <label className="text-xs text-text-secondary">副标题</label>
              <div className="flex items-center gap-0 mt-1">
                <span className="shrink-0 bg-bg-secondary border border-border border-r-0 rounded-l-lg px-3 py-2 text-sm text-text-secondary">{parentWork.title}：</span>
                <input
                  className="flex-1 bg-bg-card border border-border rounded-r-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="你的故事线名称"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary">续写简介</label>
              <textarea
                className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="你想把故事带向哪个方向？"
              />
            </div>
            <PagesEditor pages={pages} onChange={setPages} showUpload onUploadPage={handleUpload} />
            <button
              onClick={submitManual}
              className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors"
            >
              发布续写
            </button>
          </>
        ) : (
          <>
            {/* AI 来源选择 */}
            <div>
              <label className="text-xs text-text-secondary">AI 服务来源</label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setAiSource('platform')}
                  className={`flex-1 p-2.5 rounded-lg border text-xs text-left transition-colors ${
                    aiSource === 'platform' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
                  }`}
                >
                  <div className="font-medium">🌋 平台能力</div>
                  <div className="text-[10px] text-text-secondary mt-0.5">消耗积分{credits !== null ? `（剩余${credits}）` : ''}</div>
                </button>
                <button
                  onClick={() => setAiSource('custom')}
                  className={`flex-1 p-2.5 rounded-lg border text-xs text-left transition-colors ${
                    aiSource === 'custom' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
                  }`}
                >
                  <div className="font-medium">🔑 自己的API</div>
                  <div className="text-[10px] text-text-secondary mt-0.5">使用你自己的模型接口</div>
                </button>
              </div>
            </div>

            {aiSource === 'platform' ? (
              <>
                {credits !== null && credits < aiPageCount * 100 && (
                  <div className="bg-accent-pink/10 border border-accent-pink/30 rounded-lg p-3 text-xs text-accent-pink">
                    积分不足！生成{aiPageCount}页需要{aiPageCount * 100}积分，当前剩余{credits}积分。
                  </div>
                )}
                {textProviders.length > 1 && (
                  <div>
                    <label className="text-xs text-text-secondary">文字生成服务</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {textProviders.map((p) => (
                        <button key={p.id} onClick={() => setSelectedTextProvider(p.id)} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${selectedTextProvider === p.id ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'}`}>
                          <span className="text-lg">{p.icon}</span><span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {parentWork.type !== 'novel' && imageProviders.length > 1 && (
                  <div>
                    <label className="text-xs text-text-secondary">图片生成服务</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {imageProviders.map((p) => (
                        <button key={p.id} onClick={() => setSelectedImageProvider(p.id)} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${selectedImageProvider === p.id ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'}`}>
                          <span className="text-lg">{p.icon}</span><span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 bg-bg-secondary rounded-lg p-3">
                <div className="text-xs font-medium text-text-secondary">文字模型</div>
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Base URL" value={customTextBaseUrl} onChange={(e) => setCustomTextBaseUrl(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Key" type="password" value={customTextApiKey} onChange={(e) => setCustomTextApiKey(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="模型名称" value={customTextModel} onChange={(e) => setCustomTextModel(e.target.value)} />
                {parentWork.type !== 'novel' && (
                  <>
                    <div className="text-xs font-medium text-text-secondary mt-2">图片模型</div>
                    <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Base URL" value={customImageBaseUrl} onChange={(e) => setCustomImageBaseUrl(e.target.value)} />
                    <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Key" type="password" value={customImageApiKey} onChange={(e) => setCustomImageApiKey(e.target.value)} />
                    <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="模型名称" value={customImageModel} onChange={(e) => setCustomImageModel(e.target.value)} />
                  </>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-text-secondary">续写梗概</label>
              <textarea
                className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none"
                rows={5}
                placeholder="描述你想把故事带向哪个方向..."
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
              />
            </div>


            <div>
              <label className="text-xs text-text-secondary">
                {parentWork.type === 'novel' ? '生成章节数' : '生成页数'}
                {aiSource === 'platform' && credits !== null ? `（消耗${aiPageCount * 100}积分）` : ''}
              </label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => setAiPageCount(Math.max(2, aiPageCount - 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">-</button>
                <span className="text-lg font-semibold w-6 text-center">{aiPageCount}</span>
                <button onClick={() => setAiPageCount(Math.min(12, aiPageCount + 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">+</button>
                <span className="text-xs text-text-secondary">{parentWork.type === 'novel' ? '章' : '页分镜'}</span>
              </div>
            </div>

            {aiError && <div className="bg-accent-pink/10 border border-accent-pink/30 rounded-lg p-3 text-xs text-accent-pink">{aiError}</div>}

            <button
              onClick={submitAI}
              disabled={aiGenerating}
              className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {aiGenerating ? '提交中...' : 'AI 一键续写'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
