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
  generateCustom: (data: { synopsis: string; style: string; type: string; pageCount: number; textConfig: { baseUrl: string; apiKey: string; model: string }; imageConfig: { baseUrl: string; apiKey: string; model: string } }) =>
    request<import('../types').AIGenerateResult>('/ai/generate-custom', { method: 'POST', body: JSON.stringify(data) }),
  generatePage: (data: { provider: string; style: string; type: string; imagePrompt: string; dialogue: string }) =>
    request<{ image_url: string; ai_generated: boolean }>('/ai/generate-page', { method: 'POST', body: JSON.stringify(data) }),
  getConfig: () =>
    request<{ text_base_url: string; text_api_key: string; text_model: string; image_base_url: string; image_api_key: string; image_model: string }>('/ai/config'),
  saveConfig: (data: { text_base_url: string; text_api_key: string; text_model: string; image_base_url: string; image_api_key: string; image_model: string }) =>
    request<{ message: string }>('/ai/config', { method: 'PUT', body: JSON.stringify(data) }),
}

export const creditsApi = {
  status: () =>
    request<{ credits: number; checkedInToday: boolean; streak: number }>('/credits/status'),
  checkIn: () =>
    request<{ creditsEarned: number; streak: number; totalCredits: number; message: string }>('/credits/check-in', { method: 'POST' }),
  logs: () =>
    request<{ id: number; amount: number; type: string; description: string; task_id: number | null; created_at: string }[]>('/credits/logs'),
}

export const tasksApi = {
  list: () =>
    request<{ id: number; status: string; type: string; credits_used: number; created_at: string; completed_at: string | null; error: string | null }[]>('/ai/tasks'),
  getById: (id: number) =>
    request<any>(`/ai/tasks/${id}`),
  publish: (id: number, data?: { title?: string; description?: string }) =>
    request<{ id: number; message: string }>(`/ai/tasks/${id}/publish`, { method: 'POST', body: JSON.stringify(data || {}) }),
}

export const followsApi = {
  follow: (userId: number) =>
    request<{ message: string }>(`/users/${userId}/follow`, { method: 'POST' }),
  unfollow: (userId: number) =>
    request<{ message: string }>(`/users/${userId}/follow`, { method: 'DELETE' }),
  status: (userId: number) =>
    request<{ isFollowing: boolean; isFollowedBy: boolean; isMutual: boolean }>(`/users/${userId}/follow-status`),
  followers: (userId: number) =>
    request<import('../types').User[]>(`/users/${userId}/followers`),
  following: (userId: number) =>
    request<import('../types').User[]>(`/users/${userId}/following`),
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
