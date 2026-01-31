/**
 * Notion Service - 在 main process 中调用 Notion API
 * Token 只在此模块中使用，永不暴露给 renderer
 *
 * 使用 Notion API 2025-09-03:
 * - databases.retrieve 获取 database 信息和 data_sources
 * - dataSources.query 查询任务列表（支持 filter/sorts/分页）
 */

import { Client, APIErrorCode, isNotionClientError } from '@notionhq/client'

// ========== 常量配置 ==========

const PAGE_SIZE = 100 // Notion API 最大 100
const MAX_PAGES = 5 // 最多拉取 5 页（500 条）
const UPDATE_THROTTLE_MS = 400 // 更新节流时间（合并快速连续更新）
const MAX_RETRY_COUNT = 1 // 429 最多重试次数

// 状态过滤映射（对应 Notion Status 属性）
export const STATUS_FILTERS = {
  all: null,
  todo: ['not started', 'todo', '待办'],
  'in-progress': ['in progress', 'progress', '进行'],
  done: ['done', 'complete', '完成']
} as const

export type StatusFilterKey = keyof typeof STATUS_FILTERS

// ========== 类型定义 ==========

export interface NotionTask {
  id: string
  title: string
  status: string | null
  due: string | null
  url: string
  lastEditedTime: string
}

export interface DataSource {
  id: string
  type: string
}

/** Status/Select 选项（含 Notion API 颜色名） */
export interface StatusOption {
  id: string
  name: string
  color: string // Notion: default|gray|brown|orange|yellow|green|blue|purple|pink|red
}

export interface PropertySchema {
  id: string
  name: string
  type: string
  /** status/select 类型的选项（含颜色） */
  options?: StatusOption[]
}

export interface NotionError {
  code: string
  message: string
  userMessage: string
  retryAfter?: number // 429 限流时的重试等待秒数
}

/**
 * 字段映射 - 用 propertyId 存储
 * UI: Text (Task name) / Status / Time
 * Notion: title|rich_text / status / date
 */
export interface FieldMapping {
  textPropertyId: string | null // UI: Text, Notion: title 或 rich_text
  statusPropertyId: string | null // UI: Status, Notion: status only
  timePropertyId: string | null // UI: Time, Notion: date
  boundDataSourceId?: string | null
}

export interface QueryTasksOptions {
  dataSourceId: string
  statusFilter?: StatusFilterKey
  cursor?: string
  fieldMapping?: FieldMapping | null
}

export interface QueryTasksResult {
  success: boolean
  tasks?: NotionTask[]
  hasMore?: boolean
  nextCursor?: string | null
  totalFetched?: number
  error?: NotionError
}

export interface GetDatabaseResult {
  success: boolean
  dataSources?: DataSource[]
  defaultDataSourceId?: string
  properties?: PropertySchema[]
  error?: NotionError
}

// ========== 更新相关类型 ==========

/**
 * 属性更新值
 */
export interface PropertyUpdate {
  // 哪个字段
  field: 'title' | 'status' | 'due'
  // 新值（title: string, status: string, due: string|null）
  value: string | null
}

/**
 * 更新任务选项
 */
export interface UpdateTaskOptions {
  pageId: string
  updates: PropertyUpdate[]
  fieldMapping: FieldMapping
  // 属性类型映射（用于判断 status 是 status 还是 select）
  propertyTypes?: Record<string, string>
}

/**
 * 更新任务结果
 */
export interface UpdateTaskResult {
  success: boolean
  error?: NotionError
}

/**
 * 写请求队列项
 */
