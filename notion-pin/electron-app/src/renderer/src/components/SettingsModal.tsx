import { useState, useEffect } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

// ========== Database URL 解析 ==========

/**
 * 解析 Notion Database URL，提取 database_id
 * 支持格式：
 * - https://www.notion.so/workspace/abc123def456...?v=xxx
 * - https://www.notion.so/abc123def456...?v=xxx
 * - https://notion.so/abc123def456...
 * - abc123def456... (直接输入 ID)
 * - abc123-def4-5678-... (带短横线格式)
 */
export function parseDatabaseId(input: string): string | null {
  if (!input || typeof input !== 'string') return null

  const trimmed = input.trim()

  // 移除短横线，统一格式
  const removeHyphens = (id: string): string => id.replace(/-/g, '')

  // 32 位十六进制 ID 正则（不带短横线）
  const hexIdRegex = /^[a-f0-9]{32}$/i

  // 带短横线的 UUID 格式
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

  // 1. 直接是 32 位 hex ID
  if (hexIdRegex.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  // 2. UUID 格式（带短横线）
  if (uuidRegex.test(trimmed)) {
    return removeHyphens(trimmed).toLowerCase()
  }

  // 3. 从 URL 中提取
  try {
    // 尝试解析为 URL
    let url: URL
    if (trimmed.startsWith('http')) {
      url = new URL(trimmed)
    } else {
      // 可能是不完整的 URL
      return null
    }

    // pathname 格式: /workspace/database_id 或 /database_id
    const pathParts = url.pathname.split('/').filter(Boolean)

    // 从路径中找到 32 位 hex ID
    for (const part of pathParts) {
      const cleaned = removeHyphens(part)
      if (hexIdRegex.test(cleaned)) {
        return cleaned.toLowerCase()
      }
    }

    return null
  } catch {
    return null
  }
}

// ========== Zod Schema ==========

const settingsSchema = z.object({
  token: z
    .string()
    .min(1, 'Notion Token 不能为空')
    .regex(/^(secret_|ntn_)/, 'Token 格式不正确，应以 secret_ 或 ntn_ 开头'),
  databaseUrl: z.string().min(1, 'Database URL 不能为空')
})

// ========== Component ==========

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  initialDatabaseUrl?: string
}

export function SettingsModal({
  isOpen,
  onClose,
  onSaved,
  initialDatabaseUrl
}: SettingsModalProps): React.JSX.Element | null {
  const [token, setToken] = useState('')
  const [databaseUrl, setDatabaseUrl] = useState(initialDatabaseUrl || '')
  const [errors, setErrors] = useState<{ token?: string; databaseUrl?: string; general?: string }>(
    {}
  )
  const [isSaving, setIsSaving] = useState(false)
  const [parsedId, setParsedId] = useState<string | null>(null)

  // 初始化时加载已有的 databaseUrl
  useEffect(() => {
    if (isOpen && initialDatabaseUrl) {
      setDatabaseUrl(initialDatabaseUrl)
    }
  }, [isOpen, initialDatabaseUrl])

  // 实时解析 database ID
  useEffect(() => {
    if (databaseUrl) {
      const id = parseDatabaseId(databaseUrl)
      setParsedId(id)
    } else {
      setParsedId(null)
    }
  }, [databaseUrl])

  const handleSave = async (): Promise<void> => {
    setErrors({})

    // Zod 校验
    const result = settingsSchema.safeParse({ token, databaseUrl })
    if (!result.success) {
      const fieldErrors: { token?: string; databaseUrl?: string } = {}
      result.error.errors.forEach((err) => {
        const field = err.path[0] as 'token' | 'databaseUrl'
        fieldErrors[field] = err.message
      })
      setErrors(fieldErrors)
      return
    }

    // 解析 database ID
    const databaseId = parseDatabaseId(databaseUrl)
    if (!databaseId) {
      setErrors({ databaseUrl: '无法解析 Database ID，请检查 URL 格式' })
      return
    }

    setIsSaving(true)

    try {
      const response = await window.settingsAPI.save({
        token,
        databaseUrl,
        databaseId
      })

      if (response.success) {
        setToken('') // 清空 token 输入
        onSaved()
        onClose()
      } else {
        setErrors({ general: response.error || '保存失败' })
      }
    } catch (error) {
      setErrors({ general: String(error) })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = (): void => {
    setToken('')
    setErrors({})
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 - 点击关闭 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleCancel}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* 弹窗 - 阻止点击穿透，确保内部可交互 */}
      <div
        className="relative bg-background border border-border rounded-lg shadow-lg w-[calc(100%-32px)] max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold">设置</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-4">
          {/* 通用错误 */}
          {errors.general && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {errors.general}
            </div>
          )}

          {/* Notion Token */}
          <div className="space-y-2">
            <label htmlFor="notion-token" className="text-sm font-medium">
              Notion Token
            </label>
            <input
              id="notion-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="secret_xxx 或 ntn_xxx"
              autoComplete="off"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.token && <p className="text-xs text-destructive">{errors.token}</p>}
            <p className="text-xs text-muted-foreground">
              在 Notion Integrations 页面创建获取，Token 将加密存储
            </p>
          </div>

          {/* Database URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Database URL</label>
            <input
              type="text"
              value={databaseUrl}
              onChange={(e) => setDatabaseUrl(e.target.value)}
              placeholder="https://notion.so/... 或 database ID"
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.databaseUrl && <p className="text-xs text-destructive">{errors.databaseUrl}</p>}

            {/* 实时解析结果 */}
            {databaseUrl && (
              <div className="text-xs">
                {parsedId ? (
                  <span className="text-green-600">✓ Database ID: {parsedId.slice(0, 8)}...</span>
                ) : (
                  <span className="text-amber-600">⚠ 无法解析 Database ID</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}
