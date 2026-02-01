import { useEffect, useState, useCallback, useTransition, useRef } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, RotateCw, X, CircleCheck, CircleX, Unplug } from 'lucide-react'
import { TaskList } from '@/components/TaskList'
import { BillingPopover } from '@/components/BillingPopover'
import { SettingsModal } from '@/components/SettingsModal'
import type { BillingPlan } from '../../preload'

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
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center animate-in slide-in-from-bottom-2"
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
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
      <div
        className="flex items-center justify-center w-14 h-14 rounded-full"
        style={{ background: 'rgba(115, 115, 115, 0.1)' }}
      >
        <Unplug className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1.5">
        <h3 className="text-[15px] font-semibold text-foreground">
          Notion not connected
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Add your Notion token and database to view tasks.
        </p>
      </div>
      <Button
        size="sm"
        className="h-9 px-5 rounded-lg text-[13px] font-medium text-white"
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
  const [isCollapsed, setIsCollapsed] = useState(false)
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
  const [refreshToast, setRefreshToast] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(true)
  const [settings, setSettings] = useState<SettingsState>({
    isTokenConfigured: false,
    databaseId: null,
    databaseUrl: null,
    dataSourceId: null,
    fieldMapping: null
  })
  // Billing state
  const [canEdit, setCanEdit] = useState(false)
  const [billingPlan, setBillingPlan] = useState<BillingPlan>('free')

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

  // 加载 Billing 状态
  const loadBilling = useCallback(async () => {
    try {
      const entitlement = await window.billingAPI.getEntitlement()
      setBillingPlan(entitlement.plan)
      const canEditResult = await window.billingAPI.canEdit()
      setCanEdit(canEditResult)
    } catch (error) {
      console.error('Failed to load billing:', error)
      setCanEdit(false)
      setBillingPlan('free')
    }
  }, [])

  // 初始化：获取窗口状态、设置和 Billing 状态
  useEffect(() => {
    Promise.all([
      window.windowAPI.getWindowState(),
      window.settingsAPI.load(),
      window.billingAPI.getEntitlement(),
      window.billingAPI.canEdit()
    ]).then(([windowState, settingsData, entitlement, canEditResult]) => {
      setIsCollapsed(windowState.isCollapsed)
      setSettings(settingsData)
      setBillingPlan(entitlement.plan)
      setCanEdit(canEditResult)
    }).catch((err) => {
      console.error('Failed to initialize app:', err)
      // 降级处理：使用默认值，允许用户继续操作
    }).finally(() => {
      setIsLoading(false) // 确保 loading 状态结束
    })
  }, [])

  // Settings 独立窗口关闭后刷新主窗口
  useEffect(() => {
    const unsub = window.windowAPI.onSettingsWindowClosed(() => {
      loadSettings()
      loadBilling()
    })
    return unsub
  }, [loadSettings, loadBilling])

  // 切换收起/展开 - 丝滑动画
  const [isPending, startTransition] = useTransition()
  const [collapsing, setCollapsing] = useState(false)
  const transitionEndHandled = useRef(false)

  const handleToggle = useCallback((): void => {
    if (isCollapsed) {
      // 展开：先调 API，窗口变大后内容淡入
      window.windowAPI.toggleCollapsed().then((newCollapsed) => {
        // 使用 requestAnimationFrame 确保 DOM 更新后再触发动画
        requestAnimationFrame(() => {
          startTransition(() => setIsCollapsed(newCollapsed))
        })
      })
    } else {
      // 收起：先动画再调 API（由 CSS 动画驱动，onTransitionEnd 触发）
      transitionEndHandled.current = false
      setCollapsing(true)
    }
  }, [isCollapsed])

  // 收起动画结束后调 API（仅 opacity transition 结束时触发一次）
  const handleCollapseTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      // 只响应 opacity 结束事件，避免多次触发
      if (e.target !== e.currentTarget || !collapsing || e.propertyName !== 'opacity') return
      if (transitionEndHandled.current) return
      transitionEndHandled.current = true
      
      // 使用 requestAnimationFrame 确保平滑过渡
      requestAnimationFrame(() => {
        setCollapsing(false)
        window.windowAPI.toggleCollapsed().then((newCollapsed) => {
          setIsCollapsed(newCollapsed)
        })
      })
    },
    [collapsing]
  )

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
      const msg = err && typeof err === 'object' && 'userMessage' in err
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
    return <div className="h-full glass-panel" />
  }

  const showMain = !isCollapsed || collapsing

  return (
    <div className="relative flex flex-col h-screen w-full min-w-0 text-foreground overflow-hidden glass-panel">
      {/* Header - 设计稿 .title-bar 48px */}
      <header
        className="flex items-center justify-between h-12 px-4 shrink-0"
        style={{
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        {/* 左侧：NotionPin + Plan tag */}
        {/* 所有 plan tag 均可点击打开 Billing Popover（含 Lifetime，方便降级到 Free） */}
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">NotionPin</span>
          <BillingPopover
            trigger={
              <button
                type="button"
                className="flex items-center h-[17px] rounded-[10px] px-2 py-0.5 hover:opacity-80 transition-opacity cursor-pointer"
                style={{
                  background:
                    billingPlan === 'lifetime'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : billingPlan === 'free'
                        ? 'rgba(155, 154, 151, 0.15)'
                        : 'rgba(0, 122, 255, 0.15)',
                  color:
                    billingPlan === 'lifetime'
                      ? '#16a34a'
                      : billingPlan === 'free'
                        ? '#737373'
                        : '#007AFF',
                  WebkitAppRegion: 'no-drag'
                } as React.CSSProperties}
                title={
                  billingPlan === 'lifetime'
                    ? 'Manage subscription'
                    : billingPlan === 'free'
                      ? 'Upgrade to Pro'
                      : 'Manage subscription'
                }
              >
                <span className="text-[11px] font-medium">
                  {billingPlan === 'lifetime'
                    ? 'Lifetime access'
                    : billingPlan === 'free'
                      ? 'Free plan'
                      : 'Pro plan'}
                </span>
              </button>
            }
            onPlanChanged={loadBilling}
          />
        </div>

        {/* 右侧：Refresh, Toggle, Close - 设计稿 20x20 */}
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {!isCollapsed && settings.isTokenConfigured && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded"
              onClick={handleRefresh}
              disabled={queryControls?.isFetching}
              title="刷新"
              aria-label="刷新"
            >
              <RotateCw
                className={`h-4 w-4 text-[#737373] ${queryControls?.isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded"
            onClick={handleToggle}
            disabled={isPending || collapsing}
            title={isCollapsed ? '展开' : '收起'}
            aria-label={isCollapsed ? '展开' : '收起'}
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
            className="h-5 w-5 rounded hover:bg-destructive/10 hover:text-destructive"
            onClick={handleClose}
            title="关闭"
            aria-label="关闭"
          >
            <X className="h-[18px] w-[18px] text-[#737373]" />
          </Button>
        </div>
      </header>

      {/* 内容区 - 展开时显示，收起时丝滑动画 */}
      {showMain && (
        <main
          className="flex-1 flex flex-col overflow-hidden transition-smooth"
          style={{
            opacity: collapsing ? 0 : 1,
            transform: collapsing 
              ? 'translateY(-4px) scale(0.98) translateZ(0)' 
              : 'translateY(0) scale(1) translateZ(0)'
          }}
          onTransitionEnd={handleCollapseTransitionEnd}
        >
          {/* 未连接状态 - 友好的引导 UI */}
          {!settings.isTokenConfigured ? (
            <div className="flex-1 overflow-hidden">
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
                canEdit={canEdit}
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
      )}

      {/* Settings Dialog - 与 Billing Dialog 一致的模糊背景弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        onSaved={handleSettingsSaved}
        onDisconnected={handleDisconnected}
        initialDatabaseUrl={settings.databaseUrl || undefined}
        initialFieldMapping={settings.fieldMapping}
        initialDataSourceId={settings.dataSourceId}
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
