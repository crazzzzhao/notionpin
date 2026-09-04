import { app, shell, BrowserWindow, ipcMain, screen, safeStorage } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { prepareLocalConfig } from './configMigration'
import {
  isAllowedNotionUrl,
  isRecord,
  isValidFieldMapping,
  isValidNotionToken,
  isValidQueryTasksInput,
  isValidUpdateTaskInput,
  normalizeWindowSize,
  parseDatabaseId
} from '../shared/validation'
import {
  getNotionService,
  clearNotionServiceCache,
  type NotionTask,
  type NotionError,
  type UpdateTaskResult,
  type PropertySchema
} from './services/notionService'

// 窗口常量 - 默认宽 400px，最小宽 400px，可左右拖拽调整
const WINDOW_WIDTH = 400
const WINDOW_MIN_WIDTH = 400
const WINDOW_MIN_HEIGHT = 52
const COLLAPSED_HEIGHT = 52
const EXPANDED_HEIGHT = 420

app.setName('NotionPin')

// ========== 字段映射类型 ==========

/**
 * 字段映射 - 用 propertyId 存储
 * UI 名称: Text (Task name) / Status / Time
 * Notion 类型: title|rich_text / status / date
 */
interface FieldMapping {
  textPropertyId: string | null // UI: Text, Notion: title 或 rich_text
  statusPropertyId: string | null // UI: Status, Notion: status only
  timePropertyId: string | null // UI: Time, Notion: date
  boundDataSourceId?: string | null // 绑定的 dataSourceId
}

type MappingStatus = 'valid' | 'invalid' | 'incomplete' | 'not_configured'

// 持久化存储
interface StoreSchema {
  windowBounds: { x: number; y: number; width: number; height: number } | null
  isCollapsed: boolean
  // Settings - token 加密存储
  encryptedToken: string | null
  databaseId: string | null
  databaseUrl: string | null
  // Data source ID (API 2025-09-03)
  dataSourceId: string | null
  // 字段映射
  fieldMapping: FieldMapping | null
}

/**
 * 从 schema 自动检测字段映射
 * 规则:
 * - Text: 优先 title，否则第一个 rich_text
 * - Status: 第一个 status（只允许 status，不允许 select）
 * - Time: 优先 date 且 name 包含 start/begin，否则第一个 date
 */
function autoDetectFieldMapping(
  properties: PropertySchema[],
  dataSourceId: string | null
): FieldMapping {
  const mapping: FieldMapping = {
    textPropertyId: null,
    statusPropertyId: null,
    timePropertyId: null,
    boundDataSourceId: dataSourceId
  }

  // Text: 优先 title，否则第一个 rich_text
  const titleProp = properties.find((p) => p.type === 'title')
  if (titleProp) {
    mapping.textPropertyId = titleProp.id
  } else {
    const richTextProp = properties.find((p) => p.type === 'rich_text')
    if (richTextProp) {
      mapping.textPropertyId = richTextProp.id
    }
  }

  // Status: 只允许 status 类型（不允许 select）
  const statusProp = properties.find((p) => p.type === 'status')
  if (statusProp) {
    mapping.statusPropertyId = statusProp.id
  }

  // Time: 优先 date 且 name 包含 start/begin，否则第一个 date
  const dateProps = properties.filter((p) => p.type === 'date')
  const startDateProp = dateProps.find((p) => /start|begin/i.test(p.name))
  if (startDateProp) {
    mapping.timePropertyId = startDateProp.id
  } else if (dateProps.length > 0) {
    mapping.timePropertyId = dateProps[0].id
  }

  return mapping
}

/**
 * 验证映射状态
 */
function validateMapping(
  mapping: FieldMapping | null,
  currentDataSourceId: string | null
): { status: MappingStatus; message?: string } {
  if (!mapping) {
    return { status: 'not_configured', message: 'Please configure field mapping first' }
  }

  // 检查 dataSourceId 变化
  if (mapping.boundDataSourceId && mapping.boundDataSourceId !== currentDataSourceId) {
    return { status: 'invalid', message: 'Database changed, please re-map fields.' }
  }

  // 检查必填字段
  if (!mapping.textPropertyId || !mapping.statusPropertyId || !mapping.timePropertyId) {
    const missing: string[] = []
    if (!mapping.textPropertyId) missing.push('Text')
    if (!mapping.statusPropertyId) missing.push('Status')
    if (!mapping.timePropertyId) missing.push('Time')
    return {
      status: 'incomplete',
      message: `Please configure these field mappings: ${missing.join(', ')}`
    }
  }

  return { status: 'valid' }
}

