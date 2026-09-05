import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AnimatedTabs } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  ExternalLink,
  Check,
  X,
  ChevronDown,
  LoaderCircle,
  Inbox,
  CircleAlert,
  CircleCheck,
  CircleX,
  Settings2
} from 'lucide-react'
import type {
  NotionTask,
  NotionError,
  StatusFilterKey,
  PropertyUpdate,
  FieldMapping,
  StatusOption
} from '../../../preload'
import { parseNotionDate } from '../../../shared/date'
import { statusMatchesFilter } from '../../../shared/statusFilters'

// ========== 常量配置 ==========

const POLL_INTERVAL = 3 * 60 * 1000 // 3 分钟轮询

// Tab 配置 - 名称与 Notion 对应
const TABS: { key: StatusFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'Not started' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' }
]

// Notion API 颜色名 → hex（与 Notion UI 一致）
const NOTION_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  default: { bg: '#37352f20', text: '#37352f' },
  gray: { bg: '#9b9a9720', text: '#9b9a97' },
  brown: { bg: '#64473a20', text: '#64473a' },
  orange: { bg: '#d9730d20', text: '#d9730d' },
  yellow: { bg: '#dfab0120', text: '#dfab01' },
  green: { bg: '#0f7b6c20', text: '#0f7b6c' },
  blue: { bg: '#0b6e9920', text: '#0b6e99' },
  purple: { bg: '#6940a520', text: '#6940a5' },
  pink: { bg: '#ad1a7220', text: '#ad1a72' },
  red: { bg: '#e03e3e20', text: '#e03e3e' }
}

// 默认状态选项（无 API 数据时回退）
const DEFAULT_STATUS_OPTIONS = [
  { value: 'Not started', label: 'Not started', bg: '#e03e3e20', text: '#e03e3e' },
  { value: 'In progress', label: 'In progress', bg: '#d9730d20', text: '#d9730d' },
  { value: 'Done', label: 'Done', bg: '#0f7b6c20', text: '#0f7b6c' }
]

// ========== 状态选项类型（含 hex 颜色） ==========
type StatusOptionWithColor = { value: string; label: string; bg: string; text: string }

// ========== 任务项组件 ==========

interface TaskItemProps {
  task: NotionTask
  statusOptions: StatusOptionWithColor[]
  onUpdate: (pageId: string, updates: PropertyUpdate[]) => void
  isUpdating: boolean
  updateError: NotionError | null
}

