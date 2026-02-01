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
  openSettings: (tab?: 'connection' | 'field-mapping') => Promise<void>
  onSettingsWindowClosed: (callback: () => void) => () => void
  onSettingsSetTab: (callback: (tab: string) => void) => () => void
  closeCurrentWindow: () => Promise<void>
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

/**
 * 映射验证状态
 */
export type MappingStatus =
  | 'valid' // 映射有效
  | 'invalid' // 映射无效（database 变化等）
  | 'incomplete' // 映射不完整
  | 'not_configured' // 未配置

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
    fieldMapping: FieldMapping | null
  }>
  saveFieldMapping: (mapping: FieldMapping) => Promise<{ success: boolean; error?: string }>
  clear: () => Promise<{ success: boolean }>
}

export type StatusFilterKey = 'all' | 'todo' | 'in-progress' | 'done'

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

/**
 * 映射验证结果
 */
export interface ValidateMappingResult {
  status: MappingStatus
  message?: string
  // 各字段是否有效
  textValid?: boolean
  statusValid?: boolean
  timeValid?: boolean
}

// ========== Billing Types ==========

/**
 * 订阅计划类型
 */
export type BillingPlan = 'free' | 'monthly' | 'lifetime'

/**
 * 订阅权限数据结构
 */
export interface Entitlement {
  plan: BillingPlan
  purchasedAt: string | null // ISO date string
  expiresAt: string | null // ISO date string, null for lifetime
}

/**
 * Billing API
 */
export interface BillingAPI {
  /**
   * 获取当前订阅权限
   */
  getEntitlement: () => Promise<Entitlement>

  /**
   * 设置订阅权限 (仅用于模拟购买)
   */
  setEntitlement: (entitlement: Entitlement) => Promise<{ success: boolean }>

  /**
   * 重置为免费计划
   */
  resetEntitlement: () => Promise<{ success: boolean }>

  /**
   * 检查是否可以编辑
   */
  canEdit: () => Promise<boolean>
}

export interface NotionAPI {
  /**
   * 测试连接（Save & Verify）
   * 验证 token 和 databaseUrl，获取 dataSourceId
   */
  testConnection: (data: {
    token: string
    databaseUrl: string
  }) => Promise<TestConnectionResult>

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
   * 加载字段映射
   */
  loadFieldMapping: () => Promise<{
    mapping: FieldMapping | null
    status: MappingStatus
    message?: string
  }>

  /**
   * 查询任务列表
   */
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

  /**
   * 获取 Database 信息（用于验证配置）
   */
  getDatabaseInfo: () => Promise<{
    success: boolean
    databaseId?: string
    dataSourceId?: string
    error?: NotionError
  }>

  /**
   * 获取 Database Schema（兼容旧 API）
   */
  getDatabaseSchema: () => Promise<{
    success: boolean
    properties?: PropertySchema[]
    error?: NotionError
  }>

  /**
   * 更新任务
   */
  updateTask: (options: {
    pageId: string
    updates: PropertyUpdate[]
  }) => Promise<{
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
    electron: ElectronAPI
    windowAPI: WindowAPI
    settingsAPI: SettingsAPI
    notionAPI: NotionAPI
    billingAPI: BillingAPI
  }
}
