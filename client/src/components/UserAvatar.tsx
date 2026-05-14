const colors = [
  'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-10 h-10 text-base',
  lg: 'w-16 h-16 text-2xl',
}

export default function UserAvatar({ avatar, nickname, size = 'md' }: { avatar?: string; nickname: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = sizeMap[size]

  // URL 图片
  if (avatar && avatar.startsWith('/')) {
    return <img src={avatar} alt={nickname} className={`${sizeClass} rounded-full object-cover`} />
  }

  // emoji（兼容旧数据）
  if (avatar && avatar.length <= 2 && /\p{Emoji}/u.test(avatar)) {
    return <span className={`${sizeClass} flex items-center justify-center`}>{avatar}</span>
  }

  // 名字首字 + 纯色底
  const initial = nickname ? nickname[0] : '?'
  const color = colors[hashName(nickname) % colors.length]

  return (
    <span className={`${sizeClass} ${color} rounded-full flex items-center justify-center text-white font-medium shrink-0`}>
      {initial}
    </span>
  )
}
