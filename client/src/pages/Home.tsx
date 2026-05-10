import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { worksApi, creditsApi } from '../api'
import { useUser } from '../contexts/UserContext'
import type { Work } from '../types'
import WorkCard from '../components/WorkCard'

const filters = [
  { value: 'all', label: '全部' },
  { value: 'comic', label: '漫画' },
  { value: 'drama', label: '短剧' },
  { value: 'novel', label: '小说' },
]

export default function Home() {
  const [works, setWorks] = useState<Work[]>([])
  const [type, setType] = useState('all')
  const { user } = useUser()
  const navigate = useNavigate()

  const [credits, setCredits] = useState<number | null>(null)
  const [checkedIn, setCheckedIn] = useState(false)
  const [streak, setStreak] = useState(0)
  const [checkInMsg, setCheckInMsg] = useState('')

  useEffect(() => {
    worksApi.list({ type }).then(setWorks)
  }, [type])

  useEffect(() => {
    if (user) {
      creditsApi.status().then(s => {
        setCredits(s.credits)
        setCheckedIn(s.checkedInToday)
        setStreak(s.streak)
      }).catch(() => {})
    }
  }, [user])

  const handleCheckIn = async () => {
    try {
      const res = await creditsApi.checkIn()
      setCheckedIn(true)
      setCredits(res.totalCredits)
      setStreak(res.streak)
      setCheckInMsg(res.message)
      setTimeout(() => setCheckInMsg(''), 3000)
    } catch (err: any) {
      alert(err.message || '签到失败')
    }
  }

  return (
    <div className="pb-20">
      <div className="sticky top-0 z-10 bg-gradient-to-br from-bg to-bg-secondary px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">
          发现
        </h1>
        <p className="text-xs text-text-secondary mt-0.5">探索社区中的精彩创作</p>
      </div>

      {/* 签到卡片 */}
      {user && (
        <div className="mx-4 mt-2 mb-2 p-3 bg-bg-card border border-border rounded-xl flex items-center justify-between">
          <div className="text-xs">
            <span className="text-text-secondary">积分：</span>
            <span className="font-semibold text-primary">{credits ?? '...'}</span>
            {streak > 0 && <span className="text-text-secondary ml-2">连续签到{streak}天</span>}
          </div>
          {checkInMsg ? (
            <span className="text-xs text-success font-medium">{checkInMsg}</span>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={checkedIn}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                checkedIn ? 'bg-bg-secondary text-text-secondary' : 'bg-primary text-white hover:bg-primary-light'
              }`}
            >
              {checkedIn ? '已签到' : '签到 +100'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-1 px-4 py-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setType(f.value)}
            className={`px-4 py-1.5 rounded-full text-xs transition-colors ${
              type === f.value
                ? 'bg-primary text-white'
                : 'bg-bg-card text-text-secondary hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 mt-2">
        {works.map((work, i) => (
          <WorkCard key={work.id} work={work} index={i} onClick={() => navigate(`/work/${work.id}`)} />
        ))}
      </div>

      {works.length === 0 && (
        <div className="text-center py-20 text-text-secondary text-sm">暂无作品</div>
      )}
    </div>
  )
}
