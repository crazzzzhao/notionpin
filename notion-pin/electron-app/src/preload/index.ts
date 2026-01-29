import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Window 控制 API
const windowAPI = {
  // 切换收起/展开状态
  toggleCollapsed: (): Promise<boolean> => ipcRenderer.invoke('window:toggleCollapsed'),

  // 获取窗口状态
  getWindowState: (): Promise<{
    isCollapsed: boolean
    bounds: { x: number; y: number; width: number; height: number } | null
  }> => ipcRenderer.invoke('window:getState'),

  // 设置窗口状态
  setWindowState: (state: { isCollapsed?: boolean }): Promise<void> =>
    ipcRenderer.invoke('window:setState', state),

  // 关闭窗口
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),

  // 最小化窗口
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),

  // 调整窗口大小（width, height）
  resize: (width: number, height: number): Promise<void> =>
    ipcRenderer.invoke('window:resize', width, height)
}

// Settings API - token 永远不暴露给 renderer
const settingsAPI = {
  // 保存设置（token 会在 main process 加密存储）
  save: (data: {
    token: string
    databaseUrl: string
    databaseId: string
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('settings:save', data),

  // 加载设置（不返回 token 明文）
  load: (): Promise<{
    isTokenConfigured: boolean
    databaseId: string | null
    databaseUrl: string | null
    dataSourceId: string | null
  }> => ipcRenderer.invoke('settings:load'),

  // 清除设置
  clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('settings:clear')
}

// Notion API - 所有请求通过 main process 处理，token 安全
type StatusFilterKey = 'all' | 'todo' | 'in-progress' | 'done'

interface NotionTask {
  id: string
  title: string
  status: string | null
  due: string | null
  url: string
  lastEditedTime: string
}

interface NotionError {
  code: string
  message: string
  userMessage: string
  retryAfter?: number
}

const notionAPI = {
  // 查询任务列表（支持 filter 和分页）
  queryTasks: (options?: {
    statusFilter?: StatusFilterKey
    cursor?: string
  }): Promise<{
    success: boolean
    tasks?: NotionTask[]
    hasMore?: boolean
    nextCursor?: string | null
    totalFetched?: number
    error?: NotionError
  }> => ipcRenderer.invoke('notion:queryTasks', options),

  // 获取 Database 信息
  getDatabaseInfo: (): Promise<{
    success: boolean
    databaseId?: string
    dataSourceId?: string
    error?: NotionError
  }> => ipcRenderer.invoke('notion:getDatabaseInfo'),

  // 清除缓存
  clearCache: (): Promise<{ success: boolean }> => ipcRenderer.invoke('notion:clearCache')
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
// Context isolation is always enabled for security
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('windowAPI', windowAPI)
    contextBridge.exposeInMainWorld('settingsAPI', settingsAPI)
    contextBridge.exposeInMainWorld('notionAPI', notionAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.windowAPI = windowAPI
  // @ts-ignore (define in dts)
  window.settingsAPI = settingsAPI
  // @ts-ignore (define in dts)
  window.notionAPI = notionAPI
}
