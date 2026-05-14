import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { worksApi, aiApi, uploadApi, creditsApi } from '../api'
import type { PageInput, TextProviderInfo, ImageProviderInfo } from '../types'
import PagesEditor from '../components/PagesEditor'

const styles = [
  { value: 'cyberpunk', icon: '🌆', name: '赛博朋克' },
  { value: 'watercolor', icon: '🎨', name: '水彩' },
  { value: 'pixel', icon: '👾', name: '像素风' },
  { value: 'ink', icon: '🖌️', name: '水墨' },
  { value: 'comic', icon: '💥', name: '美漫' },
  { value: 'anime', icon: '✨', name: '日漫' },
]

export default function Create() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'manual' | 'ai'>('manual')

  // Manual fields
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [type, setType] = useState<'comic' | 'drama' | 'novel'>('comic')
  const [pages, setPages] = useState<PageInput[]>([{ description: '', dialogue: '' }])
  const [coverImage, setCoverImage] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const [allowFork, setAllowFork] = useState(true)

  // AI fields
  const [aiType, setAiType] = useState<'comic' | 'drama' | 'novel'>('comic')
  const [synopsis, setSynopsis] = useState('')
  const [aiStyle, setAiStyle] = useState('cyberpunk')
  const [aiPageCount, setAiPageCount] = useState(4)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiStep, setAiStep] = useState(0)
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState<{ title: string; desc: string; pages: PageInput[] } | null>(null)

  // AI 来源选择
  const [aiSource, setAiSource] = useState<'platform' | 'custom'>('platform')

  // Provider state (平台模式)
  const [textProviders, setTextProviders] = useState<TextProviderInfo[]>([])
  const [imageProviders, setImageProviders] = useState<ImageProviderInfo[]>([])
  const [selectedTextProvider, setSelectedTextProvider] = useState('')
  const [selectedImageProvider, setSelectedImageProvider] = useState('')

  // 自定义配置
  const [customTextBaseUrl, setCustomTextBaseUrl] = useState('')
  const [customTextApiKey, setCustomTextApiKey] = useState('')
  const [customTextModel, setCustomTextModel] = useState('')
  const [customImageBaseUrl, setCustomImageBaseUrl] = useState('')
  const [customImageApiKey, setCustomImageApiKey] = useState('')
  const [customImageModel, setCustomImageModel] = useState('')
  const [configSaving, setConfigSaving] = useState(false)

  // 积分
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    // 加载平台 provider
    aiApi.getProviders().then((res) => {
      const realText = res.textProviders.filter(p => p.id !== 'mock-text')
      const realImage = res.imageProviders.filter(p => p.id !== 'mock-image')
      setTextProviders(realText)
      setImageProviders(realImage)
      if (realText[0]) setSelectedTextProvider(realText[0].id)
      if (realImage[0]) setSelectedImageProvider(realImage[0].id)
    }).catch(() => {})

    // 加载积分
    creditsApi.status().then(s => setCredits(s.credits)).catch(() => {})

    // 加载用户自定义配置
    aiApi.getConfig().then(c => {
      if (c.text_base_url) setCustomTextBaseUrl(c.text_base_url)
      if (c.text_api_key) setCustomTextApiKey(c.text_api_key)
      if (c.text_model) setCustomTextModel(c.text_model)
      if (c.image_base_url) setCustomImageBaseUrl(c.image_base_url)
      if (c.image_api_key) setCustomImageApiKey(c.image_api_key)
      if (c.image_model) setCustomImageModel(c.image_model)
    }).catch(() => {})
  }, [])

  const saveCustomConfig = async () => {
    setConfigSaving(true)
    try {
      await aiApi.saveConfig({
        text_base_url: customTextBaseUrl,
        text_api_key: customTextApiKey,
        text_model: customTextModel,
        image_base_url: customImageBaseUrl,
        image_api_key: customImageApiKey,
        image_model: customImageModel,
      })
      alert('配置已保存')
    } catch (err: any) {
      alert(err.message || '保存失败')
    } finally {
      setConfigSaving(false)
    }
  }

  const submitManual = async () => {
    if (!title.trim()) return alert('请输入标题')
    if (!pages[0]?.description.trim()) return alert('请至少填写第一页场景描述')
    if (!coverImage) {
      if (!confirm('生成或上传封面图可以更好地吸引读者，确定不添加封面直接发布吗？')) return
    }
    await worksApi.create({ title: title.trim(), description: desc.trim(), type, pages, cover_image: coverImage || undefined, allow_fork: allowFork ? 1 : 0 })
    navigate('/')
  }

  const handleUpload = async (index: number, file: File): Promise<string> => {
    const result = await uploadApi.image(file)
    const updated = [...pages]
    updated[index] = { ...updated[index]!, image_url: result.url }
    setPages(updated)
    return result.url
  }

  const submitAI = async () => {
    if (!synopsis.trim()) return alert('请输入作品梗概')

    if (aiSource === 'platform') {
      if (!selectedTextProvider || (aiType !== 'novel' && !selectedImageProvider)) return alert('请选择生成服务')
    } else {
      if (!customTextBaseUrl || !customTextApiKey || !customTextModel) return alert('请完整填写文字模型配置')
      if (aiType !== 'novel' && (!customImageBaseUrl || !customImageApiKey || !customImageModel)) return alert('请完整填写图片模型配置')
    }

    setAiGenerating(true)
    setAiError('')

    try {
      if (aiSource === 'platform') {
        await aiApi.generate({
          synopsis: synopsis.trim(),
          style: aiStyle,
          type: aiType,
          pageCount: aiPageCount,
          textProvider: selectedTextProvider,
          imageProvider: selectedImageProvider,
        })
      } else {
        await aiApi.generateCustom({
          synopsis: synopsis.trim(),
          style: aiStyle,
          type: aiType,
          pageCount: aiPageCount,
          textConfig: { baseUrl: customTextBaseUrl.trim(), apiKey: customTextApiKey.trim(), model: customTextModel.trim() },
          imageConfig: { baseUrl: customImageBaseUrl.trim(), apiKey: customImageApiKey.trim(), model: customImageModel.trim() },
        })
      }

      // 两种模式统一：任务已提交，跳转到个人页
      alert('创作任务已提交，可在个人页查看进度')
      navigate('/profile')
    } catch (err: any) {
      setAiError(err.message || 'AI 生成失败，请重试')
      setAiGenerating(false)
    }
  }

  const regeneratePage = async (index: number) => {
    if (!aiResult) return
    const page = aiResult.pages[index]
    if (!page) return

    try {
      const result = await aiApi.generatePage({
        provider: selectedImageProvider,
        style: aiStyle,
        type: aiType,
        imagePrompt: page.description,
        dialogue: page.dialogue,
      })
      const updated = [...aiResult.pages]
      updated[index] = { ...updated[index]!, image_url: result.image_url }
      setAiResult({ ...aiResult, pages: updated })
    } catch (err: any) {
      alert(err.message || '重新生成失败')
    }
  }

  const publishAI = async () => {
    if (!aiResult) return
    await worksApi.create({
      title: aiResult.title,
      description: aiResult.desc,
      type: aiType,
      pages: aiResult.pages,
    })
    navigate('/')
  }

  return (
    <div className="pb-20 md:pb-6 md:max-w-[700px] md:mx-auto">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-bg to-bg-secondary px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">创作</h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${
              mode === 'manual' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
            }`}
          >
            <div className="text-sm font-medium">✍️ 自己创作</div>
            <div className="text-[10px] text-text-secondary mt-0.5">上传图片，编辑分镜和对白</div>
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${
              mode === 'ai' ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
            }`}
          >
            <div className="text-sm font-medium">🤖 AI创作</div>
            <div className="text-[10px] text-text-secondary mt-0.5">描述梗概，AI帮你生成作品</div>
          </button>
        </div>

        {mode === 'manual' ? (
          <>
            <div>
              <label className="text-xs text-text-secondary">作品标题</label>
              <input className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="给你的作品起个名字" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-secondary">作品简介</label>
              <textarea className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none" rows={3} placeholder="简单描述一下你的创作" value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-secondary">作品类型</label>
              <select className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={type} onChange={(e) => { if (e.target.value !== 'drama') setType(e.target.value as 'comic' | 'drama' | 'novel') }}>
                <option value="comic">漫画</option>
                <option value="drama" disabled>短剧（敬请期待）</option>
                <option value="novel">小说</option>
              </select>
            </div>
            {type === 'novel' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-text-secondary">章节内容</label>
                  <button onClick={() => setPages([...pages, { description: '', dialogue: '' }])} className="text-xs text-primary hover:text-primary-light">+ 添加章节</button>
                </div>
                {pages.map((page, i) => (
                  <div key={i} className="bg-bg-card border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">第{i + 1}章</span>
                      {pages.length > 1 && (
                        <button onClick={() => setPages(pages.filter((_, idx) => idx !== i))} className="text-xs text-accent-pink">删除</button>
                      )}
                    </div>
                    <input
                      className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
                      placeholder="章节标题（可选）"
                      value={page.dialogue}
                      onChange={(e) => { const p = [...pages]; p[i] = { ...p[i]!, dialogue: e.target.value }; setPages(p) }}
                    />
                    <textarea
                      className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none leading-relaxed"
                      rows={8}
                      placeholder="在这里写下你的故事内容..."
                      value={page.description}
                      onChange={(e) => { const p = [...pages]; p[i] = { ...p[i]!, description: e.target.value }; setPages(p) }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <PagesEditor pages={pages} onChange={setPages} showUpload onUploadPage={handleUpload} />
            )}
            <div>
              <label className="text-xs text-text-secondary">封面图片（可选）</label>
              {coverImage ? (
                <div className="mt-1 relative">
                  <img src={coverImage} className="w-full h-32 object-cover rounded-lg" />
                  <button onClick={() => setCoverImage('')} className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full text-white text-xs flex items-center justify-center">x</button>
                </div>
              ) : (
                <label className="mt-1 flex items-center justify-center h-20 bg-bg-card border border-dashed border-border rounded-lg cursor-pointer hover:border-primary transition-colors">
                  <span className="text-xs text-text-secondary">{coverUploading ? '上传中...' : '点击上传封面'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setCoverUploading(true)
                    try {
                      const res = await uploadApi.image(file)
                      setCoverImage(res.url)
                    } catch { alert('上传失败') }
                    finally { setCoverUploading(false) }
                  }} />
                </label>
              )}
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
            <button onClick={submitManual} className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors">发布作品</button>
          </>
        ) : aiGenerating ? (
          <div className="space-y-4 py-8">
            {['正在分析故事梗概...', '正在生成分镜脚本并生成图片...', 'AI 生成完成'].map((text, i) => (
              <div key={i} className={`flex items-center gap-3 ${aiStep > i + 1 ? 'text-success' : aiStep === i + 1 ? 'text-accent' : 'text-text-secondary'}`}>
                {aiStep > i + 1 ? '✓' : aiStep === i + 1 ? <span className="animate-spin">⟳</span> : '○'}
                <span className="text-sm">{text}</span>
              </div>
            ))}
            {aiError && <div className="text-sm text-accent-pink mt-2">{aiError}</div>}
          </div>
        ) : aiResult ? (
          <div className="space-y-4">
            <div className="text-sm font-semibold text-success">AI生成完成</div>
            <div>
              <label className="text-xs text-text-secondary">作品标题（可修改）</label>
              <input className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={aiResult.title} onChange={(e) => setAiResult({ ...aiResult, title: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-text-secondary">作品简介（可修改）</label>
              <textarea className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary resize-none" rows={3} value={aiResult.desc} onChange={(e) => setAiResult({ ...aiResult, desc: e.target.value })} />
            </div>
            <PagesEditor pages={aiResult.pages} onChange={(p) => setAiResult({ ...aiResult, pages: p })} onRegeneratePage={regeneratePage} />
            <div className="flex gap-2">
              <button onClick={() => { setAiResult(null); submitAI() }} className="flex-1 py-2.5 bg-bg-card border border-border rounded-lg text-sm hover:border-primary transition-colors">重新生成</button>
              <button onClick={publishAI} className="flex-[2] py-2.5 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors">确认发布</button>
            </div>
          </div>
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
                {/* 积分提示 */}
                {credits !== null && credits < aiPageCount * 100 && (
                  <div className="bg-accent-pink/10 border border-accent-pink/30 rounded-lg p-3 text-xs text-accent-pink">
                    积分不足！生成{aiPageCount}页需要{aiPageCount * 100}积分，当前剩余{credits}积分。请签到获取积分或切换到"自己的API"。
                  </div>
                )}
                {/* Provider 选择 */}
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
                {imageProviders.length > 1 && (
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
                <div className="text-xs font-medium text-text-secondary">文字模型（LLM 分镜生成）</div>
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Base URL（如 https://ark.cn-beijing.volces.com/api/v3）" value={customTextBaseUrl} onChange={(e) => setCustomTextBaseUrl(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Key" type="password" value={customTextApiKey} onChange={(e) => setCustomTextApiKey(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="模型名称（如 ep-xxxxx 或 gpt-4o-mini）" value={customTextModel} onChange={(e) => setCustomTextModel(e.target.value)} />

                <div className="text-xs font-medium text-text-secondary mt-2">图片模型（文生图）</div>
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Base URL" value={customImageBaseUrl} onChange={(e) => setCustomImageBaseUrl(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="API Key" type="password" value={customImageApiKey} onChange={(e) => setCustomImageApiKey(e.target.value)} />
                <input className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary" placeholder="模型名称" value={customImageModel} onChange={(e) => setCustomImageModel(e.target.value)} />

                <button onClick={saveCustomConfig} disabled={configSaving} className="w-full py-2 bg-bg-card border border-border rounded-lg text-xs hover:border-primary transition-colors disabled:opacity-50">
                  {configSaving ? '保存中...' : '保存配置（下次自动填入）'}
                </button>
              </div>
            )}

            <div>
              <label className="text-xs text-text-secondary">作品类型</label>
              <select className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={aiType} onChange={(e) => { if (e.target.value !== 'drama') setAiType(e.target.value as 'comic' | 'drama' | 'novel') }}>
                <option value="comic">漫画</option>
                <option value="drama" disabled>短剧（敬请期待）</option>
                <option value="novel">小说</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary">作品梗概</label>
              <textarea className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none" rows={5} placeholder="描述你想创作的故事..." value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
            </div>
            {aiType !== 'novel' && (
              <div>
                <label className="text-xs text-text-secondary">画面风格</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {styles.map((s) => (
                    <button key={s.value} onClick={() => setAiStyle(s.value)} className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-colors ${aiStyle === s.value ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'}`}>
                      <span className="text-lg">{s.icon}</span>
                      <span>{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-text-secondary">
                {aiType === 'novel' ? '生成章节数' : '生成页数'}
                {aiSource === 'platform' && credits !== null ? `（消耗${aiPageCount * 100}积分）` : ''}
              </label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => setAiPageCount(Math.max(2, aiPageCount - 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">-</button>
                <span className="text-lg font-semibold w-6 text-center">{aiPageCount}</span>
                <button onClick={() => setAiPageCount(Math.min(12, aiPageCount + 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">+</button>
                <span className="text-xs text-text-secondary">{aiType === 'novel' ? '章' : '页分镜'}</span>
              </div>
            </div>
            {aiError && <div className="bg-accent-pink/10 border border-accent-pink/30 rounded-lg p-3 text-xs text-accent-pink">{aiError}</div>}
            <button onClick={submitAI} className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors">AI 一键生成</button>
          </>
        )}
      </div>
    </div>
  )
}
