import { useState, useEffect, useCallback } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AnimatedTabs } from '@/components/ui/tabs'
import { X, ChevronDown, AlertCircle, CheckCircle, Eye, EyeOff, Copy, Check, Unlink } from 'lucide-react'
import type { FieldMapping, PropertySchema } from '../../../preload'

// ========== Database URL 解析 ==========

export function parseDatabaseId(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  const removeHyphens = (id: string): string => id.replace(/-/g, '')
  const hexIdRegex = /^[a-f0-9]{32}$/i
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

  if (hexIdRegex.test(trimmed)) return trimmed.toLowerCase()
  if (uuidRegex.test(trimmed)) return removeHyphens(trimmed).toLowerCase()

  try {
    if (trimmed.startsWith('http')) {
      const url = new URL(trimmed)
      const pathParts = url.pathname.split('/').filter(Boolean)
      for (const part of pathParts) {
        const cleaned = removeHyphens(part)
        if (hexIdRegex.test(cleaned)) return cleaned.toLowerCase()
      }
    }
  } catch {
    // ignore
  }
  return null
}

// ========== Zod Schema ==========

const settingsSchema = z.object({
  token: z
    .string()
    .min(1, 'Notion Token 不能为空')
    .regex(/^(secret_|ntn_)/, 'Token 格式不正确，应以 secret_ 或 ntn_ 开头'),
  databaseUrl: z.string().min(1, 'Database URL 不能为空')
})

// ========== 字段映射选择器 ==========
// 选项显示格式：字段名 · Title/Text | 字段名 · Status | 字段名 · Date

interface FieldSelectProps {
  label: string
  value: string | null
  options: PropertySchema[]
  filterTypes: string[]
  typeLabel: string // "Title/Text" | "Status" | "Date"
  onChange: (value: string | null) => void
  placeholder?: string
}

