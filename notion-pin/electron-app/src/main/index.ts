import { app, shell, BrowserWindow, ipcMain, screen, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  getNotionService,
  clearNotionServiceCache,
  type NotionTask,
  type NotionError,
  type StatusFilterKey
} from './services/notionService'

// 窗口常量
const WINDOW_WIDTH = 320
const WINDOW_MIN_WIDTH = 240
const WINDOW_MIN_HEIGHT = 52
const COLLAPSED_HEIGHT = 52
const EXPANDED_HEIGHT = 420

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
}

// electron-store 是 ESM 模块，需要动态导入
let store: import('electron-store').default<StoreSchema>

async function initStore(): Promise<void> {
  const Store = (await import('electron-store')).default
  store = new Store<StoreSchema>({
    defaults: {
      windowBounds: null,
      isCollapsed: false,
      encryptedToken: null,
      databaseId: null,
      databaseUrl: null,
      dataSourceId: null
    }
  })
}

let mainWindow: BrowserWindow | null = null

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

  const windowWidth = savedBounds?.width ?? WINDOW_WIDTH
  const windowHeight = isCollapsed
    ? COLLAPSED_HEIGHT
    : savedBounds?.height ?? EXPANDED_HEIGHT

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    x: savedBounds?.x ?? defaultPos.x,
    y: savedBounds?.y ?? defaultPos.y,
    show: false,
    frame: false, // 无边框窗口
    transparent: process.platform === 'darwin', // macOS 磨砂玻璃
    alwaysOnTop: true, // 置顶
    resizable: true, // 允许自由拖拽调整大小
    skipTaskbar: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true, // 安全：上下文隔离
      nodeIntegration: false // 安全：禁用 node 集成
    }
  })

  mainWindow.on('ready-to-show', () => {
    // macOS 磨砂玻璃效果
    if (process.platform === 'darwin' && mainWindow) {
      mainWindow.setVibrancy('hud')
    }
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

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC Handlers
function setupIPC(): void {
  // 获取窗口状态
  ipcMain.handle('window:getState', () => {
    return {
      isCollapsed: store.get('isCollapsed'),
      bounds: store.get('windowBounds')
    }
  })

  // 设置窗口状态
  ipcMain.handle('window:setState', (_event, state: { isCollapsed?: boolean }) => {
    if (state.isCollapsed !== undefined) {
      store.set('isCollapsed', state.isCollapsed)
    }
  })

  // 切换收起/展开
  ipcMain.handle('window:toggleCollapsed', () => {
    if (!mainWindow) return false

    const isCollapsed = store.get('isCollapsed')
    const newCollapsed = !isCollapsed

    // 更新存储
    store.set('isCollapsed', newCollapsed)

    // 调整窗口高度，保持当前宽度
    const bounds = mainWindow.getBounds()
    const newHeight = newCollapsed ? COLLAPSED_HEIGHT : Math.max(EXPANDED_HEIGHT, bounds.height)

    mainWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: newHeight
    })

    return newCollapsed
  })

  // 关闭窗口
  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })

  // 最小化窗口
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  // 调整窗口大小（供 renderer 拖拽手柄调用）
  ipcMain.handle('window:resize', (_event, width: number, height: number) => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    const w = Math.max(WINDOW_MIN_WIDTH, Math.round(width))
    const h = Math.max(WINDOW_MIN_HEIGHT, Math.round(height))
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: w, height: h })
    store.set('windowBounds', mainWindow.getBounds())
  })

  // ========== Settings IPC ==========

  /**
   * 保存设置
   * - token 使用 safeStorage 加密后存储
   * - databaseUrl 解析出 databaseId
   */
  ipcMain.handle(
    'settings:save',
    (
      _event,
      data: { token: string; databaseUrl: string; databaseId: string }
    ): { success: boolean; error?: string } => {
      try {
        // 加密 token
        if (data.token && safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(data.token)
          store.set('encryptedToken', encrypted.toString('base64'))
        } else if (data.token) {
          // 如果 safeStorage 不可用，仍然存储（开发环境可能出现）
          // 生产环境应该始终可用
          store.set('encryptedToken', Buffer.from(data.token).toString('base64'))
        }

        // 存储 database 信息
        store.set('databaseId', data.databaseId)
        store.set('databaseUrl', data.databaseUrl)

        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    }
  )

  /**
   * 加载设置
   * - 不返回 token 明文，只返回 isTokenConfigured
   */
  ipcMain.handle(
    'settings:load',
    (): {
      isTokenConfigured: boolean
      databaseId: string | null
      databaseUrl: string | null
      dataSourceId: string | null
    } => {
      const encryptedToken = store.get('encryptedToken')
      return {
        isTokenConfigured: !!encryptedToken,
        databaseId: store.get('databaseId'),
        databaseUrl: store.get('databaseUrl'),
        dataSourceId: store.get('dataSourceId')
      }
    }
  )

  /**
   * 清除设置
   */
  ipcMain.handle('settings:clear', (): { success: boolean } => {
    store.set('encryptedToken', null)
    store.set('databaseId', null)
    store.set('databaseUrl', null)
    store.set('dataSourceId', null)
    return { success: true }
  })

  /**
   * 获取解密后的 token（内部辅助函数，不暴露给 renderer）
   */
  function getDecryptedToken(): string | null {
    const encryptedToken = store.get('encryptedToken')
    if (!encryptedToken) return null

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedToken, 'base64')
        return safeStorage.decryptString(buffer)
      } else {
        // fallback for dev environment
        return Buffer.from(encryptedToken, 'base64').toString('utf-8')
      }
    } catch {
      return null
    }
  }

  // ========== Notion IPC ==========

  /**
   * 查询任务列表
   * 支持 filter、分页、自动发现 dataSourceId
   */
  ipcMain.handle(
    'notion:queryTasks',
    async (
      _event,
      options?: { statusFilter?: StatusFilterKey; cursor?: string }
    ): Promise<{
      success: boolean
      tasks?: NotionTask[]
      hasMore?: boolean
      nextCursor?: string | null
      totalFetched?: number
      error?: NotionError
    }> => {
      const token = getDecryptedToken()
      const databaseId = store.get('databaseId')

      if (!token) {
        return {
          success: false,
          error: {
            code: 'no_token',
            message: 'Token not configured',
            userMessage: '请先在设置中配置 Notion Token'
          }
        }
      }

      if (!databaseId) {
        return {
          success: false,
          error: {
            code: 'no_database',
            message: 'Database not configured',
            userMessage: '请先在设置中配置 Database URL'
          }
        }
      }

      try {
        const service = getNotionService(token)

        // 获取或发现 dataSourceId
        let dataSourceId = store.get('dataSourceId')

        if (!dataSourceId) {
          const dbResult = await service.getDatabaseAndDataSources(databaseId)
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
                userMessage: 'Database 中没有找到 Data Source，请确保 Database 有数据'
              }
            }
          }

          dataSourceId = dbResult.defaultDataSourceId
          store.set('dataSourceId', dataSourceId)
        }

        // 查询所有任务（自动分页）
        const result = await service.queryAllTasks({
          dataSourceId,
          statusFilter: options?.statusFilter
        })

        return result
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'unknown',
            message: String(error),
            userMessage: '查询任务时发生错误：' + String(error)
          }
        }
      }
    }
  )

  /**
   * 获取 Database 信息（用于验证配置）
   */
  ipcMain.handle(
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
            userMessage: '请先配置 Notion Token 和 Database'
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
            userMessage: '验证 Database 时发生错误'
          }
        }
      }
    }
  )

  /**
   * 清除 Notion service 缓存（设置更改时调用）
   */
  ipcMain.handle('notion:clearCache', () => {
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
  electronApp.setAppUserModelId('com.notion-pin')

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