// electron-store 是 ESM 模块，需要动态导入
let store: import('electron-store').default<StoreSchema>

async function initStore(): Promise<void> {
  const Store = (await import('electron-store')).default
  const currentConfigPath = join(app.getPath('userData'), 'config.json')
  const expectedConfigPath = join(app.getPath('appData'), 'NotionPin', 'config.json')

  // Isolated test profiles must never import the user's real legacy configuration.
  if (currentConfigPath === expectedConfigPath) {
    const legacyConfigPath = join(app.getPath('appData'), 'electron-app', 'config.json')
    prepareLocalConfig(legacyConfigPath, currentConfigPath)
  }

  store = new Store<StoreSchema>({
    defaults: {
      windowBounds: null,
      isCollapsed: false,
      encryptedToken: null,
      databaseId: null,
      databaseUrl: null,
      dataSourceId: null,
      fieldMapping: null
    }
  })
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

// Settings 独立窗口尺寸
const SETTINGS_WINDOW_WIDTH = 360
const SETTINGS_WINDOW_HEIGHT = 560

async function openNotionUrl(url: unknown): Promise<boolean> {
  if (!isAllowedNotionUrl(url)) return false

  try {
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
}

function configureWindowSecurity(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openNotionUrl(url)
    return { action: 'deny' }
  })

  // The app has no in-window navigation. Programmatic loadURL/loadFile calls are unaffected.
  window.webContents.on('will-navigate', (event) => event.preventDefault())
}

function getDefaultPosition(): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth } = primaryDisplay.workAreaSize
  const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea

  // 默认右上角，留 20px 边距
  return {
    x: workAreaX + screenWidth - WINDOW_WIDTH - 20,
    y: workAreaY + 20
  }
}

function createWindow(): void {
  const isCollapsed = store.get('isCollapsed')
  const savedBounds = store.get('windowBounds')
  const defaultPos = getDefaultPosition()

  const windowHeight = isCollapsed ? COLLAPSED_HEIGHT : (savedBounds?.height ?? EXPANDED_HEIGHT)

  // Create the browser window - 默认 400px 宽，可左右拖拽，最小 400px
  // macOS: 使用系统 vibrancy 实现真正的背景模糊，配合 roundedCorners 避免溢出
  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? WINDOW_WIDTH,
    height: windowHeight,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    x: savedBounds?.x ?? defaultPos.x,
    y: savedBounds?.y ?? defaultPos.y,
    show: false,
    frame: false, // 无边框窗口
    transparent: true, // 透明背景
    alwaysOnTop: true, // 置顶
    resizable: true, // 允许左右、上下拖拽调整大小
    skipTaskbar: false,
    autoHideMenuBar: true,
    hasShadow: true, // 保留阴影
    backgroundColor: '#00000000', // 完全透明背景
    // macOS 系统级模糊 + 圆角支持
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'sidebar' as const, // sidebar 提供强模糊且兼容性好
          visualEffectState: 'active' as const,
          roundedCorners: true // Electron 22+ 支持圆角
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true, // 安全：上下文隔离
      nodeIntegration: false // 安全：禁用 node 集成
    }
  })

  configureWindowSecurity(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 窗口移动时保存位置
  mainWindow.on('moved', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      store.set('windowBounds', bounds)
    }
  })

  // 窗口调整大小时保存尺寸
  mainWindow.on('resize', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      store.set('windowBounds', bounds)
    }
  })

  // 窗口关闭时保存状态
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      store.set('windowBounds', bounds)
    }
  })

  // HMR for renderer base on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 打开 Settings 独立窗口（不卡在主窗口内）
 */