interface WriteQueueItem {
  pageId: string
  updates: PropertyUpdate[]
  fieldMapping: FieldMapping
  propertyTypes?: Record<string, string>
  resolve: (result: UpdateTaskResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout> | null
}

// ========== 错误处理 ==========

function parseNotionError(error: unknown): NotionError {
  if (isNotionClientError(error)) {
    // 处理 429 限流
    if (error.code === APIErrorCode.RateLimited) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retryAfter = (error as any).headers?.['retry-after']
      return {
        code: 'rate_limited',
        message: error.message,
        userMessage: `请求过于频繁，请 ${retryAfter || 60} 秒后重试`,
        retryAfter: retryAfter ? parseInt(retryAfter, 10) : 60
      }
    }

    switch (error.code) {
      case APIErrorCode.Unauthorized:
        return {
          code: 'unauthorized',
          message: error.message,
          userMessage: 'Token 无效或已过期，请在设置中重新配置 Notion Token'
        }
      case APIErrorCode.ObjectNotFound:
        return {
          code: 'not_found',
          message: error.message,
          userMessage:
            'Database 未找到。请确保：\n1. Database 已分享给你的 Integration\n2. 在 Notion 中打开页面 → 右上角 ••• → Add connections → 选择你的 Integration'
        }
      case APIErrorCode.RestrictedResource:
        return {
          code: 'restricted',
          message: error.message,
          userMessage:
            'Integration 没有访问权限。\n请在 Notion 中：页面右上角 ••• → Add connections → 选择你的 Integration'
        }
      case APIErrorCode.ValidationError:
        return {
          code: 'validation_error',
          message: error.message,
          userMessage: '请求参数错误：' + error.message
        }
      default:
        return {
          code: error.code,
          message: error.message,
          userMessage: 'Notion API 错误：' + error.message
        }
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    code: 'unknown',
    message,
    userMessage: '未知错误：' + message
  }
}

// ========== 延迟函数 ==========

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ========== Service 类 ==========

export class NotionService {
  private client: Client
  private propertyCache: Map<string, PropertySchema[]> = new Map()
  // 写请求队列（按 pageId 分组）
  private writeQueue: Map<string, WriteQueueItem> = new Map()

  constructor(token: string) {
    this.client = new Client({ auth: token })
  }

  // ========== 更新任务 ==========

  /**
   * 更新任务（带节流队列）
   * 同一 pageId 的快速连续更新会合并
   */
  async updateTask(options: UpdateTaskOptions): Promise<UpdateTaskResult> {
    const { pageId, updates, fieldMapping, propertyTypes } = options

    return new Promise((resolve, reject) => {
      // 检查队列中是否已有该 pageId 的请求
      const existing = this.writeQueue.get(pageId)

      if (existing) {
        // 合并更新（新的覆盖旧的）
        const mergedUpdates = [...existing.updates]
        for (const update of updates) {
          const idx = mergedUpdates.findIndex((u) => u.field === update.field)
          if (idx >= 0) {
            mergedUpdates[idx] = update
          } else {
            mergedUpdates.push(update)
          }
        }
        existing.updates = mergedUpdates
        existing.fieldMapping = fieldMapping
        existing.propertyTypes = propertyTypes

        // 重置 timer
        if (existing.timer) {
          clearTimeout(existing.timer)
        }
        existing.timer = setTimeout(() => this.flushWrite(pageId), UPDATE_THROTTLE_MS)

        // 返回同一个 Promise（通过链式调用）
        existing.resolve = (result) => {
          resolve(result)
        }
        existing.reject = reject
      } else {
        // 新请求
        const item: WriteQueueItem = {
          pageId,
          updates,
          fieldMapping,
          propertyTypes,
          resolve,
          reject,
          timer: setTimeout(() => this.flushWrite(pageId), UPDATE_THROTTLE_MS)
        }
        this.writeQueue.set(pageId, item)
      }
    })
  }

  /**
   * 执行写操作（从队列中取出并发送 API）
   */
  private async flushWrite(pageId: string): Promise<void> {
    const item = this.writeQueue.get(pageId)
    if (!item) return

    this.writeQueue.delete(pageId)
    item.timer = null

    try {
      const result = await this.executeUpdate(
        pageId,
        item.updates,
        item.fieldMapping,
        item.propertyTypes
      )
      item.resolve(result)
    } catch (error) {
      item.reject(error as Error)
    }
  }

