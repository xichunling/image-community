const API = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API}${url}`, {
    ...options,
    headers,
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.hash = '#/login'
    throw new Error('登录已过期')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }))
    throw new Error(err.error)
  }
  return res.json()
}

export const authApi = {
  register: (data: { username: string; password: string; nickname: string }) =>
    request<{ token: string; user: import('../types').AuthUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: import('../types').AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () =>
    request<import('../types').AuthUser>('/auth/me'),
}

export const usersApi = {
  getAll: () => request<import('../types').User[]>('/users'),
  getById: (id: number) => request<import('../types').User>(`/users/${id}`),
  getWorks: (id: number) => request<import('../types').Work[]>(`/users/${id}/works`),
  getContributions: (id: number) => request<import('../types').Work[]>(`/users/${id}/contributions`),
}

export const worksApi = {
  list: (params?: { type?: string; sort?: string }) => {
    const qs = new URLSearchParams()
    if (params?.type && params.type !== 'all') qs.set('type', params.type)
    if (params?.sort) qs.set('sort', params.sort)
    const query = qs.toString()
    return request<import('../types').Work[]>(`/works${query ? '?' + query : ''}`)
  },
  getById: (id: number) => request<import('../types').WorkDetail>(`/works/${id}`),
  getPages: (id: number) => request<import('../types').WorkPage[]>(`/works/${id}/pages`),
  getTree: (id: number) => request<import('../types').TreeNode>(`/works/${id}/tree`),
  create: (data: { title: string; description: string; type: string; pages?: import('../types').PageInput[] }) =>
    request<{ id: number; message: string }>('/works', { method: 'POST', body: JSON.stringify(data) }),
  fork: (parentId: number, data: { title: string; description: string; pages?: import('../types').PageInput[] }) =>
    request<{ id: number; message: string }>(`/works/${parentId}/fork`, { method: 'POST', body: JSON.stringify(data) }),
}

export const commentsApi = {
  list: (workId: number) => request<import('../types').Comment[]>(`/works/${workId}/comments`),
  create: (workId: number, data: { content: string }) =>
    request<{ message: string }>(`/works/${workId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
}

export const bookmarksApi = {
  list: (userId: number, status?: string) => {
    const qs = status && status !== 'all' ? `?status=${status}` : ''
    return request<import('../types').Bookmark[]>(`/users/${userId}/bookmarks${qs}`)
  },
  create: (data: { work_id: number }) =>
    request<{ message: string }>('/bookmarks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: { read_status?: string; last_read_page?: number }) =>
    request<{ message: string }>(`/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: number) =>
    request<{ message: string }>(`/bookmarks/${id}`, { method: 'DELETE' }),
  check: (workId: number) =>
    request<{ bookmarked: boolean; bookmark: import('../types').Bookmark | null }>(`/bookmarks/check?work_id=${workId}`),
}

export const conversationsApi = {
  list: (userId: number) => request<import('../types').Conversation[]>(`/users/${userId}/conversations`),
  getMessages: (convId: number) =>
    request<{ conversation: import('../types').Conversation; members: import('../types').User[]; messages: import('../types').Message[] }>(`/conversations/${convId}/messages`),
  sendMessage: (convId: number, data: { content: string; msg_type?: string }) =>
    request<{ message: string }>(`/conversations/${convId}/messages`, { method: 'POST', body: JSON.stringify(data) }),
}

export const aiApi = {
  getProviders: () =>
    request<{ textProviders: import('../types').TextProviderInfo[]; imageProviders: import('../types').ImageProviderInfo[] }>('/ai/providers'),
  generate: (data: import('../types').AIGenerateRequest) =>
    request<import('../types').AIGenerateResult>('/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
  generatePage: (data: { provider: string; style: string; type: string; imagePrompt: string; dialogue: string }) =>
    request<{ image_url: string; ai_generated: boolean }>('/ai/generate-page', { method: 'POST', body: JSON.stringify(data) }),
}

export const uploadApi = {
  image: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData()
    formData.append('image', file)
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${API}/upload/image`, {
      method: 'POST',
      headers,
      body: formData,
    })
    if (res.status === 401) {
      localStorage.removeItem('token')
      window.location.hash = '#/login'
      throw new Error('登录已过期')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '上传失败' }))
      throw new Error(err.error)
    }
    return res.json()
  },
}
