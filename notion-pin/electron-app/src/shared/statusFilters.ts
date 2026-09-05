export const STATUS_FILTER_KEYWORDS = {
  all: null,
  todo: ['not started', 'todo', '待办'],
  'in-progress': ['in progress', 'progress', '进行'],
  done: ['done', 'complete', '完成']
} as const

export type StatusFilterKey = keyof typeof STATUS_FILTER_KEYWORDS

export function statusMatchesFilter(status: string | null, filterKey: StatusFilterKey): boolean {
  const keywords = STATUS_FILTER_KEYWORDS[filterKey]
  if (!keywords) return true

  const normalizedStatus = status?.toLowerCase() ?? ''
  if (!normalizedStatus && filterKey === 'todo') return true
  return keywords.some((keyword) => normalizedStatus.includes(keyword))
}
