import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { worksApi, aiApi, uploadApi } from '../api'
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
  const [type, setType] = useState<'comic' | 'drama'>('comic')
  const [pages, setPages] = useState<PageInput[]>([{ description: '', dialogue: '' }])

  // AI fields
  const [aiType, setAiType] = useState<'comic' | 'drama'>('comic')
  const [synopsis, setSynopsis] = useState('')
  const [aiStyle, setAiStyle] = useState('cyberpunk')
  const [aiPageCount, setAiPageCount] = useState(4)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiStep, setAiStep] = useState(0)
  const [aiError, setAiError] = useState('')
  const [aiResult, setAiResult] = useState<{ title: string; desc: string; pages: PageInput[] } | null>(null)

  // Provider state
  const [textProviders, setTextProviders] = useState<TextProviderInfo[]>([])
  const [imageProviders, setImageProviders] = useState<ImageProviderInfo[]>([])
  const [selectedTextProvider, setSelectedTextProvider] = useState('')
  const [selectedImageProvider, setSelectedImageProvider] = useState('')

  useEffect(() => {
    aiApi.getProviders().then((res) => {
      setTextProviders(res.textProviders)
      setImageProviders(res.imageProviders)
      // 默认选中第一个非 mock provider，否则选 mock
      const firstText = res.textProviders.find(p => p.id !== 'mock-text') || res.textProviders[0]
      const firstImage = res.imageProviders.find(p => p.id !== 'mock-image') || res.imageProviders[0]
      if (firstText) setSelectedTextProvider(firstText.id)
      if (firstImage) setSelectedImageProvider(firstImage.id)
    }).catch(() => {})
  }, [])

  const submitManual = async () => {
    if (!title.trim()) return alert('请输入标题')
    if (!pages[0]?.description.trim()) return alert('请至少填写第一页场景描述')
    await worksApi.create({ title: title.trim(), description: desc.trim(), type, pages })
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
    if (!selectedTextProvider || !selectedImageProvider) return alert('请选择生成服务')
    setAiGenerating(true)
    setAiStep(1)
    setAiError('')

    try {
      // Step 1: 正在生成分镜脚本
      setAiStep(2)

      const result = await aiApi.generate({
        synopsis: synopsis.trim(),
        style: aiStyle,
        type: aiType,
        pageCount: aiPageCount,
        textProvider: selectedTextProvider,
        imageProvider: selectedImageProvider,
      })

      setAiStep(3)
      setAiResult({
        title: result.title,
        desc: result.description,
        pages: result.pages.map((p) => ({
          description: p.description,
          dialogue: p.dialogue,
          image_url: p.image_url,
          ai_generated: true,
        })),
      })
    } catch (err: any) {
      setAiError(err.message || 'AI 生成失败，请重试')
    } finally {
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
    <div className="pb-20">
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
              <select className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={type} onChange={(e) => setType(e.target.value as 'comic' | 'drama')}>
                <option value="comic">漫画</option>
                <option value="drama">短剧</option>
              </select>
            </div>
            <PagesEditor pages={pages} onChange={setPages} showUpload onUploadPage={handleUpload} />
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
            {/* Provider 选择 */}
            <div>
              <label className="text-xs text-text-secondary">文字生成服务（LLM 分镜）</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {textProviders.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedTextProvider(p.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                      selectedTextProvider === p.id ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
                    }`}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-secondary">图片生成服务（文生图）</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {imageProviders.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedImageProvider(p.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                      selectedImageProvider === p.id ? 'border-primary bg-primary/10' : 'border-border bg-bg-card'
                    }`}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-secondary">作品类型</label>
              <select className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-primary" value={aiType} onChange={(e) => setAiType(e.target.value as 'comic' | 'drama')}>
                <option value="comic">漫画</option>
                <option value="drama">短剧</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-secondary">作品梗概</label>
              <textarea className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none" rows={5} placeholder="描述你想创作的故事..." value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
            </div>
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
            <div>
              <label className="text-xs text-text-secondary">生成页数</label>
              <div className="flex items-center gap-3 mt-1">
                <button onClick={() => setAiPageCount(Math.max(2, aiPageCount - 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">-</button>
                <span className="text-lg font-semibold w-6 text-center">{aiPageCount}</span>
                <button onClick={() => setAiPageCount(Math.min(12, aiPageCount + 1))} className="w-8 h-8 flex items-center justify-center bg-bg-card border border-border rounded-lg text-lg">+</button>
                <span className="text-xs text-text-secondary">页分镜</span>
              </div>
            </div>
            <button onClick={submitAI} className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors">AI 一键生成</button>
          </>
        )}
      </div>
    </div>
  )
}
