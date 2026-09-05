import { useEffect, useState, useCallback, useSyncExternalStore } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, RotateCw, X, CircleCheck, CircleX, Unplug } from 'lucide-react'
import { TaskList } from '@/components/TaskList'
import { SettingsModal } from '@/components/SettingsModal'
import { createWindowCollapse } from '@/lib/windowCollapse'

// 刷新 Toast - 设计稿 9kFMa (Success) / RnTAS (Error) 100% 复刻
// padding 12 16, gap 12, cornerRadius 8, bg #fff, border #e5e5e5
// shadow: blur 12, color #0000000d, offset y:4, spread -1
// icon: circle-check 18x18 #16a34a | circle-x 18x18 #d44c47
// text: Inter 12px normal #737373

interface RefreshToastProps {
  type: 'success' | 'error'
  message: string
  onDismiss: () => void
}

function RefreshToast({ type, message, onDismiss }: RefreshToastProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const isSuccess = type === 'success'
  return (
    <div
      className="app-toast fixed bottom-14 inset-x-4 mx-auto w-fit max-w-[calc(100vw_-_32px)] z-40 flex items-start animate-in slide-in-from-bottom-2"
      style={{
        padding: '12px 16px',
        gap: 12,
        borderRadius: 8,
        background: '#ffffff',
        border: '1px solid #e5e5e5',
        boxShadow: '0 4px 12px -1px rgba(0,0,0,0.05)'
      }}
    >
      {isSuccess ? (
        <CircleCheck style={{ width: 18, height: 18, color: '#16a34a', flexShrink: 0 }} />
      ) : (
        <CircleX style={{ width: 18, height: 18, color: '#d44c47', flexShrink: 0 }} />
      )}
      <span
        className="min-w-0"
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 12,
          fontWeight: 400,
          color: '#737373'
        }}
      >
        {message}
      </span>
    </div>
  )
}

// 未连接状态组件 - 友好的引导 UI
interface NotConnectedStateProps {
  onOpenSettings: () => void
}

function NotConnectedState({ onOpenSettings }: NotConnectedStateProps): React.JSX.Element {
  return (
    <div className="state-screen">
      <div
        className="flex items-center justify-center w-14 h-14 shrink-0 rounded-full"
        style={{ background: 'rgba(115, 115, 115, 0.1)' }}
      >
        <Unplug className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-[15px] font-semibold text-foreground">Notion not connected</h3>
        <p className="text-[13px] text-muted-foreground">
          Add your Notion token and database to view tasks.
        </p>
      </div>
      <Button
        size="sm"
        className="min-h-9 max-w-full px-5 text-[13px] font-medium text-white"
        style={{
          background: '#007AFF',
          boxShadow: '0 1px 3px rgba(0,122,255,0.3)'
        }}
        onClick={onOpenSettings}
      >
        Open Settings
      </Button>
    </div>
  )
}

// 创建 QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false
    }
  }
})

// Settings 状态类型
interface SettingsState {
  isTokenConfigured: boolean
  databaseId: string | null
  databaseUrl: string | null
  dataSourceId: string | null
  fieldMapping: import('../../preload').FieldMapping | null
}