  /**
   * 实际执行 Notion API 更新
   */
  private async executeUpdate(
    pageId: string,
    updates: PropertyUpdate[],
    fieldMapping: FieldMapping,
    propertyTypes?: Record<string, string>,
    retryCount = 0
  ): Promise<UpdateTaskResult> {
    try {
      // 构建 properties 对象
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties: Record<string, any> = {}

      for (const update of updates) {
        const propId = this.getPropertyIdForField(update.field, fieldMapping)
        // 若该字段未配置映射，返回明确错误（避免静默跳过）
        if (!propId) {
          const fieldNames: Record<string, string> = {
            title: '标题 (Title)',
            status: '状态 (Status)',
            due: '截止日期 (Due)'
          }
          return {
            success: false,
            error: {
              code: 'no_field_mapping',
              message: `Field ${update.field} not mapped`,
              userMessage: `请先在设置 → 字段映射中配置 ${fieldNames[update.field]} 字段`
            }
          }
        }
        const propValue = this.buildPropertyValue(update, fieldMapping, propertyTypes)
        if (propValue) {
          properties[propId] = propValue
        }
      }

      if (Object.keys(properties).length === 0) {
        return { success: true } // 没有有效更新
      }

      // 调用 Notion API
      await this.client.pages.update({
        page_id: pageId,
        properties
      })

      return { success: true }
    } catch (error) {
      const notionError = parseNotionError(error)

      // 429 限流重试
      if (notionError.code === 'rate_limited' && retryCount < MAX_RETRY_COUNT) {
        const waitTime = (notionError.retryAfter || 1) * 1000
        await delay(waitTime)
        return this.executeUpdate(pageId, updates, fieldMapping, propertyTypes, retryCount + 1)
      }

      return { success: false, error: notionError }
    }
  }

  /**
   * 获取字段对应的 propertyId
   * field: title -> textPropertyId, status -> statusPropertyId, due -> timePropertyId
   */
  private getPropertyIdForField(
    field: 'title' | 'status' | 'due',
    fieldMapping: FieldMapping
  ): string | null {
    switch (field) {
      case 'title':
        return fieldMapping.textPropertyId
      case 'status':
        return fieldMapping.statusPropertyId
      case 'due':
        return fieldMapping.timePropertyId
      default:
        return null
    }
  }

  /**
   * 构建 Notion property value 结构
   * Text 支持 title 或 rich_text；Status 仅 status；Time 为 date
   */
  private buildPropertyValue(
    update: PropertyUpdate,
    fieldMapping: FieldMapping,
    propertyTypes?: Record<string, string>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    const { field, value } = update

    switch (field) {
      case 'title': {
        // Text: title 或 rich_text
        const propId = fieldMapping.textPropertyId
        const propType = propId && propertyTypes ? propertyTypes[propId] : 'title'
        const textContent = [
          { type: 'text' as const, text: { content: value || '' } }
        ]
        if (propType === 'rich_text') {
          return { rich_text: textContent }
        }
        return { title: textContent }
      }

      case 'status': {
        // Status 只允许 status 类型（不允许 select）
        if (!value) {
          return { status: null }
        }
        return {
          status: {
            name: value
          }
        }
      }

      case 'due':
        // Date property 结构（start/end/time_zone，目前只用 start）
        if (!value) {
          return { date: null }
        }
        return {
          date: {
            start: value, // ISO 8601: YYYY-MM-DD 或 YYYY-MM-DDTHH:MM:SS
            end: null,
            time_zone: null
          }
        }

      default:
        return null
    }
  }

