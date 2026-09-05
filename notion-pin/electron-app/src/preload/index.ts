import { contextBridge, ipcRenderer } from 'electron'
import type { StatusFilterKey } from '../shared/statusFilters'
export type { StatusFilterKey } from '../shared/statusFilters'

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
    ipcRenderer.invoke('window:resize', width, height),

  // 安全打开外部链接（仅允许 notion.so 域名）
  openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openExternal', url)
}

// 字段映射类型（供 renderer 导入）
export interface FieldMapping {
  textPropertyId: string | null
  statusPropertyId: string | null
  timePropertyId: string | null
  boundDataSourceId?: string | null
}

// 属性 schema 类型
export interface PropertySchema {
  id: string
  name: string
  type: string
  options?: Array<{ id: string; name: string; color: string }>
}

// Settings API - token 永远不暴露给 renderer
const settingsAPI = {
  // 加载设置（不返回 token 明文）
  load: (): Promise<{
    isTokenConfigured: boolean
    databaseId: string | null
    databaseUrl: string | null
    dataSourceId: string | null
    fieldMapping: FieldMapping | null
  }> => ipcRenderer.invoke('settings:load'),

  // 清除设置
  clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke('settings:clear')
}

// Notion API - 所有请求通过 main process 处理，token 安全
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

export interface StatusOption {
  id: string
  name: string
  color: string
}

// 属性更新类型
export interface PropertyUpdate {
  field: 'title' | 'status' | 'due'
  value: string | null
}

const notionAPI = {
  // 测试连接（Save & Verify）
  testConnection: (data: {
    token: string
    databaseUrl: string
  }): Promise<{
    success: boolean
    databaseId?: string
    dataSourceId?: string
    propertyCount?: number
    error?: NotionError
  }> => ipcRenderer.invoke('notion:testConnection', data),

  // 获取 Schema（用于字段映射）
  getSchema: (): Promise<{
    success: boolean
    dataSourceId?: string
    properties?: PropertySchema[]
    error?: NotionError
  }> => ipcRenderer.invoke('notion:getSchema'),

  // 保存字段映射
  saveFieldMapping: (mapping: FieldMapping): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('notion:saveFieldMapping', mapping),

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

  // 更新任务（Title/Status/Due）
  updateTask: (options: {
    pageId: string
    updates: PropertyUpdate[]
  }): Promise<{
    success: boolean
    error?: NotionError
  }> => ipcRenderer.invoke('notion:updateTask', options),

  // 清除缓存
  clearCache: (): Promise<{ success: boolean }> => ipcRenderer.invoke('notion:clearCache')
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
// Context isolation is always enabled for security
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('windowAPI', windowAPI)
    contextBridge.exposeInMainWorld('settingsAPI', settingsAPI)
    contextBridge.exposeInMainWorld('notionAPI', notionAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.windowAPI = windowAPI
  // @ts-ignore (define in dts)
  window.settingsAPI = settingsAPI
  // @ts-ignore (define in dts)
  window.notionAPI = notionAPI
}
