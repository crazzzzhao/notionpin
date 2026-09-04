const COMPACT_NOTION_ID = /^[a-f0-9]{32}$/i
const NOTION_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const NOTION_TOKEN = /^(secret_|ntn_)[A-Za-z0-9_-]+$/
const NOTION_HOSTS = ['notion.so', 'notion.com', 'notion.site'] as const
const STATUS_FILTERS = new Set(['all', 'todo', 'in-progress', 'done'])
const UPDATE_FIELDS = new Set(['title', 'status', 'due'])

export interface FieldMappingInput {
  textPropertyId: string | null
  statusPropertyId: string | null
  timePropertyId: string | null
  boundDataSourceId?: string | null
}

export interface PropertyUpdateInput {
  field: 'title' | 'status' | 'due'
  value: string | null
}

export interface UpdateTaskInput {
  pageId: string
  updates: PropertyUpdateInput[]
}

export interface QueryTasksInput {
  statusFilter?: 'all' | 'todo' | 'in-progress' | 'done'
  cursor?: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeNotionId(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (COMPACT_NOTION_ID.test(trimmed)) return trimmed.toLowerCase()
  if (NOTION_UUID.test(trimmed)) return trimmed.replaceAll('-', '').toLowerCase()

  return null
}

export function isAllowedNotionUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false

  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const isNotionHost = NOTION_HOSTS.some(
      (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    )

    return (
      url.protocol === 'https:' &&
      isNotionHost &&
      url.username === '' &&
      url.password === '' &&
      (url.port === '' || url.port === '443')
    )
  } catch {
    return false
  }
}

export function parseDatabaseId(value: unknown): string | null {
  const directId = normalizeNotionId(value)
  if (directId) return directId
  if (!isAllowedNotionUrl(value)) return null

  const url = new URL(value)
  const pathParts = url.pathname.split('/').filter(Boolean)

  for (const part of pathParts.reverse()) {
    let decodedPart: string
    try {
      decodedPart = decodeURIComponent(part)
    } catch {
      continue
    }

    const compactPart = decodedPart.replaceAll('-', '')
    const trailingId = compactPart.match(/([a-f0-9]{32})$/i)?.[1]
    if (trailingId) return trailingId.toLowerCase()
  }

  return null
}

export function isValidNotionToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 12 &&
    value.length <= 512 &&
    NOTION_TOKEN.test(value)
  )
}

function isNullablePropertyId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= 256)
}

export function isValidFieldMapping(value: unknown): value is FieldMappingInput {
  if (!isRecord(value)) return false

  return (
    isNullablePropertyId(value.textPropertyId) &&
    isNullablePropertyId(value.statusPropertyId) &&
    isNullablePropertyId(value.timePropertyId) &&
    (value.boundDataSourceId === undefined || isNullablePropertyId(value.boundDataSourceId))
  )
}

export function isValidQueryTasksInput(value: unknown): value is QueryTasksInput | undefined {
  if (value === undefined) return true
  if (!isRecord(value)) return false

  const validFilter =
    value.statusFilter === undefined ||
    (typeof value.statusFilter === 'string' && STATUS_FILTERS.has(value.statusFilter))
  const validCursor =
    value.cursor === undefined ||
    (typeof value.cursor === 'string' && value.cursor.length > 0 && value.cursor.length <= 2048)

  return validFilter && validCursor
}

export function isValidUpdateTaskInput(value: unknown): value is UpdateTaskInput {
  if (
    !isRecord(value) ||
    normalizeNotionId(value.pageId) === null ||
    !Array.isArray(value.updates)
  ) {
    return false
  }
  if (value.updates.length === 0 || value.updates.length > 3) return false

  const seenFields = new Set<string>()

  for (const update of value.updates) {
    if (!isRecord(update) || typeof update.field !== 'string' || !UPDATE_FIELDS.has(update.field)) {
      return false
    }
    if (seenFields.has(update.field)) return false
    seenFields.add(update.field)

    if (update.field === 'title') {
      if (
        typeof update.value !== 'string' ||
        update.value.trim().length === 0 ||
        update.value.length > 2000
      ) {
        return false
      }
    } else if (update.field === 'status') {
      if (
        typeof update.value !== 'string' ||
        update.value.length === 0 ||
        update.value.length > 256
      ) {
        return false
      }
    } else if (
      update.value !== null &&
      (typeof update.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(update.value))
    ) {
      return false
    }
  }

  return true
}

export function normalizeWindowSize(
  width: unknown,
  height: unknown,
  minimumWidth: number,
  minimumHeight: number
): { width: number; height: number } | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null

  return {
    width: Math.min(4096, Math.max(minimumWidth, Math.round(width))),
    height: Math.min(4096, Math.max(minimumHeight, Math.round(height)))
  }
}
