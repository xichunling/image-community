import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { worksApi, uploadApi } from '../api'
import type { WorkDetail as WorkDetailType, PageInput } from '../types'
import BackHeader from '../components/BackHeader'
import PagesEditor from '../components/PagesEditor'

export default function Fork() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [parentWork, setParentWork] = useState<WorkDetailType | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [pages, setPages] = useState<PageInput[]>([{ description: '', dialogue: '' }])

  useEffect(() => {
    if (!id) return
    worksApi.getById(Number(id)).then((w) => {
      setParentWork(w)
      setTitle(`${w.title} - 我的分支`)
    })
  }, [id])

  const submit = async () => {
    if (!title.trim()) return alert('请输入标题')
    if (!pages[0]?.description.trim()) return alert('请至少填写第一页场景描述')
    if (!id) return

    const result = await worksApi.fork(Number(id), {
      title: title.trim(),
      description: desc.trim(),
      pages,
    })
    navigate(`/work/${result.id}`)
  }

  const handleUpload = async (index: number, file: File): Promise<string> => {
    const result = await uploadApi.image(file)
    const updated = [...pages]
    updated[index] = { ...updated[index]!, image_url: result.url }
    setPages(updated)
    return result.url
  }

  if (!parentWork) return <div className="p-4 text-text-secondary">加载中...</div>

  return (
    <div className="pb-20">
      <BackHeader title="续写创作" />

      <div className="px-4 space-y-4">
        <div className="bg-bg-card rounded-xl p-3 border border-primary">
          <div className="text-[10px] text-primary-light">续写自</div>
          <div className="text-sm font-semibold mt-0.5">「{parentWork.title}」</div>
          <div className="text-xs text-text-secondary mt-0.5">by {parentWork.creator_name}</div>
        </div>

        <div>
          <label className="text-xs text-text-secondary">续写标题</label>
          <input
            className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="续写标题"
          />
        </div>

        <div>
          <label className="text-xs text-text-secondary">续写简介</label>
          <textarea
            className="w-full mt-1 bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-secondary focus:outline-none focus:border-primary resize-none"
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="你想把故事带向哪个方向？"
          />
        </div>

        <PagesEditor pages={pages} onChange={setPages} showUpload onUploadPage={handleUpload} />

        <button
          onClick={submit}
          className="w-full py-3 bg-primary rounded-lg text-sm text-white font-medium hover:bg-primary-light transition-colors"
        >
          🚀 发布续写
        </button>
      </div>
    </div>
  )
}