function FieldSelect({
  label,
  value,
  options,
  filterTypes,
  typeLabel,
  onChange,
  placeholder = '选择字段…'
}: FieldSelectProps): React.JSX.Element {
  const filteredOptions = options.filter((p) => filterTypes.includes(p.type))

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full px-3 py-2 pr-8 text-sm border border-input rounded-md bg-background appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {filteredOptions.map((prop) => (
            <option key={prop.id} value={prop.id}>
              {prop.name} · {typeLabel}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {filteredOptions.length === 0 && (
        <p className="text-xs text-amber-600">数据库中没有 {filterTypes.join('/')} 类型的字段</p>
      )}
    </div>
  )
}

// ========== Component ==========

type TabValue = 'connection' | 'field-mapping'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  /** 断开连接后的回调（用于清除缓存、刷新状态） */
  onDisconnected?: () => void
  initialDatabaseUrl?: string
  initialFieldMapping?: FieldMapping | null
  initialDataSourceId?: string | null
  initialTab?: TabValue
  /** 独立窗口模式：无遮罩，全屏内容 */
  standalone?: boolean
}

export function SettingsModal({
  isOpen,
  onClose,
  onSaved,
  onDisconnected,
  initialDatabaseUrl,
  initialFieldMapping,
  initialDataSourceId,
  initialTab = 'connection',
  standalone = false
}: SettingsModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab)
  const [token, setToken] = useState('')
  const [databaseUrl, setDatabaseUrl] = useState(initialDatabaseUrl || '')
  const [errors, setErrors] = useState<{ token?: string; databaseUrl?: string; general?: string }>(
    {}
  )
  const [isSaving, setIsSaving] = useState(false)
  const [parsedId, setParsedId] = useState<string | null>(null)
  
  // Token 可见性和复制状态
  const [isTokenVisible, setIsTokenVisible] = useState(false)
  const [isTokenCopied, setIsTokenCopied] = useState(false)
  const [isTokenHovered, setIsTokenHovered] = useState(false)
  
  // Disconnect 确认对话框状态
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // 字段映射状态 - 使用 textPropertyId, statusPropertyId, timePropertyId
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    textPropertyId: initialFieldMapping?.textPropertyId ?? null,
    statusPropertyId: initialFieldMapping?.statusPropertyId ?? null,
    timePropertyId: initialFieldMapping?.timePropertyId ?? null
  })
  const [schema, setSchema] = useState<PropertySchema[]>([])
  const [isLoadingSchema, setIsLoadingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [dataSourceId, setDataSourceId] = useState<string | null>(initialDataSourceId ?? null)

  // 初始化
  useEffect(() => {
    if (isOpen) {
      setDatabaseUrl(initialDatabaseUrl || '')
      setFieldMapping({
        textPropertyId: initialFieldMapping?.textPropertyId ?? null,
        statusPropertyId: initialFieldMapping?.statusPropertyId ?? null,
        timePropertyId: initialFieldMapping?.timePropertyId ?? null
      })
      setDataSourceId(initialDataSourceId ?? null)
    }
  }, [isOpen, initialDatabaseUrl, initialFieldMapping, initialDataSourceId])

  useEffect(() => {
    setParsedId(databaseUrl ? parseDatabaseId(databaseUrl) : null)
  }, [databaseUrl])

  // 加载 schema（dataSources.retrieve）
  const loadSchema = useCallback(async () => {
    setIsLoadingSchema(true)
    setSchemaError(null)
    try {
      const result = await window.notionAPI.getSchema()
      if (result.success && result.properties) {
        setSchema(result.properties)
        setDataSourceId(result.dataSourceId ?? null)
      } else {
        setSchemaError(result.error?.userMessage || '无法获取数据库结构')
      }
    } catch (error) {
      setSchemaError(String(error))
    } finally {
      setIsLoadingSchema(false)
    }
  }, [])

  // Field Mapping tab 激活时加载 schema
  useEffect(() => {
    if (activeTab === 'field-mapping' && schema.length === 0 && !isLoadingSchema) {
      loadSchema()
    }
  }, [activeTab, schema.length, isLoadingSchema, loadSchema])

  // 复制 Token 到剪贴板
  const handleCopyToken = useCallback(async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setIsTokenCopied(true)
      setTimeout(() => setIsTokenCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy token:', error)
    }
  }, [token])

  // 断开 Notion 连接（清除所有数据）
  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true)
    try {
      // 调用 settingsAPI.clear() 清除所有本地存储的 Notion 数据
      const result = await window.settingsAPI.clear()
      if (result.success) {
        // 清空本地状态
        setToken('')
        setDatabaseUrl('')
        setDataSourceId(null)
        setSchema([])
        setFieldMapping({
          textPropertyId: null,
          statusPropertyId: null,
          timePropertyId: null
        })
        setShowDisconnectConfirm(false)
        // 通知父组件断开连接成功（用于清除缓存、刷新状态）
        onDisconnected?.()
        onClose()
      } else {
        setErrors({ general: '断开连接失败，请重试' })
        setShowDisconnectConfirm(false)
      }
    } catch (error) {
      setErrors({ general: String(error) })
      setShowDisconnectConfirm(false)
    } finally {
      setIsDisconnecting(false)
    }
  }, [onDisconnected, onClose])

  // 当 modal 打开且 initialTab 变化时，同步 activeTab（必须在 return 之前）
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
    }
  }, [isOpen, initialTab])

  // Connection: Save
  const handleVerify = async (): Promise<void> => {
    setErrors({})
    
    // 如果 token 为空，视为断开连接操作（允许用户清空配置）
    const isDisconnecting = !token.trim()
    
    if (isDisconnecting) {
      // 断开连接：保存空配置并关闭
      setIsSaving(true)
      try {
        const response = await window.notionAPI.testConnection({ token: '', databaseUrl: '' })
        if (response.success) {
          setDataSourceId(null)
          onSaved()
          onClose()
        } else {
          setErrors({ general: response.error?.userMessage || '保存失败' })
        }
      } catch (error) {
        setErrors({ general: String(error) })
      } finally {
        setIsSaving(false)
      }
      return
    }

    // 正常验证流程（token 不为空时）
    const result = settingsSchema.safeParse({ token, databaseUrl })
    if (!result.success) {
      const fieldErrors: { token?: string; databaseUrl?: string } = {}
      result.error.issues.forEach((err) => {
        const field = err.path[0] as 'token' | 'databaseUrl'
        fieldErrors[field] = err.message
      })
      setErrors(fieldErrors)
      return
    }

    const databaseId = parseDatabaseId(databaseUrl)
    if (!databaseId) {
      setErrors({ databaseUrl: '无法解析 Database ID，请检查 URL 格式' })
      return
    }

    setIsSaving(true)
    try {
      const response = await window.notionAPI.testConnection({ token, databaseUrl })
      if (response.success) {
        setDataSourceId(response.dataSourceId ?? null)
        onSaved()
        setToken('')
        setActiveTab('field-mapping')
        loadSchema()
      } else {
        setErrors({ general: response.error?.userMessage || '验证失败' })
      }
    } catch (error) {
      setErrors({ general: String(error) })
    } finally {
      setIsSaving(false)
    }
  }

  // Field Mapping: Save Mapping
  const handleSaveMapping = async (): Promise<void> => {
    setErrors({})
    setIsSaving(true)
    try {
      const response = await window.notionAPI.saveFieldMapping(fieldMapping)
      if (response.success) {
        onSaved()
        onClose()
      } else {
        setErrors({ general: response.error || '保存映射失败' })
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

  if (!standalone && !isOpen) return null

  const tabs = [
    { title: 'Connection', value: 'connection' as TabValue },
    { title: 'Field Mapping', value: 'field-mapping' as TabValue }
  ]

  const contentPanel = (
    <div
      className={`relative rounded-2xl overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-200 ${
        standalone ? 'w-full h-full' : 'w-[290px] max-w-[calc(100%-32px)] mx-4'
      }`}
      style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(50px)',
          WebkitBackdropFilter: 'blur(50px)',
          border: '0.5px solid rgba(255, 255, 255, 0.5)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header - 设计稿: padding [18,20], border-bottom 1px, shadow */}
        <div
          className="flex items-center justify-between px-5 py-[18px] shrink-0 relative z-10 border-b border-border"
          style={{ 
            boxShadow: '0 1px 4px -1px rgba(0, 0, 0, 0.06)'
          }}
        >
          <h2 className="text-[15px] font-semibold text-foreground">Settings</h2>
          <button
            onClick={handleCancel}
            className="w-[28px] h-[28px] rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.25)' }}
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs: Connection | Field Mapping */}
        <div className="px-4 pt-3 pb-2">
          <AnimatedTabs
            tabs={tabs}
            activeValue={activeTab}
            onTabChange={(v) => setActiveTab(v as TabValue)}
          />
        </div>

        {/* Tab Content - 设计稿: padding [20, 16, 12, 20], gap 20 */}
        <div 
          className={`space-y-5 flex-1 min-h-0 ${standalone ? 'overflow-y-auto' : ''}`}
          style={{ padding: '20px 16px 12px 20px' }}
        >
          {errors.general && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {errors.general}
            </div>
          )}

          {activeTab === 'connection' && (
            <>
              <div className="space-y-2">
                <label htmlFor="notion-token" className="text-xs font-medium text-muted-foreground">
                  Notion Token
                </label>
                <div 
                  className="relative"
                  onMouseEnter={() => setIsTokenHovered(true)}
                  onMouseLeave={() => setIsTokenHovered(false)}
                >
                  <input
                    id="notion-token"
                    type={isTokenVisible ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="secret_xxx or ntn_xxx"
                    autoComplete="off"
                    className="w-full h-10 px-3.5 pr-20 py-3 text-[13px] rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{
                      background: 'rgba(255,255,255,0.25)',
                      border: '0.5px solid rgba(255,255,255,0.5)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                    }}
                  />
                  {/* Icons Wrapper - 设计稿: gap 4 */}
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {/* 复制按钮 - hover 时显示 */}
                    {token && isTokenHovered && (
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        className="p-1 rounded hover:bg-black/5 transition-colors"
                        title={isTokenCopied ? 'Token copied' : 'Copy token'}
                      >
                        {isTokenCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    )}
                    {/* 眼睛图标 - 始终显示 */}
                    <button
                      type="button"
                      onClick={() => setIsTokenVisible(!isTokenVisible)}
                      className="p-1 rounded hover:bg-black/5 transition-colors"
                      title={isTokenVisible ? 'Hide token' : 'Show token'}
                    >
                      {isTokenVisible ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
                {errors.token && <p className="text-xs text-destructive">{errors.token}</p>}
                <p className="text-[11px] text-muted-foreground" style={{ opacity: 0.6 }}>
                  Internal Integration Token
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Database URL</label>
                <input
                  type="text"
                  value={databaseUrl}
                  onChange={(e) => setDatabaseUrl(e.target.value)}
                  placeholder="https://notion.so/..."
                  className="w-full h-10 px-3.5 py-3 text-[13px] rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{
                    background: 'rgba(255,255,255,0.25)',
                    border: '0.5px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                />
                {errors.databaseUrl && (
                  <p className="text-xs text-destructive">{errors.databaseUrl}</p>
                )}
                <p className="text-[11px] text-muted-foreground" style={{ opacity: 0.6 }}>
                  Paste Notion Database link
                </p>
                {databaseUrl && (
                  <div className="text-xs">
                    {parsedId ? (
                      <div className="flex items-center gap-1">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">
                          Database ID: {parsedId.slice(0, 8)}...
                        </span>
                      </div>
                    ) : (
                      <span className="text-amber-600">⚠ 无法解析 Database ID</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'field-mapping' && (
            <div className="space-y-4">
              {!dataSourceId ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-700">
                    先在 Connection 里 Save & Verify
                  </p>
                </div>
              ) : isLoadingSchema ? (
                <p className="text-xs text-muted-foreground">正在加载数据库结构…</p>
              ) : schemaError ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">{schemaError}</p>
                  <Button variant="outline" size="sm" onClick={loadSchema}>
                    重试
                  </Button>
                </div>
              ) : schema.length > 0 ? (
                <>
                  {fieldMapping.textPropertyId &&
                  fieldMapping.statusPropertyId &&
                  fieldMapping.timePropertyId ? (
                    <div className="flex items-center gap-2 text-xs text-green-600">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>已配置字段映射</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>配置 Text / Status / Time 以正确显示任务列表</span>
                    </div>
                  )}

                  <FieldSelect
                    label="Text (Task name)"
                    value={fieldMapping.textPropertyId}
                    options={schema}
                    filterTypes={['title', 'rich_text']}
                    typeLabel="Title/Text"
                    onChange={(v) =>
                      setFieldMapping((prev) => ({ ...prev, textPropertyId: v }))
                    }
                  />
                  <FieldSelect
                    label="Status"
                    value={fieldMapping.statusPropertyId}
                    options={schema}
                    filterTypes={['status']}
                    typeLabel="Status"
                    onChange={(v) =>
                      setFieldMapping((prev) => ({ ...prev, statusPropertyId: v }))
                    }
                  />
                  <FieldSelect
                    label="Time"
                    value={fieldMapping.timePropertyId}
                    options={schema}
                    filterTypes={['date']}
                    typeLabel="Date"
                    onChange={(v) =>
                      setFieldMapping((prev) => ({ ...prev, timePropertyId: v }))
                    }
                  />
                </>
              ) : null}
            </div>
          )}

        </div>

        {/* Disconnect Notion - 设计稿: padding [0, 16, 0, 20], gap 4, 独立块 */}
        {activeTab === 'connection' && initialDataSourceId && (
          <div 
            className="flex items-center gap-1"
            style={{ padding: '0 16px 0 20px' }}
          >
            <Unlink className="h-4 w-4 text-destructive" />
            <button
              type="button"
              onClick={() => setShowDisconnectConfirm(true)}
              className="text-xs text-destructive hover:text-destructive/80 transition-colors"
            >
              Disconnect your Notion
            </button>
          </div>
        )}

        {/* Footer - 设计稿: padding [16,20], gap 10, stroke top 0.5px */}
        <div
          className="flex justify-end gap-2.5 px-5 py-4 shrink-0"
          style={{ 
            borderTop: '0.5px solid rgba(255, 255, 255, 0.5)'
          }}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-[18px] rounded-lg text-[13px] font-medium"
            style={{
              background: 'rgba(255,255,255,0.25)',
              border: '0.5px solid rgba(255,255,255,0.5)'
            }}
            onClick={handleCancel}
          >
            Cancel
          </Button>
          {activeTab === 'connection' && (
            <Button
              size="sm"
              className="h-9 px-[18px] rounded-lg text-[13px] font-medium text-white"
              style={{
                background: '#007AFF',
                boxShadow: '0 1px 3px rgba(0,122,255,0.3)'
              }}
              onClick={handleVerify}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
          {activeTab === 'field-mapping' && (
            <Button
              size="sm"
              className="h-9 px-[18px] rounded-lg text-[13px] font-medium text-white"
              style={{
                background: '#007AFF',
                boxShadow: '0 1px 3px rgba(0,122,255,0.3)'
              }}
              onClick={handleSaveMapping}
              disabled={isSaving || schema.length === 0}
            >
              {isSaving ? 'Saving...' : 'Save Mapping'}
            </Button>
          )}
        </div>

        {/* Token Copied Toast */}
        {isTokenCopied && (
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-2"
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#ffffff',
              border: '1px solid #e5e5e5',
              boxShadow: '0 4px 12px -1px rgba(0,0,0,0.1)'
            }}
          >
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-xs text-muted-foreground">Token copied</span>
          </div>
        )}

        {/* Disconnect 确认对话框 */}
        {showDisconnectConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            {/* 遮罩 */}
            <div
              className="absolute inset-0 bg-black/20 animate-in fade-in-0 duration-150"
              onClick={() => setShowDisconnectConfirm(false)}
            />
            {/* 对话框 */}
            <div
              className="relative z-10 w-[250px] rounded-xl p-5 animate-in fade-in-0 zoom-in-95 duration-150"
              style={{
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
              }}
            >
              <h3 className="text-[15px] font-semibold text-foreground mb-2">
                Disconnect Notion?
              </h3>
              <p className="text-[13px] text-muted-foreground mb-5">
                Your token and database will be removed. You can reconnect anytime.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 rounded-lg text-[13px] font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.5)',
                    border: '0.5px solid rgba(0,0,0,0.1)'
                  }}
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={isDisconnecting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 rounded-lg text-[13px] font-medium text-white"
                  style={{
                    background: '#d44c47',
                    boxShadow: '0 1px 3px rgba(212,76,71,0.3)'
                  }}
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  )

  if (standalone) {
    return contentPanel
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay - 与 AppModal 100% 一致的强模糊背景遮罩 */}
      <div
        className="absolute inset-0 animate-in fade-in-0 duration-200"
        style={{
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)'
        }}
        onClick={handleCancel}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {contentPanel}
    </div>
  )
}
