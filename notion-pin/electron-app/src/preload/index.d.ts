import type { StatusFilterKey } from '../shared/statusFilters'
export type { StatusFilterKey } from '../shared/statusFilters'

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
  /** 安全打开外部链接（仅允许 notion.so 域名） */
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * 字段映射 - 用 propertyId 存储
 * UI 名称: Text (Task name) / Status / Time
 * Notion 类型: title|rich_text / status / date
 */
export interface FieldMapping {
  textPropertyId: string | null // UI: Text (Task name), Notion: title 或 rich_text
  statusPropertyId: string | null // UI: Status, Notion: status only
  timePropertyId: string | null // UI: Time, Notion: date
  // 绑定的 dataSourceId，用于检测 database 变化
  boundDataSourceId?: string | null
}

/** Status/Select 选项（含 Notion API 颜色名） */
export interface StatusOption {
  id: string
  name: string
  color: string
}

/**
 * Notion 数据库属性 schema
 */
export interface PropertySchema {
  id: string
  name: string
  type: string
  options?: StatusOption[]
}

/**
 * Schema 加载状态
 */
export type SchemaStatus =
  | 'not_loaded' // 未加载
  | 'loading' // 加载中
  | 'loaded' // 已加载
  | 'error' // 加载失败

export interface SettingsAPI {
  load: () => Promise<{
    isTokenConfigured: boolean
    databaseId: string | null
    databaseUrl: string | null
    dataSourceId: string | null
    fieldMapping: FieldMapping | null
  }>
  clear: () => Promise<{ success: boolean }>
}

export interface NotionTask {
  id: string
  title: string // 对应 Text (Task name)
  status: string | null // 对应 Status
  due: string | null // 对应 Time
  url: string
  lastEditedTime: string
}

export interface NotionError {
  code: string
  message: string
  userMessage: string
  retryAfter?: number
}

/**
 * 属性更新 - 字段名映射
 * title -> Text (Task name)
 * status -> Status
 * due -> Time
 */
export interface PropertyUpdate {
  field: 'title' | 'status' | 'due'
  value: string | null
}

/**
 * 连接测试结果
 */
export interface TestConnectionResult {
  success: boolean
  databaseId?: string
  dataSourceId?: string
  propertyCount?: number
  error?: NotionError
}

/**
 * Schema 获取结果
 */
export interface GetSchemaResult {
  success: boolean
  dataSourceId?: string
  properties?: PropertySchema[]
  error?: NotionError
}

export interface NotionAPI {
  /**
   * 测试连接（Save & Verify）
   * 验证 token 和 databaseUrl，获取 dataSourceId
   */
  testConnection: (data: { token: string; databaseUrl: string }) => Promise<TestConnectionResult>

  /**
   * 获取 Schema（用于字段映射）
   * 返回所有 properties，供 UI 筛选
   */
  getSchema: () => Promise<GetSchemaResult>

  /**
   * 保存字段映射
   */
  saveFieldMapping: (mapping: FieldMapping) => Promise<{ success: boolean; error?: string }>

  /**
   * 查询任务列表
   */
  queryTasks: (options?: { statusFilter?: StatusFilterKey; cursor?: string }) => Promise<{
    success: boolean
    tasks?: NotionTask[]
    hasMore?: boolean
    nextCursor?: string | null
    totalFetched?: number
    error?: NotionError
  }>

  /**
   * 更新任务
   */
  updateTask: (options: { pageId: string; updates: PropertyUpdate[] }) => Promise<{
    success: boolean
    error?: NotionError
  }>

  /**
   * 清除缓存
   */
  clearCache: () => Promise<{ success: boolean }>
}

declare global {
  interface Window {
    windowAPI: WindowAPI
    settingsAPI: SettingsAPI
    notionAPI: NotionAPI
  }
}
