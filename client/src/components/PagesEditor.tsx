import { useState, useRef } from 'react'
import type { PageInput } from '../types'

interface PagesEditorProps {
  pages: PageInput[]
  onChange: (pages: PageInput[]) => void
  showUpload?: boolean
  onUploadPage?: (index: number, file: File) => Promise<string>
  onRegeneratePage?: (index: number) => void
}

export default function PagesEditor({ pages, onChange, showUpload = false, onUploadPage, onRegeneratePage }: PagesEditorProps) {
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({})

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

  const handleFileChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onUploadPage) return
    setUploadingIdx(index)
    try {
      const url = await onUploadPage(index, file)
      const updated = [...pages]
      updated[index] = { ...updated[index]!, image_url: url }
      onChange(updated)
    } catch (err: any) {
      alert(err.message || '上传失败')
    } finally {
      setUploadingIdx(null)
      e.target.value = ''
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

          {/* 图片区域 */}
          {page.image_url ? (
            <div className="relative rounded-lg overflow-hidden border border-border group">
              <img src={page.image_url} alt={`第${i + 1}页`} className="w-full object-cover" />
              {showUpload && onUploadPage && (
                <button
                  onClick={() => fileInputs.current[i]?.click()}
                  disabled={uploadingIdx === i}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-sm disabled:opacity-100"
                >
                  {uploadingIdx === i ? (
                    <span className="animate-spin">⟳ 上传中...</span>
                  ) : '更换图片'}
                </button>
              )}
            </div>
          ) : showUpload && onUploadPage ? (
            uploadingIdx === i ? (
              <div className="border border-primary bg-primary/5 rounded-lg py-6 text-center text-xs text-primary">
                <span className="animate-spin">⟳</span> 上传中...
              </div>
            ) : (
              <div
                onClick={() => fileInputs.current[i]?.click()}
                className="border border-dashed border-border rounded-lg py-6 text-center text-xs text-text-secondary cursor-pointer hover:border-primary hover:text-primary transition-colors"
              >
                点击上传图片
              </div>
            )
          ) : null}

          {/* 隐藏的 file input */}
          {showUpload && onUploadPage && (
            <input
              ref={(el) => { fileInputs.current[i] = el }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(i, e)}
            />
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
