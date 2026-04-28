export interface AuthUser {
  id: number
  username: string
  nickname: string
  avatar: string
  bio: string
  created_at: string
}

export interface User {
  id: number
  nickname: string
  avatar: string
  bio: string
  created_at: string
}

export interface Work {
  id: number
  title: string
  description: string
  cover_image: string
  type: 'comic' | 'drama'
  creator_id: number
  parent_work_id: number | null
  root_work_id: number | null
  status: 'draft' | 'published'
  created_at: string
  creator_name?: string
  creator_avatar?: string
  fork_count?: number
  comment_count?: number
}

export interface WorkDetail extends Work {
  contributors: Contributor[]
  parentWork: { id: number; title: string; creator_name: string } | null
}

export interface WorkPage {
  id: number
  work_id: number
  page_number: number
  image_url: string
  description: string
  dialogue: string
  ai_generated: number
  created_at: string
}

export interface Contributor {
  id: number
  nickname: string
  avatar: string
  role: 'creator' | 'ancestor'
  joined_at: string
}

export interface Comment {
  id: number
  work_id: number
  user_id: number
  content: string
  created_at: string
  nickname: string
  avatar: string
}

export interface Bookmark {
  id: number
  user_id: number
  work_id: number
  read_status: 'want_read' | 'reading' | 'finished'
  last_read_page: number
  created_at: string
  updated_at: string
  title?: string
  description?: string
  type?: 'comic' | 'drama'
  creator_name?: string
  creator_avatar?: string
  total_pages?: number
}

export interface Conversation {
  id: number
  type: 'private' | 'group'
  title: string
  work_id: number | null
  created_at: string
  displayName?: string
  displayAvatar?: string
  members?: User[]
  last_message?: string
  last_sender?: string
  last_message_time?: string
}

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  content: string
  msg_type: 'text' | 'image' | 'work_share' | 'system'
  created_at: string
  sender_name: string
  sender_avatar: string
}

export interface TreeNode {
  id: number
  title: string
  cover_image: string
  type: 'comic' | 'drama'
  parent_work_id: number | null
  root_work_id: number | null
  creator_id: number
  created_at: string
  creator_name: string
  creator_avatar: string
  fork_count: number
  children: TreeNode[]
}

export interface PageInput {
  description: string
  dialogue: string
  image_url?: string
  imagePrompt?: string
  ai_generated?: boolean
}

// ===== AI Provider Types =====

export interface TextProviderInfo {
  id: string
  name: string
  icon: string
  type: 'text'
  models: { id: string; name: string }[]
  enabled: boolean
}

export interface ImageProviderInfo {
  id: string
  name: string
  icon: string
  type: 'image'
  models: { id: string; name: string }[]
  enabled: boolean
}

export interface AIGenerateRequest {
  synopsis: string
  style: string
  type: 'comic' | 'drama'
  pageCount: number
  textProvider: string
  imageProvider: string
}

export interface AIGeneratePage {
  pageNumber: number
  description: string
  dialogue: string
  image_url?: string
  ai_generated: boolean
}

export interface AIGenerateResult {
  title: string
  description: string
  pages: AIGeneratePage[]
}
