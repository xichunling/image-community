import { useLocation, useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import UserAvatar from './UserAvatar'

const fullTabs = [
  { page: '/', icon: '🏠', label: '发现' },
  { page: '/shelf', icon: '📚', label: '书架' },
  { page: '/create', icon: '✨', label: '创作' },
  { page: '/messages', icon: '💬', label: '消息' },
  { page: '/profile', icon: '👤', label: '我的' },
]

const guestTabs = [
  { page: '/', icon: '🏠', label: '发现' },
  { page: '/login', icon: '🔐', label: '登录' },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useUser()
  const currentPath = location.pathname
  const tabs = user ? fullTabs : guestTabs

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[200px] bg-bg-card border-r border-border z-50">
      <div className="px-5 py-6">
        <h1 className="text-lg font-bold bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">
          影像社区
        </h1>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {tabs.map((tab) => (
          <button
            key={tab.page}
            onClick={() => navigate(tab.page)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              currentPath === tab.page
                ? 'bg-primary/15 text-accent'
                : 'text-text-secondary hover:bg-bg-secondary hover:text-text'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {user && (
        <div className="px-4 py-4 border-t border-border">
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-80"
            onClick={() => navigate('/profile')}
          >
            <UserAvatar avatar={user.avatar} nickname={user.nickname} size="sm" />
            <span className="text-sm truncate">{user.nickname}</span>
          </div>
        </div>
      )}
    </aside>
  )
}
