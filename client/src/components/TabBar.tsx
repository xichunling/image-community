import { useLocation, useNavigate } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'

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

export default function TabBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useUser()
  const currentPath = location.pathname
  const tabs = user ? fullTabs : guestTabs

  // 登录/注册页不显示 TabBar（通过 CSS 隐藏）
  const hideTabs = currentPath === '/login' || currentPath === '/register' || currentPath.startsWith('/chat')
  if (hideTabs) return null

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-bg-card border-t border-border flex z-40">
      {tabs.map((tab) => (
        <button
          key={tab.page}
          onClick={() => navigate(tab.page)}
          className={`flex-1 flex flex-col items-center py-2 transition-colors ${
            currentPath === tab.page ? 'text-accent' : 'text-text-secondary'
          }`}
        >
          <span className="text-lg">{tab.icon}</span>
          <span className="text-[10px] mt-0.5">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