function TaskItem({
  task,
  statusOptions,
  onUpdate,
  isUpdating,
  updateError
}: TaskItemProps): React.JSX.Element {
  // 编辑状态
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭 status dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false)
      }
    }
    if (showStatusDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStatusDropdown])

  // Title 编辑开始时聚焦
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isEditingTitle])

  const handleOpenInNotion = (): void => {
    // 使用安全的 preload API 打开外部链接（仅允许 notion.so 域名）
    window.windowAPI.openExternal(task.url)
  }

  // ========== Title 编辑 ==========
  const handleTitleClick = (): void => {
    setEditTitle(task.title)
    setIsEditingTitle(true)
  }

  const handleTitleSave = (): void => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, [{ field: 'title', value: trimmed }])
    }
    setIsEditingTitle(false)
  }

  const handleTitleCancel = (): void => {
    setEditTitle(task.title)
    setIsEditingTitle(false)
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
    } else if (e.key === 'Escape') {
      handleTitleCancel()
    }
  }

  // ========== Status 编辑 ==========
  const handleStatusChange = (newStatus: string): void => {
    if (newStatus !== task.status) {
      onUpdate(task.id, [{ field: 'status', value: newStatus }])
    }
    setShowStatusDropdown(false)
  }

  // ========== Due 编辑 ==========
  const [isEditingDue, setIsEditingDue] = useState(false)
  const handleDueChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newDue = e.target.value || null
    if (newDue !== task.due) {
      onUpdate(task.id, [{ field: 'due', value: newDue }])
    }
    setIsEditingDue(false)
  }

  // 日期格式化 - 设计稿 daIAG: Today / Jan 27
  const formatDue = (due: string | null): string => {
    if (!due) return ''
    const date = parseNotionDate(due)
    if (!date) return ''

    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ]
    return `${months[date.getMonth()]} ${date.getDate()}`
  }

  // 状态颜色 - 从 statusOptions 查找，否则用默认
  const getStatusStyle = (status: string | null): { bg: string; text: string } => {
    if (!status) return statusOptions[0] ?? DEFAULT_STATUS_OPTIONS[0]
    const opt = statusOptions.find((o) => o.value === status)
    return opt ?? statusOptions[0] ?? DEFAULT_STATUS_OPTIONS[0]
  }

  // Due 日期颜色
  const getDueColor = (due: string | null): string => {
    if (!due) return 'text-muted-foreground'
    const date = parseNotionDate(due)
    if (!date) return 'text-muted-foreground'
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (date < today) {
      return 'text-muted-foreground' // 已过期，不用 red
    }
    if (date.toDateString() === today.toDateString()) {
      return 'text-amber-500' // 今天
    }
    return 'text-muted-foreground'
  }

  const statusStyle = getStatusStyle(task.status)

  return (
    <div
      className={`group relative rounded-lg transition-colors ${isUpdating ? 'opacity-70' : ''}`}
    >
      {/* 设计稿 .task-item: padding 12, vertical layout */}
      <div className="flex flex-col gap-1.5 p-3 rounded-lg hover:bg-muted/30">
        {/* .task-content: gap 6 */}
        <div className="flex flex-col gap-1.5">
          {/* .task-title: 14px, 500, lineHeight 1.4 */}
          <div className="flex items-start gap-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex-1 flex items-center gap-1 min-w-0">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={handleTitleSave}
                  className="flex-1 px-1.5 py-0.5 text-sm border border-ring rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring min-w-0"
                />
                <button onClick={handleTitleSave} className="p-0.5 rounded hover:bg-muted">
                  <Check className="h-3 w-3 text-green-600" />
                </button>
                <button onClick={handleTitleCancel} className="p-0.5 rounded hover:bg-muted">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <p
                  className="flex-1 text-sm font-medium leading-[1.4] truncate min-w-0 cursor-pointer hover:text-foreground/80"
                  title={`Click to edit: ${task.title}`}
                  onClick={handleTitleClick}
                >
                  {task.title}
                </p>
              </div>
            )}
            <button
              onClick={handleOpenInNotion}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
              title="Open in Notion"
              aria-label={`Open in Notion: ${task.title}`}
            >
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>

          {/* .task-meta: gap 8, status + due */}
          <div className="flex items-center gap-2">
            {/* .task-status: cornerRadius 4, padding 2 6 */}
            <div className="relative" ref={statusRef}>
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-opacity cursor-pointer hover:opacity-80"
                style={{ background: statusStyle.bg, color: statusStyle.text }}
                title="Click to change status"
              >
                {task.status || 'No status'}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showStatusDropdown && (
                <div
                  className="absolute left-0 top-full mt-1 z-50 border border-border rounded-md shadow-lg py-1 min-w-[120px]"
                  style={{
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)'
                  }}
                >
                  {statusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors ${
                        task.status === opt.value ? 'font-medium' : ''
                      }`}
                    >
                      <span
                        className="inline-block px-1.5 py-0.5 rounded"
                        style={{ background: opt.bg, color: opt.text }}
                      >
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* .task-due: 12px, 设计稿 muted-foreground */}
            {isEditingDue ? (
              <input
                type="date"
                value={task.due || ''}
                onChange={handleDueChange}
                onBlur={() => setIsEditingDue(false)}
                autoFocus
                className={`min-w-0 text-xs border border-ring rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring ${getDueColor(
                  task.due
                )}`}
              />
            ) : (
              <span
                onClick={() => setIsEditingDue(true)}
                className={`text-xs ${getDueColor(task.due)} cursor-pointer hover:opacity-80 transition-opacity`}
                title="Click to set due date"
              >
                {task.due ? formatDue(task.due) : <span className="text-muted-foreground">—</span>}
              </span>
            )}
          </div>
        </div>
      </div>

      {updateError && (
        <div className="absolute left-0 right-0 bottom-full mb-1 p-2 bg-destructive/10 text-destructive text-xs rounded">
          {updateError.userMessage}
        </div>
      )}
    </div>
  )
}

// ========== 错误显示组件 - 设计稿 b9usq ==========

interface ErrorDisplayProps {
  error: NotionError
  onRetry: () => void
  onOpenSettings?: () => void
}

function ErrorDisplay({ error, onRetry, onOpenSettings }: ErrorDisplayProps): React.JSX.Element {
  const isPermissionError =
    error.code === 'not_found' || error.code === 'restricted' || error.code === 'unauthorized'
  const isMappingError = error.code === 'mapping_not_configured' || error.code === 'mapping_invalid'

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-5">
      <CircleAlert className="h-8 w-8 shrink-0" style={{ color: '#FF3B30' }} />
      <p className="text-xs font-medium text-center" style={{ color: '#FF3B30' }}>
        {isMappingError ? 'Please configure field mapping' : 'Failed to load tasks'}
      </p>
      <p className="text-xs text-muted-foreground text-center whitespace-pre-wrap">
        {error.userMessage}
      </p>
      {isMappingError && onOpenSettings && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-[18px] rounded-lg text-[13px] font-medium bg-white/25 border-white/50"
          onClick={onOpenSettings}
        >
          Go to Field Mapping
        </Button>
      )}
      {isPermissionError && (
        <p className="text-xs text-amber-600 text-center">
          💡 Notion → ••• → Add connections → 选择 Integration
        </p>
      )}
      {error.code === 'rate_limited' && error.retryAfter && (
        <p className="text-xs text-amber-600">⏱ Retry after {error.retryAfter}s</p>
      )}
      {!isMappingError && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-[18px] rounded-lg text-[13px] font-medium bg-white/25 border-white/50"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  )
}

// ========== 空状态组件 - 设计稿 jEr6v ==========

interface EmptyStateProps {
  statusFilter: StatusFilterKey
}

function EmptyState({ statusFilter }: EmptyStateProps): React.JSX.Element {
  const messages: Record<StatusFilterKey, string> = {
    all: 'No tasks',
    todo: 'No Not started tasks',
    'in-progress': 'No In progress tasks',
    done: 'No Done tasks'
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <Inbox className="h-8 w-8 text-muted-foreground opacity-50" />
      <span className="text-[13px] font-medium text-muted-foreground">
        {messages[statusFilter]}
      </span>
    </div>
  )
}

// ========== 加载状态组件 - 设计稿 JdjqO ==========

function LoadingState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <LoaderCircle className="h-6 w-6 animate-spin shrink-0" style={{ color: '#007AFF' }} />
      <span className="text-[13px] font-medium" style={{ color: '#737373' }}>
        Loading...
      </span>
    </div>
  )
}

// ========== Tab 组件 - 设计稿 .tabs-container padding 12 16 16 16 ==========

interface TaskTabsProps {
  activeTab: StatusFilterKey
  onTabChange: (tab: StatusFilterKey) => void
}

function TaskTabs({ activeTab, onTabChange }: TaskTabsProps): React.JSX.Element {
  const tabItems = TABS.map((t) => ({ title: t.label, value: t.key }))

  return (
    <div className="px-4 pt-3 pb-4 shrink-0 relative z-10">
      <AnimatedTabs
        tabs={tabItems}
        activeValue={activeTab}
        onTabChange={(v) => onTabChange(v as StatusFilterKey)}
      />
    </div>
  )
}

// ========== Sonner Toast - 设计稿 ztHkN (Success) / g85va (Error) 100% 复刻
// padding 12 16, gap 12, cornerRadius 8, bg #fff, border #e5e5e5
// shadow: blur 12, color #0000000d, offset y:4, spread -1
// icon: circle-check 18x18 #16a34a | circle-x 18x18 #d44c47
// text: Inter 12px normal #737373

interface SonnerToastProps {
  type: 'success' | 'error'
  onDismiss: () => void
}

function SonnerToast({ type, onDismiss }: SonnerToastProps): React.JSX.Element {
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
        background: '#ffffff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        boxShadow: '0 4px 12px -1px rgba(0,0,0,0.05)'
      }}
    >
      {isSuccess ? (
        <CircleCheck className="h-[18px] w-[18px] shrink-0" style={{ color: '#16a34a' }} />
      ) : (
        <CircleX className="h-[18px] w-[18px] shrink-0" style={{ color: '#d44c47' }} />
      )}
      <span style={{ fontSize: 12, color: '#737373', fontFamily: 'Inter, sans-serif' }}>
        {isSuccess ? 'Changes saved successfully' : 'Failed to update task'}
      </span>
    </div>
  )
}

// 将 Notion API 的 StatusOption[] 转为带 hex 颜色的选项
function toStatusOptionsWithColor(opts: StatusOption[] | undefined): StatusOptionWithColor[] {
  if (!opts?.length) return DEFAULT_STATUS_OPTIONS
  return opts.map((o) => {
    const colors = NOTION_COLOR_MAP[o.color] ?? NOTION_COLOR_MAP.default
    return {
      value: o.name,
      label: o.name,
      bg: colors.bg,
      text: colors.text
    }
  })
}

// ========== 主组件 ==========

interface TaskListProps {
  isConfigured: boolean
  fieldMapping?: FieldMapping | null
  onOpenSettings?: () => void
  onQueryReady?: (controls: { refetch: () => Promise<unknown>; isFetching: boolean } | null) => void
}

export function TaskList({
  isConfigured,
  fieldMapping,
  onOpenSettings,
  onQueryReady
}: TaskListProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<StatusFilterKey>('all')
  const [updateError, setUpdateError] = useState<NotionError | null>(null)
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set())

  // 获取 Database Schema（含 status 选项和颜色）
  const { data: schemaData } = useQuery({
    queryKey: ['notion', 'schema'],
    queryFn: async () => {
      const result = await window.notionAPI.getSchema()
      if (!result.success) return null
      return result.properties ?? []
    },
    enabled: isConfigured,
    staleTime: 5 * 60 * 1000, // 5 分钟
    retry: false
  })

  // 从 schema 中提取 status 选项（仅 status 类型，不含 select）- 使用 useMemo 缓存
  const statusOptions = useMemo<StatusOptionWithColor[]>(() => {
    const schemaProperties = schemaData ?? []
    const statusPropId = fieldMapping?.statusPropertyId
    const prop = statusPropId
      ? schemaProperties.find(
          (property) => property.id === statusPropId && property.type === 'status'
        )
      : schemaProperties.find((property) => property.type === 'status')
    return toStatusOptionsWithColor(prop?.options)
  }, [schemaData, fieldMapping?.statusPropertyId])

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

  // 向 App 暴露 refetch 和 isFetching（用于刷新按钮和 Toast）
  useEffect(() => {
    if (!onQueryReady) return
    if (isConfigured) {
      onQueryReady({
        refetch: () => refetch({ throwOnError: true }),
        isFetching
      })
    } else {
      onQueryReady(null)
    }
  }, [onQueryReady, isConfigured, refetch, isFetching])

  // 缓存数据类型
  type TasksCacheData = { tasks: NotionTask[]; hasMore?: boolean; totalFetched?: number }

  // 更新任务 Mutation（乐观更新）
  // 传入 currentTab 避免闭包中 activeTab 过时
  const updateMutation = useMutation({
    mutationFn: async ({
      pageId,
      updates
    }: {
      pageId: string
      updates: PropertyUpdate[]
      currentTab: StatusFilterKey // 用于 onMutate/onError 中正确获取当前 tab
    }) => {
      const result = await window.notionAPI.updateTask({ pageId, updates })
      if (!result.success) {
        throw result.error
      }
      return result
    },
    // 乐观更新
    onMutate: async ({ pageId, updates, currentTab }) => {
      // 取消所有 tasks 相关的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['notion', 'tasks'] })

      // 记录正在更新的任务
      setUpdatingTaskIds((prev) => new Set(prev).add(pageId))

      // 保存所有相关 tabs 的快照用于回滚
      const previousCurrentTab = queryClient.getQueryData<TasksCacheData>([
        'notion',
        'tasks',
        currentTab
      ])
      const previousAllTab =
        currentTab !== 'all'
          ? queryClient.getQueryData<TasksCacheData>(['notion', 'tasks', 'all'])
          : undefined

      // 提取新状态值（用于判断是否符合筛选）
      const statusUpdate = updates.find((u) => u.field === 'status')
      const newStatus = statusUpdate ? statusUpdate.value : undefined

      // 辅助函数：更新单个任务
      const updateTaskInList = (task: NotionTask): NotionTask => {
        if (task.id !== pageId) return task
        const updated = { ...task }
        for (const u of updates) {
          if (u.field === 'title' && u.value !== null) {
            updated.title = u.value
          } else if (u.field === 'status') {
            updated.status = u.value
          } else if (u.field === 'due') {
            updated.due = u.value
          }
        }
        return updated
      }

      // 1. 更新 all tab 的缓存（如果有且当前不在 all）
      if (currentTab !== 'all' && previousAllTab) {
        queryClient.setQueryData<TasksCacheData>(['notion', 'tasks', 'all'], (old) => {
          if (!old) return old
          return {
            ...old,
            tasks: old.tasks.map(updateTaskInList)
          }
        })
      }

      // 2. 更新当前 tab 的缓存
      queryClient.setQueryData<TasksCacheData>(['notion', 'tasks', currentTab], (old) => {
        if (!old) return old

        // 如果是 all tab，直接更新
        if (currentTab === 'all') {
          return {
            ...old,
            tasks: old.tasks.map(updateTaskInList)
          }
        }

        // 非 all tab：检查新状态是否符合当前筛选
        // 如果不符合，从列表移除；如果符合，更新状态
        if (newStatus !== undefined && !statusMatchesFilter(newStatus, currentTab)) {
          // 新状态不符合当前 tab 筛选，移除该任务
          return {
            ...old,
            tasks: old.tasks.filter((task) => task.id !== pageId)
          }
        } else {
          // 符合筛选，正常更新
          return {
            ...old,
            tasks: old.tasks.map(updateTaskInList)
          }
        }
      })

      return { previousCurrentTab, previousAllTab, currentTab }
    },
    // 错误回滚
    onError: (err, { pageId }, context) => {
      // 回滚当前 tab 的数据
      if (context?.previousCurrentTab) {
        queryClient.setQueryData(
          ['notion', 'tasks', context.currentTab],
          context.previousCurrentTab
        )
      }
      // 回滚 all tab 的数据（如果有）
      if (context?.previousAllTab) {
        queryClient.setQueryData(['notion', 'tasks', 'all'], context.previousAllTab)
      }
      // 显示错误
      setUpdateError(err as unknown as NotionError)
      // 移除更新状态
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
    },
    // 成功后 - 设计稿 qu2Ld: "Changes saved successfully"
    onSuccess: (_, { pageId }) => {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(pageId)
        return next
      })
      setUpdateSuccess(true)
      // 延迟 5 秒后静默同步，确保最终一致性（避免乐观更新与服务端不一致）
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['notion', 'tasks'] })
      }, 5000)
    }
  })

  // 处理任务更新
  const handleTaskUpdate = useCallback(
    (pageId: string, updates: PropertyUpdate[]) => {
      updateMutation.mutate({ pageId, updates, currentTab: activeTab })
    },
    [updateMutation, activeTab]
  )

  // 手动刷新
  const handleRefresh = (): void => {
    queryClient.invalidateQueries({ queryKey: ['notion', 'tasks'] })
    // React Query 会自动 refetch stale 的活跃查询，无需显式调用 refetch()
  }

  // 格式化最后同步时间
  const formatLastSynced = (): string => {
    if (!dataUpdatedAt) return ''
    const date = new Date(dataUpdatedAt)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // 清除更新 Toast（成功/失败）
  const handleDismissToast = useCallback(() => {
    setUpdateError(null)
    setUpdateSuccess(false)
  }, [])

  // 未配置状态
  if (!isConfigured) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">Please configure Notion connection first</p>
      </div>
    )
  }

  const tasks = data?.tasks || []

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs - 设计稿 padding 12 16 16 16 */}
      <TaskTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Task list - 设计稿 padding 8 12, gap 2 */}
      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 relative">
        {/* 刷新时也展示 loading 态 - 设计稿 JdjqO */}
        {isLoading || isFetching ? (
          <LoadingState />
        ) : isError && error ? (
          <ErrorDisplay
            error={error as unknown as NotionError}
            onRetry={handleRefresh}
            onOpenSettings={onOpenSettings}
          />
        ) : tasks.length === 0 ? (
          <EmptyState statusFilter={activeTab} />
        ) : (
          <div className="flex flex-col">
            {tasks.map((task, index) => (
              <div key={task.id}>
                <TaskItem
                  task={task}
                  statusOptions={statusOptions}
                  onUpdate={handleTaskUpdate}
                  isUpdating={updatingTaskIds.has(task.id)}
                  updateError={null}
                />
                {index < tasks.length - 1 && (
                  <Separator className="my-0.5 bg-border/50 h-[1.5px]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer - 设计稿 JJmcB 100% 复刻 */}
      {/* JJmcB: height 40, padding [16,16,16,24], justify end, align center, shadow blur 7 offset y:-3 */}
      <footer
        className="flex items-center justify-end shrink-0 relative"
        style={{
          height: 40,
          padding: '16px 16px 16px 24px',
          boxShadow: '0 -3px 7px rgba(0, 0, 0, 0.06)',
          backgroundColor: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
        {/* x4vAL: 右侧 - gap 12, Last sync + Settings */}
        <div className="flex items-center justify-center" style={{ gap: 12 }}>
          {/* fdvPV: .sync-text - Inter 12px normal, #737373, opacity 0.7 */}
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 400,
              color: '#737373',
              opacity: 0.7
            }}
          >
            Last sync: {formatLastSynced() || '--:--'}
          </span>
          {/* VRG71: .settings-icon-btn 20x20, 内含 8YdKo settings-2 icon 16x16 #737373 */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center transition-colors hover:opacity-80"
              style={{ width: 20, height: 20 }}
              title="Settings"
              aria-label="Open settings"
            >
              <Settings2 style={{ width: 16, height: 16, color: '#737373' }} />
            </button>
          )}
        </div>
      </footer>

      {updateSuccess && <SonnerToast type="success" onDismiss={handleDismissToast} />}
      {updateError && <SonnerToast type="error" onDismiss={handleDismissToast} />}
    </div>
  )
}
