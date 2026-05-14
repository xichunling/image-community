import { useRef, useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import { QRCodeCanvas } from 'qrcode.react'

interface SharePosterProps {
  title: string
  description: string
  coverImage?: string
  creatorName: string
  workUrl: string
  onClose: () => void
}

export default function SharePoster({ title, description, coverImage, creatorName, workUrl, onClose }: SharePosterProps) {
  const posterRef = useRef<HTMLDivElement>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [generating, setGenerating] = useState(true)

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!posterRef.current) return
      try {
        const canvas = await html2canvas(posterRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#0F0F1A',
        })
        setImageUrl(canvas.toDataURL('image/png'))
      } catch {
        setImageUrl('')
      } finally {
        setGenerating(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const handleSave = () => {
    if (!imageUrl) return
    const link = document.createElement('a')
    link.download = `${title}-分享海报.png`
    link.href = imageUrl
    link.click()
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(workUrl).then(() => alert('链接已复制'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="max-w-[90vw] max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* Hidden poster DOM for html2canvas */}
        <div className="absolute -left-[9999px] top-0">
          <div ref={posterRef} style={{ width: 375, height: 660, position: 'relative', overflow: 'hidden', background: '#0F0F1A' }}>
            {/* Cover area */}
            {coverImage ? (
              <img src={coverImage} crossOrigin="anonymous" style={{ width: 375, height: 300, objectFit: 'cover', display: 'block' }} />
            ) : (
              <div style={{ width: 375, height: 300, background: 'linear-gradient(135deg, #6C5CE7, #00D2FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.4 }}>{title}</div>
              </div>
            )}
            {/* Info area */}
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#EAEAEA', lineHeight: 1.4 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#8B8B9E', marginTop: 8, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{description}</div>
              <div style={{ fontSize: 11, color: '#8B8B9E', marginTop: 10 }}>by {creatorName}</div>
            </div>
            {/* QR + branding */}
            <div style={{ position: 'absolute', bottom: 20, left: 20, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: '#00D2FF', fontWeight: 'bold' }}>共创艺术社区</div>
                <div style={{ fontSize: 10, color: '#8B8B9E', marginTop: 3 }}>扫码阅读完整作品</div>
              </div>
              <QRCodeCanvas value={workUrl} size={64} bgColor="#0F0F1A" fgColor="#EAEAEA" />
            </div>
          </div>
        </div>

        {/* Visible preview */}
        <div className="bg-bg-card rounded-2xl p-4 space-y-4">
          {generating ? (
            <div className="w-[300px] h-[528px] bg-bg-secondary rounded-xl flex items-center justify-center">
              <div className="text-sm text-text-secondary animate-pulse">生成海报中...</div>
            </div>
          ) : imageUrl ? (
            <img src={imageUrl} alt="分享海报" className="w-[300px] rounded-xl" />
          ) : (
            <div className="w-[300px] h-[528px] bg-bg-secondary rounded-xl flex items-center justify-center">
              <div className="text-sm text-text-secondary">生成失败</div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!imageUrl} className="flex-1 py-2.5 bg-primary rounded-lg text-sm text-white hover:bg-primary-light transition-colors disabled:opacity-50">
              保存图片
            </button>
            <button onClick={handleCopyLink} className="flex-1 py-2.5 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary hover:border-primary transition-colors">
              复制链接
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