  /**
   * 通过 dataSources.retrieve 获取 schema.properties
   */
  async getDataSourceSchema(dataSourceId: string): Promise<{
    success: boolean
    properties?: PropertySchema[]
    error?: NotionError
  }> {
    try {
      const response = await this.client.dataSources.retrieve({
        data_source_id: dataSourceId
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseAny = response as any
      const properties: PropertySchema[] = []

      if (responseAny.properties) {
        for (const [name, prop] of Object.entries(responseAny.properties)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prop as any
          const schema: PropertySchema = {
            id: p.id,
            name,
            type: p.type
          }
          const opts = p.status?.options ?? p.select?.options
          if (Array.isArray(opts) && opts.length > 0) {
            schema.options = opts.map(
              (o: { id?: string; name?: string; color?: string }) => ({
                id: o.id ?? '',
                name: o.name ?? '',
                color: o.color ?? 'default'
              })
            )
          }
          properties.push(schema)
        }
      }

      return { success: true, properties }
    } catch (error) {
      return {
        success: false,
        error: parseNotionError(error)
      }
    }
  }

  /**
   * 获取 Database 信息和 data_sources（用于获取 dataSourceId）
   */
  async getDatabaseAndDataSources(databaseId: string): Promise<GetDatabaseResult> {
    try {
      const response = await this.client.databases.retrieve({
        database_id: databaseId
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseAny = response as any

      // 提取 data_sources
      const dataSources: DataSource[] = responseAny.data_sources || []
      const defaultDataSource = this.pickDefaultDataSource(dataSources)

      // 提取 properties schema（含 status/select 的 options 和 color）
      const properties: PropertySchema[] = []
      if (responseAny.properties) {
        for (const [name, prop] of Object.entries(responseAny.properties)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prop as any
          const schema: PropertySchema = {
            id: p.id,
            name,
            type: p.type
          }
          // status 或 select 类型：提取 options（含 color）
          const opts = p.status?.options ?? p.select?.options
          if (Array.isArray(opts) && opts.length > 0) {
            schema.options = opts.map(
              (o: { id?: string; name?: string; color?: string }) => ({
                id: o.id ?? '',
                name: o.name ?? '',
                color: o.color ?? 'default'
              })
            )
          }
          properties.push(schema)
        }
      }

      // 缓存 properties
      if (defaultDataSource?.id) {
        this.propertyCache.set(defaultDataSource.id, properties)
      }

      return {
        success: true,
        dataSources,
        defaultDataSourceId: defaultDataSource?.id,
        properties
      }
    } catch (error) {
      return {
        success: false,
        error: parseNotionError(error)
      }
    }
  }

  /**
   * 选择默认 data source
   */
  pickDefaultDataSource(dataSources: DataSource[]): DataSource | null {
    if (!dataSources || dataSources.length === 0) {
      return null
    }
    return dataSources[0]
  }

  /**
   * 查询任务列表
   * 支持分页，客户端过滤
   * 使用 filter_properties 仅请求映射的 3 个字段以优化性能
   */
  async queryTasks(options: QueryTasksOptions): Promise<QueryTasksResult> {
    const { dataSourceId, statusFilter = 'all', cursor, fieldMapping } = options

    try {
      // 构建 filter_properties - 仅请求映射的字段
      const filterProperties: string[] = []
      if (fieldMapping?.textPropertyId) filterProperties.push(fieldMapping.textPropertyId)
      if (fieldMapping?.statusPropertyId) filterProperties.push(fieldMapping.statusPropertyId)
      if (fieldMapping?.timePropertyId) filterProperties.push(fieldMapping.timePropertyId)

      // 构建 sorts - 使用 timestamp 排序（最可靠）
      const sorts = [
        { timestamp: 'last_edited_time' as const, direction: 'descending' as const }
      ]

      // 调用 API - 使用 filter_properties 优化
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        sorts,
        page_size: PAGE_SIZE,
        start_cursor: cursor || undefined,
        ...(filterProperties.length > 0 && { filter_properties: filterProperties })
      })

      // 解析任务（传入字段映射）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tasks: NotionTask[] = response.results.map((page: any) => {
        return this.parsePageToTask(page, fieldMapping)
      })

      // 客户端过滤
      if (statusFilter !== 'all') {
        tasks = this.filterTasksByStatus(tasks, statusFilter)
      }

      return {
        success: true,
        tasks,
        hasMore: response.has_more,
        nextCursor: response.next_cursor,
        totalFetched: tasks.length
      }
    } catch (error) {
      return {
        success: false,
        error: parseNotionError(error)
      }
    }
  }

  /**
   * 客户端过滤任务状态
   */
  private filterTasksByStatus(tasks: NotionTask[], statusFilter: StatusFilterKey): NotionTask[] {
    const keywords = STATUS_FILTERS[statusFilter]
    if (!keywords) return tasks

    return tasks.filter((task) => {
      const status = task.status?.toLowerCase() || ''
      // 无状态的任务归类到 todo
      if (!status && statusFilter === 'todo') return true
      return keywords.some((keyword) => status.includes(keyword))
    })
  }