function openSettingsWindow(tab: 'connection' | 'field-mapping' = 'connection'): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    settingsWindow.webContents.send('settings:setTab', tab)
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea

  // 居中显示在主屏幕
  const x = workAreaX + Math.floor((screenWidth - SETTINGS_WINDOW_WIDTH) / 2)
  const y = workAreaY + Math.floor((screenHeight - SETTINGS_WINDOW_HEIGHT) / 2)

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: 320,
    minHeight: 400,
    x,
    y,
    show: false,
    frame: true, // 有边框，可拖拽
    resizable: true,
    title: 'NotionPin - Settings',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  configureWindowSecurity(settingsWindow)

  const hash = `#settings/${tab}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
  } else {
    // loadFile 不支持 hash，用 loadURL
    settingsWindow.loadURL(`file://${join(__dirname, '../renderer/index.html')}${hash}`)
  }

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
    // 通知主窗口刷新（设置可能已更改）
    mainWindow?.webContents.send('settings:windowClosed')
  })
}

// IPC Handlers
function setupIPC(): void {
  function secureHandle<TArgs extends unknown[], TResult>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender)
      if (!senderWindow || (senderWindow !== mainWindow && senderWindow !== settingsWindow)) {
        throw new Error(`Blocked IPC sender for ${channel}`)
      }

      return listener(event, ...(args as TArgs))
    })
  }

  // 获取窗口状态
  secureHandle('window:getState', () => {
    return {
      isCollapsed: store.get('isCollapsed'),
      bounds: store.get('windowBounds')
    }
  })

  // 设置窗口状态
  secureHandle('window:setState', (_event, state: unknown) => {
    if (
      !isRecord(state) ||
      (state.isCollapsed !== undefined && typeof state.isCollapsed !== 'boolean')
    ) {
      throw new Error('Invalid window state')
    }
    if (typeof state.isCollapsed === 'boolean') {
      store.set('isCollapsed', state.isCollapsed)
    }
  })

  // 切换收起/展开 - 丝滑动画
  secureHandle('window:toggleCollapsed', () => {
    if (!mainWindow) return false

    const isCollapsed = store.get('isCollapsed')
    const newCollapsed = !isCollapsed

    // 更新存储
    store.set('isCollapsed', newCollapsed)

    // 调整窗口高度，保持当前宽度
    const bounds = mainWindow.getBounds()
    const newHeight = newCollapsed ? COLLAPSED_HEIGHT : Math.max(EXPANDED_HEIGHT, bounds.height)

    // macOS 支持 animate 选项实现丝滑动画
    mainWindow.setBounds(
      {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: newHeight
      },
      process.platform === 'darwin' // macOS 启用动画
    )

    return newCollapsed
  })

  // 关闭窗口
  secureHandle('window:close', () => {
    mainWindow?.close()
  })

  // 打开 Settings 独立窗口（不卡在主窗口内）
  secureHandle('window:openSettings', (_event, tab?: unknown) => {
    if (tab !== undefined && tab !== 'connection' && tab !== 'field-mapping') {
      throw new Error('Invalid settings tab')
    }
    openSettingsWindow(tab === 'field-mapping' ? tab : 'connection')
  })

  // 关闭当前窗口（Settings 窗口调用）
  secureHandle('window:closeCurrent', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 最小化窗口
  secureHandle('window:minimize', () => {
    mainWindow?.minimize()
  })

  // 调整窗口大小（供 renderer 拖拽手柄调用）
  secureHandle('window:resize', (_event, width: unknown, height: unknown) => {
    if (!mainWindow) return
    const size = normalizeWindowSize(width, height, WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT)
    if (!size) throw new Error('Invalid window size')
    const bounds = mainWindow.getBounds()
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, ...size })
    store.set('windowBounds', mainWindow.getBounds())
  })

  // ========== Shell IPC ==========

  /**
   * 安全打开外部链接（仅允许 notion.so 域名）
   */
  secureHandle('shell:openExternal', async (_event, url: unknown) => {
    const success = await openNotionUrl(url)
    return success
      ? { success: true }
      : { success: false, error: 'Only secure Notion URLs are allowed' }
  })

  // ========== Settings IPC ==========

  /**
   * 保存设置
   * - token 使用 safeStorage 加密后存储
   * - databaseUrl 解析出 databaseId
   */
  secureHandle('settings:save', (_event, data: unknown): { success: boolean; error?: string } => {
    try {
      if (
        !isRecord(data) ||
        !isValidNotionToken(data.token) ||
        typeof data.databaseUrl !== 'string'
      ) {
        return { success: false, error: 'Invalid settings' }
      }
      const databaseId = parseDatabaseId(data.databaseUrl)
      if (!databaseId || (data.databaseId !== undefined && data.databaseId !== databaseId)) {
        return { success: false, error: 'Invalid Notion database' }
      }
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'Secure token storage is unavailable' }
      }

      // 加密 token
      const encrypted = safeStorage.encryptString(data.token)
      store.set('encryptedToken', encrypted.toString('base64'))

      // 存储 database 信息
      store.set('databaseId', databaseId)
      store.set('databaseUrl', data.databaseUrl)

      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  /**
   * 加载设置
   * - 不返回 token 明文，只返回 isTokenConfigured
   */
  secureHandle(
    'settings:load',
    (): {
      isTokenConfigured: boolean
      databaseId: string | null
      databaseUrl: string | null
      dataSourceId: string | null
      fieldMapping: FieldMapping | null
    } => {
      const encryptedToken = store.get('encryptedToken')
      return {
        isTokenConfigured: !!encryptedToken,
        databaseId: store.get('databaseId'),
        databaseUrl: store.get('databaseUrl'),
        dataSourceId: store.get('dataSourceId'),
        fieldMapping: store.get('fieldMapping')
      }
    }
  )

  /**
   * 保存字段映射
   */
  secureHandle(
    'settings:saveFieldMapping',
    (_event, mapping: unknown): { success: boolean; error?: string } => {
      try {
        if (!isValidFieldMapping(mapping)) {
          return { success: false, error: 'Invalid field mapping' }
        }
        // 绑定当前 dataSourceId
        const dataSourceId = store.get('dataSourceId')
        const boundMapping: FieldMapping = {
          ...mapping,
          boundDataSourceId: dataSourceId
        }
        store.set('fieldMapping', boundMapping)
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  /**
   * 清除设置
   */
  secureHandle('settings:clear', (): { success: boolean } => {
    store.set('encryptedToken', null)
    store.set('databaseId', null)
    store.set('databaseUrl', null)
    store.set('dataSourceId', null)
    store.set('fieldMapping', null)
    return { success: true }
  })

  /**
   * 获取解密后的 token（内部辅助函数，不暴露给 renderer）
   */
  function getDecryptedToken(): string | null {
    const encryptedToken = store.get('encryptedToken')
    if (!encryptedToken) return null

    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      const buffer = Buffer.from(encryptedToken, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return null
    }
  }

  // ========== Notion IPC ==========

  /**
   * 测试连接（Save & Verify）
   * 验证 token 和 databaseUrl，获取 dataSourceId 和属性数量
   */
  secureHandle(
    'notion:testConnection',
    async (
      _event,
      data: unknown
    ): Promise<{
      success: boolean
      databaseId?: string
      dataSourceId?: string
      propertyCount?: number
      error?: NotionError
    }> => {
      if (
        !isRecord(data) ||
        !isValidNotionToken(data.token) ||
        typeof data.databaseUrl !== 'string'
      ) {
        return {
          success: false,
          error: {
            code: 'invalid_settings',
            message: 'Invalid connection settings',
            userMessage: 'Enter a valid Notion token and database URL'
          }
        }
      }

      // 解析 databaseId
      const databaseId = parseDatabaseId(data.databaseUrl)
      if (!databaseId) {
        return {
          success: false,
          error: {
            code: 'invalid_url',
            message: 'Cannot parse database ID',
            userMessage: 'Cannot parse Database ID, please check URL format'
          }
        }
      }

      try {
        const service = getNotionService(data.token)
        const result = await service.getDatabaseAndDataSources(databaseId)

        if (!result.success) {
          return { success: false, error: result.error }
        }

        if (!result.defaultDataSourceId) {
          return {
            success: false,
            error: {
              code: 'no_data_source',
              message: 'No data source found',
              userMessage: 'No Data Source found in Database, please ensure Database has data'
            }
          }
        }

        // 保存配置
        if (!safeStorage.isEncryptionAvailable()) {
          return {
            success: false,
            error: {
              code: 'secure_storage_unavailable',
              message: 'Secure token storage is unavailable',
              userMessage: 'macOS secure storage is unavailable; the token was not saved'
            }
          }
        }
        const encrypted = safeStorage.encryptString(data.token)
        store.set('encryptedToken', encrypted.toString('base64'))
        store.set('databaseId', databaseId)
        store.set('databaseUrl', data.databaseUrl)
        store.set('dataSourceId', result.defaultDataSourceId)

        // 检查现有映射是否需要失效
        const existingMapping = store.get('fieldMapping')
        if (
          existingMapping?.boundDataSourceId &&
          existingMapping.boundDataSourceId !== result.defaultDataSourceId
        ) {
          // DataSource 变化，清空映射
          store.set('fieldMapping', null)
        }

        return {
          success: true,
          databaseId,
          dataSourceId: result.defaultDataSourceId,
          propertyCount: result.properties?.length || 0
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: 'Connection test failed: ' + String(error)
          }
        }
      }
    }
  )

  /**
   * 获取 Schema（用于字段映射）
   * 使用 dataSources.retrieve 获取 schema.properties
   */
  secureHandle(
    'notion:getSchema',
    async (): Promise<{
      success: boolean
      dataSourceId?: string
      properties?: PropertySchema[]
      error?: NotionError
    }> => {
      const token = getDecryptedToken()
      const databaseId = store.get('databaseId')
      let dataSourceId = store.get('dataSourceId')

      if (!token || !databaseId) {
        return {
          success: false,
          error: {
            code: 'not_configured',
            message: 'Not configured',
            userMessage: 'Please Save & Verify in Connection first'
          }
        }
      }

      try {
        const service = getNotionService(token)

        // 若无 dataSourceId，先通过 databases.retrieve 获取
        if (!dataSourceId) {
          const dbResult = await service.getDatabaseAndDataSources(databaseId)
          if (!dbResult.success || !dbResult.defaultDataSourceId) {
            return {
              success: false,
              error: dbResult.error || {
                code: 'no_data_source',
                message: 'No data source found',
                userMessage: 'Please Save & Verify in Connection first'
              }
            }
          }
          dataSourceId = dbResult.defaultDataSourceId
          store.set('dataSourceId', dataSourceId)
        }

        // 使用 dataSources.retrieve 获取 schema.properties
        const result = await service.getDataSourceSchema(dataSourceId)

        if (result.success && result.properties) {
          return {
            success: true,
            dataSourceId,
            properties: result.properties
          }
        } else {
          return {
            success: false,
            error: result.error || {
              code: 'no_properties',
              message: 'No properties found',
              userMessage: 'Failed to load database schema'
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: 'Error loading database schema'
          }
        }
      }
    }
  )

  /**
   * 保存字段映射（通过 notionAPI）
   */
  secureHandle(
    'notion:saveFieldMapping',
    (_event, mapping: unknown): { success: boolean; error?: string } => {
      try {
        if (!isValidFieldMapping(mapping)) {
          return { success: false, error: 'Invalid field mapping' }
        }
        const dataSourceId = store.get('dataSourceId')
        const boundMapping: FieldMapping = {
          ...mapping,
          boundDataSourceId: dataSourceId
        }
        store.set('fieldMapping', boundMapping)
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  /**
   * 加载字段映射
   */
  secureHandle(
    'notion:loadFieldMapping',
    (): {
      mapping: FieldMapping | null
      status: MappingStatus
      message?: string
    } => {
      const mapping = store.get('fieldMapping')
      const dataSourceId = store.get('dataSourceId')
      const validation = validateMapping(mapping, dataSourceId)
      return {
        mapping,
        status: validation.status,
        message: validation.message
      }
    }
  )

  /**
   * 查询任务列表
   * 支持 filter、分页、自动发现 dataSourceId
   */
  secureHandle(
    'notion:queryTasks',
    async (
      _event,
      options?: unknown
    ): Promise<{
      success: boolean
      tasks?: NotionTask[]
      hasMore?: boolean
      nextCursor?: string | null
      totalFetched?: number
      error?: NotionError
    }> => {
      if (!isValidQueryTasksInput(options)) {
        return {
          success: false,
          error: {
            code: 'invalid_query',
            message: 'Invalid query options',
            userMessage: 'Unable to query tasks because the filter is invalid'
          }
        }
      }

      const token = getDecryptedToken()
      const databaseId = store.get('databaseId')

      if (!token) {
        return {
          success: false,
          error: {
            code: 'no_token',
            message: 'Token not configured',
            userMessage: 'Please configure Notion Token in settings first'
          }
        }
      }

      if (!databaseId) {
        return {
          success: false,
          error: {
            code: 'no_database',
            message: 'Database not configured',
            userMessage: 'Please configure Database URL in settings first'
          }
        }
      }

      try {
        const service = getNotionService(token)

        // 获取或发现 dataSourceId
        let dataSourceId = store.get('dataSourceId')
        let dbResult: Awaited<ReturnType<typeof service.getDatabaseAndDataSources>> | null = null

        if (!dataSourceId) {
          dbResult = await service.getDatabaseAndDataSources(databaseId)
          if (!dbResult.success) {
            return {
              success: false,
              error: dbResult.error
            }
          }

          if (!dbResult.defaultDataSourceId) {
            return {
              success: false,
              error: {
                code: 'no_data_source',
                message: 'No data source found',
                userMessage: 'No Data Source found in Database, please ensure Database has data'
              }
            }
          }

          dataSourceId = dbResult.defaultDataSourceId
          store.set('dataSourceId', dataSourceId)
        }

        // 获取字段映射
        const fieldMapping = store.get('fieldMapping')

        // 验证映射 - 缺失/无效时不自动检测，返回错误引导用户配置
        const validation = validateMapping(fieldMapping, dataSourceId)
        if (validation.status === 'invalid') {
          store.set('fieldMapping', null)
          return {
            success: false,
            error: {
              code: 'mapping_invalid',
              message: validation.message || 'Mapping invalid',
              userMessage: 'Database changed, please reconfigure field mapping'
            }
          }
        }
        if (validation.status === 'not_configured' || validation.status === 'incomplete') {
          return {
            success: false,
            error: {
              code: 'mapping_not_configured',
              message: validation.message || 'Mapping not configured',
              userMessage:
                'Please configure Text / Status / Time mapping in Settings → Field Mapping'
            }
          }
        }

        // 查询所有任务（自动分页，使用 filter_properties）
        const result = await service.queryAllTasks({
          dataSourceId,
          statusFilter: options?.statusFilter,
          fieldMapping
        })

        return result
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: 'Error querying tasks: ' + String(error)
          }
        }
      }
    }
  )

  /**
   * 获取 Database 信息（用于验证配置）
   */
  secureHandle(
    'notion:getDatabaseInfo',
    async (): Promise<{
      success: boolean
      databaseId?: string
      dataSourceId?: string
      error?: NotionError
    }> => {
      const token = getDecryptedToken()
      const databaseId = store.get('databaseId')

      if (!token || !databaseId) {
        return {
          success: false,
          error: {
            code: 'not_configured',
            message: 'Not configured',
            userMessage: 'Please configure Notion Token and Database first'
          }
        }
      }

      try {
        const service = getNotionService(token)
        const result = await service.getDatabaseAndDataSources(databaseId)

        if (result.success) {
          // 保存 dataSourceId
          if (result.defaultDataSourceId) {
            store.set('dataSourceId', result.defaultDataSourceId)
          }
          return {
            success: true,
            databaseId,
            dataSourceId: result.defaultDataSourceId
          }
        } else {
          return {
            success: false,
            error: result.error
          }
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: 'Error verifying Database'
          }
        }
      }
    }
  )

  /**
   * 获取 Database Schema（兼容旧 API）
   * 使用 dataSources.retrieve 获取 schema.properties
   */
  secureHandle(
    'notion:getDatabaseSchema',
    async (): Promise<{
      success: boolean
      properties?: Array<{
        id: string
        name: string
        type: string
        options?: Array<{ id: string; name: string; color: string }>
      }>
      error?: NotionError
    }> => {
      const token = getDecryptedToken()
      const databaseId = store.get('databaseId')
      let dataSourceId = store.get('dataSourceId')

      if (!token || !databaseId) {
        return {
          success: false,
          error: {
            code: 'not_configured',
            message: 'Not configured',
            userMessage: 'Please configure Notion Token and Database first'
          }
        }
      }

      try {
        const service = getNotionService(token)

        if (!dataSourceId) {
          const dbResult = await service.getDatabaseAndDataSources(databaseId)
          if (!dbResult.success || !dbResult.defaultDataSourceId) {
            return {
              success: false,
              error: dbResult.error || {
                code: 'no_data_source',
                message: 'No data source found',
                userMessage: 'Please Save & Verify in Connection first'
              }
            }
          }
          dataSourceId = dbResult.defaultDataSourceId
          store.set('dataSourceId', dataSourceId)
        }

        const result = await service.getDataSourceSchema(dataSourceId)

        if (result.success && result.properties) {
          return {
            success: true,
            properties: result.properties
          }
        } else {
          return {
            success: false,
            error: result.error || {
              code: 'no_properties',
              message: 'No properties found',
              userMessage: 'Failed to load database schema'
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: 'Error loading database schema'
          }
        }
      }
    }
  )

  /**
   * 更新任务（Title/Status/Due）
   * 支持节流合并和 429 重试
   */
  secureHandle('notion:updateTask', async (_event, options: unknown): Promise<UpdateTaskResult> => {
    if (!isValidUpdateTaskInput(options)) {
      return {
        success: false,
        error: {
          code: 'invalid_update',
          message: 'Invalid task update',
          userMessage: 'Unable to update this task because the change is invalid'
        }
      }
    }

    const token = getDecryptedToken()
    let fieldMapping = store.get('fieldMapping')

    if (!token) {
      return {
        success: false,
        error: {
          code: 'no_token',
          message: 'Token not configured',
          userMessage: 'Please configure Notion Token in settings first'
        }
      }
    }

    const databaseId = store.get('databaseId')
    if (!databaseId) {
      return {
        success: false,
        error: {
          code: 'no_database',
          message: 'Database not configured',
          userMessage: 'Please configure Database URL in settings first'
        }
      }
    }

    // 若未配置字段映射，尝试自动检测并保存
    if (!fieldMapping) {
      try {
        const service = getNotionService(token)
        const dbResult = await service.getDatabaseAndDataSources(databaseId)
        if (dbResult.success && dbResult.properties?.length) {
          const dataSourceId = store.get('dataSourceId')
          fieldMapping = autoDetectFieldMapping(dbResult.properties, dataSourceId)
          store.set('fieldMapping', fieldMapping)
        }
      } catch {
        // 忽略自动检测失败
      }
    }

    if (!fieldMapping) {
      return {
        success: false,
        error: {
          code: 'no_field_mapping',
          message: 'Field mapping not configured',
          userMessage: 'Please configure field mapping in Settings → Field Mapping'
        }
      }
    }

    try {
      const service = getNotionService(token)

      // 获取属性类型映射（用于判断 status 是 status 还是 select）
      const propertyTypes: Record<string, string> = {}
      const dataSourceId = store.get('dataSourceId')
      if (dataSourceId) {
        const schemaResult = await service.getDataSourceSchema(dataSourceId)
        if (schemaResult.success && schemaResult.properties) {
          for (const prop of schemaResult.properties) {
            propertyTypes[prop.id] = prop.type
          }
        }
      }

      const result = await service.updateTask({
        pageId: options.pageId,
        updates: options.updates,
        fieldMapping,
        propertyTypes
      })

      return result
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'unknown',
          message: String(error),
          userMessage: 'Error updating task: ' + String(error)
        }
      }
    }
  })

  /**
   * 清除 Notion service 缓存（设置更改时调用）
   */
  secureHandle('notion:clearCache', () => {
    clearNotionServiceCache()
    // 清除 dataSourceId，下次查询时重新获取
    store.set('dataSourceId', null)
    return { success: true }
  })
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // 初始化 store
  await initStore()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.crazzzzhao.notionpin')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 设置 IPC
  setupIPC()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
