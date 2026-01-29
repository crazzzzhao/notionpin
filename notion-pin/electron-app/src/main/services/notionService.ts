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

export interface PropertySchema {
  id: string
  name: string
  type: string
}

export interface NotionError {
  code: string
  message: string
  userMessage: string
  retryAfter?: number // 429 限流时的重试等待秒数
}

export interface QueryTasksOptions {
  dataSourceId: string
  statusFilter?: StatusFilterKey
  cursor?: string
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

  constructor(token: string) {
    this.client = new Client({ auth: token })
  }

  /**
   * 获取 Database 信息和 data_sources
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

      // 提取 properties schema
      const properties: PropertySchema[] = []
      if (responseAny.properties) {
        for (const [name, prop] of Object.entries(responseAny.properties)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prop as any
          properties.push({
            id: p.id,
            name,
            type: p.type
          })
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
   * 注：服务端 filter 需要精确匹配属性名和类型，为兼容性先在客户端过滤
   */
  async queryTasks(options: QueryTasksOptions): Promise<QueryTasksResult> {
    const { dataSourceId, statusFilter = 'all', cursor } = options

    try {
      // 构建 sorts - 使用 timestamp 排序（最可靠）
      const sorts = [
        { timestamp: 'last_edited_time' as const, direction: 'descending' as const }
      ]

      // 调用 API - 不使用服务端 filter，获取所有数据后客户端过滤
      const response = await this.client.dataSources.query({
        data_source_id: dataSourceId,
        sorts,
        page_size: PAGE_SIZE,
        start_cursor: cursor || undefined
      })

      // 解析任务
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tasks: NotionTask[] = response.results.map((page: any) => {
        return this.parsePageToTask(page)
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
  async queryAllTasks(options: Omit<QueryTasksOptions, 'cursor'>): Promise<QueryTasksResult> {
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
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parsePageToTask(page: any): NotionTask {
    const properties = page.properties || {}

    // 提取 Title
    let title = 'Untitled'
    const titleProp =
      properties['Name'] ||
      properties['Title'] ||
      properties['Task'] ||
      properties['任务'] ||
      properties['名称']

    if (titleProp) {
      if (titleProp.type === 'title' && titleProp.title?.length > 0) {
        title = titleProp.title.map((t: { plain_text: string }) => t.plain_text).join('')
      }
    }

    // 提取 Status
    let status: string | null = null
    const statusProp = properties['Status'] || properties['状态']
    if (statusProp) {
      if (statusProp.type === 'status' && statusProp.status) {
        status = statusProp.status.name
      } else if (statusProp.type === 'select' && statusProp.select) {
        status = statusProp.select.name
      }
    }

    // 提取 Due date
    let due: string | null = null
    const dueProp = properties['Due'] || properties['Date'] || properties['截止日期']
    if (dueProp) {
      if (dueProp.type === 'date' && dueProp.date) {
        due = dueProp.date.start
      }
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