function AppContent(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [queryControls, setQueryControls] = useState<{
    refetch: () => Promise<unknown>
    isFetching: boolean
  } | null>(null)
  const handleQueryReady = useCallback(
    (controls: { refetch: () => Promise<unknown>; isFetching: boolean } | null) => {
      setQueryControls(controls)
    },
    []
  )
  const [refreshToast, setRefreshToast] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [windowCollapse] = useState(() =>
    createWindowCollapse(
      window.windowAPI,
      () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      () => setRefreshToast({ type: 'error', message: 'Could not resize the window. Try again.' })
    )
  )
  const isCollapsed = useSyncExternalStore(windowCollapse.subscribe, windowCollapse.getSnapshot)
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<SettingsState>({
    isTokenConfigured: false,
    databaseId: null,
    databaseUrl: null,
    dataSourceId: null,
    fieldMapping: null
  })
  // Settings Dialog state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      const data = await window.settingsAPI.load()
      setSettings(data)
      // 设置更改后清除 Notion 缓存和查询缓存
      await window.notionAPI.clearCache()
      queryClient.invalidateQueries({ queryKey: ['notion'] })
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }, [queryClient])

  // 初始化：获取窗口状态和设置
  useEffect(() => {
    Promise.all([window.windowAPI.getWindowState(), window.settingsAPI.load()])
      .then(([windowState, settingsData]) => {
        windowCollapse.initialize(windowState.isCollapsed)
        setSettings(settingsData)
      })
      .catch((err) => {
        console.error('Failed to initialize app:', err)
        // 降级处理：使用默认值，允许用户继续操作
      })
      .finally(() => {
        setIsLoading(false) // 确保 loading 状态结束
      })
  }, [windowCollapse])

  // 关闭
  const handleClose = (): void => {
    window.windowAPI.close()
  }

  // 刷新任务列表
  const handleRefresh = useCallback(async () => {
    if (!queryControls?.refetch) return
    try {
      await queryControls.refetch()
      setRefreshToast({ type: 'success', message: 'Tasks refreshed successfully' })
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'userMessage' in err
          ? String((err as { userMessage: string }).userMessage)
          : 'Failed to refresh tasks'
      setRefreshToast({ type: 'error', message: msg })
    }
  }, [queryControls])

  // 打开 Settings Dialog（不再使用独立窗口）
  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true)
  }, [])

  // 关闭 Settings Dialog
  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  // Settings 保存后刷新
  const handleSettingsSaved = useCallback(() => {
    loadSettings()
  }, [loadSettings])

  // 断开 Notion 连接后的处理
  const handleDisconnected = useCallback(async () => {
    // 1. 清除 Notion API 缓存
    await window.notionAPI.clearCache()
    // 2. 清除 React Query 缓存
    queryClient.clear()
    // 3. 重新加载设置（会更新 isTokenConfigured 为 false）
    await loadSettings()
    // 4. 显示成功 Toast
    setRefreshToast({ type: 'success', message: 'Notion disconnected' })
  }, [queryClient, loadSettings])

  if (isLoading) {
    return <div className="h-full window-surface" />
  }

  return (
    <div className="relative flex flex-col h-screen w-full min-w-0 text-foreground overflow-hidden window-surface">
      {/* Header - 设计稿 .title-bar 48px */}
      <header
        className="window-header flex items-center justify-between gap-2 px-4 shrink-0"
        style={
          {
            WebkitAppRegion: 'drag'
          } as React.CSSProperties
        }
      >
        <span className="text-base font-semibold text-foreground">Nopin</span>

        {/* 24px hit areas with 8px spacing; aligned with the footer action. */}
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!isCollapsed && settings.isTokenConfigured && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded"
              onClick={handleRefresh}
              disabled={queryControls?.isFetching}
              title="Refresh"
              aria-label="Refresh"
            >
              <RotateCw
                className={`h-4 w-4 text-[#737373] ${queryControls?.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded"
            onClick={() => void windowCollapse.toggle()}
            aria-expanded={!isCollapsed}
            aria-controls="window-content"
            title={isCollapsed ? 'Expand' : 'Collapse'}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? (
              <ChevronDown className="h-[18px] w-[18px] text-[#737373]" />
            ) : (
              <ChevronUp className="h-[18px] w-[18px] text-[#737373]" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded hover:bg-destructive/10 hover:text-destructive"
            onClick={handleClose}
            title="Close"
            aria-label="Close"
          >
            <X className="h-[18px] w-[18px] text-[#737373]" />
          </Button>
        </div>
      </header>

      {/* Keep content mounted so reversing motion never resets list/scroll state. */}
      <main
        id="window-content"
        className="flex-1 min-h-0 flex flex-col overflow-hidden window-content"
        data-collapsed={isCollapsed}
        inert={isCollapsed}
        aria-hidden={isCollapsed}
      >
        {/* 未连接状态 - 友好的引导 UI */}
        {!settings.isTokenConfigured ? (
          <div className="state-scroll flex-1 min-h-0 overflow-y-auto px-4">
            <NotConnectedState onOpenSettings={handleOpenSettings} />
          </div>
        ) : (
          /* 任务列表 - 已配置时显示 */
          <div className="flex-1 overflow-hidden">
            <TaskList
              isConfigured={settings.isTokenConfigured}
              fieldMapping={settings.fieldMapping}
              onOpenSettings={handleOpenSettings}
              onQueryReady={handleQueryReady}
            />
          </div>
        )}

        {/* 刷新完成 Toast */}
        {refreshToast && (
          <RefreshToast
            type={refreshToast.type}
            message={refreshToast.message}
            onDismiss={() => setRefreshToast(null)}
          />
        )}
      </main>

      {/* Settings Dialog */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        onSaved={handleSettingsSaved}
        onDisconnected={handleDisconnected}
        initialDatabaseUrl={settings.databaseUrl || undefined}
        initialFieldMapping={settings.fieldMapping}
        initialDataSourceId={settings.dataSourceId}
        isTokenConfigured={settings.isTokenConfigured}
      />
    </div>
  )
}

// 包装 QueryClientProvider
function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
