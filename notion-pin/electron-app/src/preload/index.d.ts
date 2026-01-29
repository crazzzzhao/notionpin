import { ElectronAPI } from '@electron-toolkit/preload'

export interface WindowAPI {
  toggleCollapsed: () => Promise<boolean>
  getWindowState: () => Promise<{
    isCollapsed: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }>
  setWindowState: (state: { isCollapsed?: boolean }) => Promise<void>
  close: () => Promise<void>
  minimize: () => Promise<void>
  resize: (width: number, height: number) => Promise<void>
}

export interface SettingsAPI {
  save: (data: {
    token: string
    databaseUrl: string
    databaseId: string
  }) => Promise<{ success: boolean; error?: string }>
  load: () => Promise<{
    isTokenConfigured: boolean
    databaseId: string | null
    databaseUrl: string | null
    dataSourceId: string | null
  }>
  clear: () => Promise<{ success: boolean }>
}

export type StatusFilterKey = 'all' | 'todo' | 'in-progress' | 'done'

export interface NotionTask {
  id: string
  title: string
  status: string | null
  due: string | null
  url: string
  lastEditedTime: string
}

export interface NotionError {
  code: string
  message: string
  userMessage: string
  retryAfter?: number
}

export interface NotionAPI {
  queryTasks: (options?: {
    statusFilter?: StatusFilterKey
    cursor?: string
  }) => Promise<{
    success: boolean
    tasks?: NotionTask[]
    hasMore?: boolean
    nextCursor?: string | null
    totalFetched?: number
    error?: NotionError
  }>
  getDatabaseInfo: () => Promise<{
    success: boolean
    databaseId?: string
    dataSourceId?: string
    error?: NotionError
  }>
  clearCache: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    windowAPI: WindowAPI
    settingsAPI: SettingsAPI
    notionAPI: NotionAPI
  }
}
