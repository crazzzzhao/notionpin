import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AnimatedTabs } from '@/components/ui/tabs'
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react'
import type { NotionTask, NotionError, StatusFilterKey } from '../../../preload/index.d'

// ========== 常量配置 ==========

const POLL_INTERVAL = 3 * 60 * 1000 // 3 分钟轮询

// Tab 配置 - 名称与 Notion 对应
const TABS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'Not started' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' }
]

// ========== 任务项组件 ==========

interface TaskItemProps {
  task: NotionTask
}

function TaskItem({ task }: TaskItemProps): React.JSX.Element {
  const handleOpenInNotion = (): void => {
    window.open(task.url, '_blank')
  }

  // 格式化日期
  const formatDue = (due: string | null): string => {
    if (!due) return ''
    const date = new Date(due)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) {
      return '今天'
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return '明天'
    }
    return `${date.getMonth() + 1}/${date.getDate()}`
  }

  // 状态颜色
  const getStatusColor = (status: string | null): string => {
    if (!status) return 'bg-gray-100 text-gray-600'
    const lower = status.toLowerCase()
    if (lower.includes('done') || lower.includes('完成')) {
      return 'bg-green-100 text-green-700'
    }
    if (lower.includes('progress') || lower.includes('进行')) {
      return 'bg-blue-100 text-blue-700'
    }
    if (lower.includes('todo') || lower.includes('待办') || lower.includes('not started')) {
      return 'bg-gray-100 text-gray-600'
    }
    return 'bg-gray-100 text-gray-600'
  }

  // Due 日期颜色
  const getDueColor = (due: string | null): string => {
    if (!due) return 'text-muted-foreground'
    const date = new Date(due)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (date < today) {
      return 'text-red-500' // 已过期
    }
    if (date.toDateString() === today.toDateString()) {
      return 'text-amber-500' // 今天
    }
    return 'text-muted-foreground'
  }

  return (
    <div className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
      {/* 标题 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" title={task.title}>
          {task.title}
        </p>
      </div>

      {/* 状态 */}
      {task.status && (
        <span
          className={`shrink-0 px-1.5 py-0.5 text-xs rounded ${getStatusColor(task.status)}`}
        >
          {task.status}
        </span>
      )}

      {/* Due */}
      {task.due && (
        <span className={`shrink-0 text-xs ${getDueColor(task.due)}`}>{formatDue(task.due)}</span>
      )}

      {/* 打开链接按钮 */}
      <button
        onClick={handleOpenInNotion}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
        title="在 Notion 中打开"
        aria-label={`在 Notion 中打开：${task.title}`}
      >
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  )
}

// ========== 错误显示组件 ==========

interface ErrorDisplayProps {
  error: NotionError
  onRetry: () => void
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps): React.JSX.Element {
  // 判断是否是权限相关错误
  const isPermissionError =
    error.code === 'not_found' || error.code === 'restricted' || error.code === 'unauthorized'

  return (
    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">加载失败</p>
          <p className="text-xs text-destructive/80 mt-1 whitespace-pre-wrap">
            {error.userMessage}
          </p>

          {/* 权限错误的额外提示 */}
          {isPermissionError && (
            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-700">
                💡 在 Notion 页面右上角 ••• → Add connections → 选择你的 Integration 授权
              </p>
            </div>
          )}

          {/* 限流错误提示 */}
          {error.code === 'rate_limited' && error.retryAfter && (
            <p className="text-xs text-amber-600 mt-2">
              ⏱ 请等待 {error.retryAfter} 秒后重试
            </p>
          )}

          <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={onRetry}>
            重试
          </Button>
        </div>
      </div>
    </div>
  )
}

// ========== 空状态组件 ==========

interface EmptyStateProps {
  statusFilter: StatusFilterKey
}

function EmptyState({ statusFilter }: EmptyStateProps): React.JSX.Element {
  const messages: Record<StatusFilterKey, string> = {
    all: '暂无任务',
    todo: '没有 Not started 任务',
    'in-progress': '没有 In progress 任务',
    done: '没有 Done 任务'
  }

  return (
    <div className="p-8 text-center">
      <p className="text-sm text-muted-foreground">{messages[statusFilter]}</p>
    </div>
  )
}

// ========== 加载状态组件 ==========

function LoadingState(): React.JSX.Element {
  return (
    <div className="p-8">
      <div className="flex items-center justify-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">加载中…</span>
      </div>
    </div>
  )
}

// ========== Tab 组件 - Aceternity 微交互 ==========

interface TaskTabsProps {
  activeTab: StatusFilterKey
  onTabChange: (tab: StatusFilterKey) => void
}

function TaskTabs({ activeTab, onTabChange }: TaskTabsProps): React.JSX.Element {
  const tabItems = TABS.map((t) => ({ title: t.label, value: t.key }))

  return (
    <div className="mx-3 mt-2 mb-0 shrink-0 relative z-10 pb-2">
      <AnimatedTabs
        tabs={tabItems}
        activeValue={activeTab}
        onTabChange={(v) => onTabChange(v as StatusFilterKey)}
      />
    </div>
  )
}

// ========== 主组件 ==========

interface TaskListProps {
  isConfigured: boolean
}

export function TaskList({ isConfigured }: TaskListProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<StatusFilterKey>('all')

  // TanStack Query 查询任务
  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['notion', 'tasks', activeTab],
    queryFn: async () => {
      const result = await window.notionAPI.queryTasks({
        statusFilter: activeTab
      })
      if (!result.success) {
        throw result.error
      }
      return {
        tasks: result.tasks || [],
        hasMore: result.hasMore,
        totalFetched: result.totalFetched
      }
    },
    enabled: isConfigured,
    refetchInterval: POLL_INTERVAL,
    refetchOnWindowFocus: false, // 不在 focus 时抢焦点
    staleTime: 30 * 1000,
    retry: false
  })

  // 手动刷新
  const handleRefresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ['notion', 'tasks'] })
    refetch()
  }

  // 格式化最后同步时间
  const formatLastSynced = (): string => {
    if (!dataUpdatedAt) return ''
    const date = new Date(dataUpdatedAt)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // 未配置状态
  if (!isConfigured) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">请先配置 Notion 连接</p>
      </div>
    )
  }

  const tasks = data?.tasks || []

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab 切换 - 胶囊容器，不被内容盖住 */}
      <TaskTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 头部：标题 + 刷新 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-background/50">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {tasks.length} 条{data?.hasMore && '+'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt && (
            <span className="text-xs text-muted-foreground" title="最后同步时间">
              {formatLastSynced()}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={isFetching}
            title="刷新"
            aria-label="刷新任务列表"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 内容区：三态 */}
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <LoadingState />
        ) : isError && error ? (
          <div className="p-3">
            <ErrorDisplay error={error as unknown as NotionError} onRetry={handleRefresh} />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState statusFilter={activeTab} />
        ) : (
          <div className="px-2 py-1 space-y-0.5">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
