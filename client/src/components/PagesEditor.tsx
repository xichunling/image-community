import { useState } from 'react'
import type { PageInput } from '../types'

interface PagesEditorProps {
  pages: PageInput[]
  onChange: (pages: PageInput[]) => void
  showUpload?: boolean
  onRegeneratePage?: (index: number) => void
}

export default function PagesEditor({ pages, onChange, showUpload = false, onRegeneratePage }: PagesEditorProps) {
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null)

  const addPage = () => {
    onChange([...pages, { description: '', dialogue: '' }])
  }

  const removePage = (index: number) => {
    if (pages.length <= 1) return
    onChange(pages.filter((_, i) => i !== index))
  }

  const updatePage = (index: number, field: keyof PageInput, value: string) => {
    const updated = [...pages]
    const existing = updated[index]!
    updated[index] = { ...existing, [field]: value }
    onChange(updated)
  }

  const handleRegenerate = async (index: number) => {
    if (!onRegeneratePage) return
    setRegeneratingIdx(index)
    try {
      await onRegeneratePage(index)
    } finally {
      setRegeneratingIdx(null)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">分镜编辑</h3>
      {pages.map((page, i) => (
        <div key={i} className="bg-bg-secondary rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-text-secondary">第{i + 1}页</span>
            <div className="flex items-center gap-2">
              {page.ai_generated && onRegeneratePage && (
                <button
                  onClick={() => handleRegenerate(i)}
                  disabled={regeneratingIdx === i}
                  className="text-xs text-primary hover:text-primary-light transition-colors disabled:opacity-50"
                >
                  {regeneratingIdx === i ? (
                    <span className="animate-spin">⟳</span>
                  ) : '🔄 重新生成'}
                </button>
              )}
              {pages.length > 1 && (
                <button onClick={() => removePage(i)} className="text-text-secondary hover:text-accent-pink text-sm">×</button>
              )}
            </div>
          </div>
          {page.image_url && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img src={page.image_url} alt={`第${i + 1}页`} className="w-full object-cover" />
            </div>
          )}
          {showUpload && (
            <div className="border border-dashed border-border rounded-lg py-6 text-center text-xs text-text-secondary cursor-pointer hover:border-primary">
              点击上传图片
            </div>
          )}
          <input
            className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
            placeholder="场景描述"
            value={page.description}
            onChange={(e) => updatePage(i, 'description', e.target.value)}
          />
          <input
            className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
            placeholder="对白（选填）"
            value={page.dialogue}
            onChange={(e) => updatePage(i, 'dialogue', e.target.value)}
          />
        </div>
      ))}
      <button onClick={addPage} className="w-full py-2.5 border border-dashed border-border rounded-lg text-sm text-text-secondary hover:border-primary hover:text-primary transition-colors">
        + 添加分镜页
      </button>
    </div>
  )
}
