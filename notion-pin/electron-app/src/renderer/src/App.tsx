import { useEffect, useState, useCallback, useTransition } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Minus, X, Settings } from 'lucide-react'
import { SettingsModal } from '@/components/SettingsModal'
import { TaskList } from '@/components/TaskList'

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
}

function AppContent(): React.JSX.Element {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<SettingsState>({
    isTokenConfigured: false,
    databaseId: null,
    databaseUrl: null,
    dataSourceId: null
  })

  // 加载设置
  const loadSettings = useCallback(async () => {
    const data = await window.settingsAPI.load()
    setSettings(data)
    // 设置更改后清除 Notion 缓存和查询缓存
    await window.notionAPI.clearCache()
    queryClient.invalidateQueries({ queryKey: ['notion'] })
  }, [])

  // 初始化：获取窗口状态和设置
  useEffect(() => {
    Promise.all([window.windowAPI.getWindowState(), window.settingsAPI.load()]).then(
      ([windowState, settingsData]) => {
        setIsCollapsed(windowState.isCollapsed)
        setSettings(settingsData)
        setIsLoading(false)
      }
    )
  }, [])

  // 切换收起/展开 - 丝滑动画
  const [isPending, startTransition] = useTransition()

  const handleToggle = useCallback((): void => {
    if (isCollapsed) {
      // 展开：先调 API，窗口变大后内容淡入
      window.windowAPI.toggleCollapsed().then((newCollapsed) => {
        startTransition(() => setIsCollapsed(newCollapsed))
      })
    } else {
      // 收起：先动画再调 API（由 CSS 动画驱动，onTransitionEnd 触发）
      setCollapsing(true)
    }
  }, [isCollapsed])

  const [collapsing, setCollapsing] = useState(false)

  // 收起动画结束后调 API（仅 main 自身 transition 结束时触发）
  const handleCollapseTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.target !== e.currentTarget || !collapsing) return
      setCollapsing(false)
      window.windowAPI.toggleCollapsed().then((newCollapsed) => {
        setIsCollapsed(newCollapsed)
      })
    },
    [collapsing]
  )

  // 最小化
  const handleMinimize = (): void => {
    window.windowAPI.minimize()
  }

  // 关闭
  const handleClose = (): void => {
    window.windowAPI.close()
  }

  if (isLoading) {
    return <div className="h-full glass-panel" />
  }

  const showMain = !isCollapsed || collapsing

  return (
    <div className="relative flex flex-col h-screen text-foreground overflow-hidden glass-panel">
      {/* 顶栏 - 磨砂玻璃 */}
      <header
        className="flex items-center justify-between h-[52px] px-3 border-b border-border shrink-0 glass-panel"
        style={{
          WebkitAppRegion: 'drag',
          background: 'hsl(var(--card) / 0.8)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)'
        } as React.CSSProperties}
      >
        {/* 左侧：App 名称 */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">P</span>
          </div>
          <span className="font-semibold text-sm">Notion Pin</span>
        </div>

        {/* 右侧：控制按钮 */}
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Settings 按钮 - 仅在展开时显示 */}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowSettings(true)}
              title="设置"
              aria-label="打开设置"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleToggle}
            disabled={isPending || collapsing}
            title={isCollapsed ? '展开' : '收起'}
            aria-label={isCollapsed ? '展开窗口' : '收起窗口'}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleMinimize}
            title="最小化"
            aria-label="最小化"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleClose}
            title="关闭"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* 内容区 - 展开时显示，收起时平滑动画 */}
      {showMain && (
        <main
          className={`flex-1 flex flex-col overflow-hidden transition-smooth glass-panel ${
            collapsing ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
          onTransitionEnd={handleCollapseTransitionEnd}
        >
          {/* 未配置提示 */}
          {!settings.isTokenConfigured && (
            <div className="p-3 mx-3 mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600">⚠ 请先配置 Notion Token 和 Database</p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-1 text-amber-600"
                onClick={() => setShowSettings(true)}
              >
                打开设置 →
              </Button>
            </div>
          )}

          {/* 任务列表 */}
          <div className="flex-1 overflow-hidden">
            <TaskList isConfigured={settings.isTokenConfigured} />
          </div>

          {/* Debug 面板（可折叠） */}
          <details className="mx-3 mb-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Debug
            </summary>
            <div className="mt-2 p-2 rounded bg-muted/50 font-mono text-xs space-y-1">
              <p>
                <span className="text-muted-foreground">isTokenConfigured:</span>{' '}
                <span className={settings.isTokenConfigured ? 'text-green-600' : 'text-red-500'}>
                  {String(settings.isTokenConfigured)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">databaseId:</span>{' '}
                <span className="text-foreground">
                  {settings.databaseId?.slice(0, 8) || <span className="text-muted-foreground">null</span>}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">dataSourceId:</span>{' '}
                <span className="text-foreground">
                  {settings.dataSourceId?.slice(0, 8) || <span className="text-muted-foreground">null</span>}
                </span>
              </p>
            </div>
          </details>
        </main>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={loadSettings}
        initialDatabaseUrl={settings.databaseUrl || ''}
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