  /**
   * 查询所有任务（自动分页）
   * 最多拉取 MAX_PAGES 页
   */
  async queryAllTasks(
    options: Omit<QueryTasksOptions, 'cursor'>
  ): Promise<QueryTasksResult> {
    const allTasks: NotionTask[] = []
    let cursor: string | undefined = undefined
    let pageCount = 0

    while (pageCount < MAX_PAGES) {
      const result = await this.queryTasks({
        ...options,
        cursor
      })

      if (!result.success) {
        // 如果是限流错误，等待后重试一次
        if (result.error?.code === 'rate_limited' && result.error.retryAfter) {
          await delay(result.error.retryAfter * 1000)
          continue // 重试当前页
        }
        return result
      }

      if (result.tasks) {
        allTasks.push(...result.tasks)
      }

      pageCount++

      if (!result.hasMore || !result.nextCursor) {
        break
      }

      cursor = result.nextCursor
    }

    return {
      success: true,
      tasks: allTasks,
      hasMore: pageCount >= MAX_PAGES,
      totalFetched: allTasks.length
    }
  }

  /**
   * 解析 Notion page 为 Task 对象
   * Text: title/rich_text -> plain_text 拼接
   * Status: status -> status.name（仅 status 类型，不含 select）
   * Time: date -> date.start（带时间则显示到分钟）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePageToTask(page: any, fieldMapping?: FieldMapping | null): NotionTask {
    const properties = page.properties || {}

    // Text (Task name): title 或 rich_text
    let title = 'Untitled'
    const textProp = fieldMapping?.textPropertyId
      ? this.findPropertyById(properties, fieldMapping.textPropertyId)
      : this.findPropertyByNames(properties, ['Name', 'Title', 'Task', '任务', '名称'])

    if (textProp) {
      if (textProp.type === 'title' && textProp.title?.length > 0) {
        title = textProp.title.map((t: { plain_text: string }) => t.plain_text).join('')
      } else if (textProp.type === 'rich_text' && textProp.rich_text?.length > 0) {
        title = textProp.rich_text.map((t: { plain_text: string }) => t.plain_text).join('')
      }
    }

    // Status: 仅 status 类型
    let status: string | null = null
    const statusProp = fieldMapping?.statusPropertyId
      ? this.findPropertyById(properties, fieldMapping.statusPropertyId)
      : this.findPropertyByNames(properties, ['Status', '状态'])

    if (statusProp && statusProp.type === 'status' && statusProp.status) {
      status = statusProp.status.name
    }

    // Time: date -> date.start（带时间则保留到分钟）
    let due: string | null = null
    const timeProp = fieldMapping?.timePropertyId
      ? this.findPropertyById(properties, fieldMapping.timePropertyId)
      : this.findPropertyByNames(properties, [
          'Due',
          'Date',
          'Start date',
          'Start Date',
          '截止日期'
        ])

    if (timeProp?.type === 'date' && timeProp.date?.start) {
      due = this.formatDateForDisplay(timeProp.date.start)
    }

    return {
      id: page.id,
      title,
      status,
      due,
      url: page.url || `https://notion.so/${page.id.replace(/-/g, '')}`,
      lastEditedTime: page.last_edited_time || ''
    }
  }

  /** 日期格式化：带时间则显示到分钟 */
  private formatDateForDisplay(dateStr: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const hasTime = dateStr.includes('T') && dateStr.length > 10
    if (hasTime) {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const h = String(date.getHours()).padStart(2, '0')
      const min = String(date.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${d} ${h}:${min}`
    }
    return dateStr
  }

  /**
   * 通过 propertyId 查找属性
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findPropertyById(properties: any, propertyId: string): any | null {
    for (const prop of Object.values(properties)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((prop as any).id === propertyId) {
        return prop
      }
    }
    return null
  }

  /**
   * 通过属性名列表查找属性（回退逻辑）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findPropertyByNames(properties: any, names: string[]): any | null {
    for (const name of names) {
      if (properties[name]) {
        return properties[name]
      }
    }
    return null
  }
}

// ========== 工厂函数 ==========

let cachedService: NotionService | null = null
let cachedToken: string | null = null

export function getNotionService(token: string): NotionService {
  if (!cachedService || cachedToken !== token) {
    cachedService = new NotionService(token)
    cachedToken = token
  }
  return cachedService
}

export function clearNotionServiceCache(): void {
  cachedService = null
  cachedToken = null
}
