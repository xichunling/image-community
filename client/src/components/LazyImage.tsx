import { useState } from 'react'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
}

export default function LazyImage({ src, alt, className = '' }: LazyImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Shimmer skeleton */}
      {status === 'loading' && (
        <div className="absolute inset-0 bg-bg-secondary animate-pulse" />
      )}

      {/* Error fallback */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-gradient-to-br from-bg-secondary to-bg-card flex items-center justify-center">
          <span className="text-text-secondary text-xs">图片加载失败</span>
        </div>
      )}

      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
