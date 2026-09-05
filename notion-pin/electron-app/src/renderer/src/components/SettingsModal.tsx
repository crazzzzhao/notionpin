import { useState, useEffect, useCallback, useId } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { AnimatedTabs } from '@/components/ui/tabs'
import {
  X,
  ChevronDown,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  Unlink,
  Type,
  Loader,
  Calendar
} from 'lucide-react'
import type { FieldMapping, PropertySchema } from '../../../preload'
import { isFieldMappingCompatible, parseDatabaseId } from '../../../shared/validation'

// ========== Zod Schema ==========

const settingsSchema = z.object({
  token: z
    .string()
    .min(1, 'Notion Token is required')
    .regex(/^(secret_|ntn_)/, 'Invalid token format, must start with secret_ or ntn_'),
  databaseUrl: z.string().min(1, 'Database URL is required')
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
  icon?: React.ReactNode
}

function FieldSelect({
  label,
  value,
  options,
  filterTypes,
  typeLabel,
  onChange,
  placeholder = 'Select a field...',
  icon
}: FieldSelectProps): React.JSX.Element {
  const id = useId()
  const filteredOptions = options.filter((p) => filterTypes.includes(p.type))

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full h-10 ps-3 pe-9 text-[13px] border border-input rounded-xl bg-popover appearance-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {filteredOptions.map((prop) => (
            <option key={prop.id} value={prop.id}>
              {prop.name} · {typeLabel}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        />
      </div>
      {filteredOptions.length === 0 && (
        <p className="text-xs text-amber-600">No {filterTypes.join('/')} type fields in database</p>
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
  isTokenConfigured: boolean
  initialTab?: TabValue
}

export function SettingsModal({
  isOpen,
  onClose,
  onSaved,
  onDisconnected,
  initialDatabaseUrl,
  initialFieldMapping,
  initialDataSourceId,
  isTokenConfigured,
  initialTab = 'connection'
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
        setSchemaError(result.error?.userMessage || 'Failed to load database schema')
      }
    } catch (error) {
      setSchemaError(String(error))
    } finally {
      setIsLoadingSchema(false)
    }
  }, [])

  // Field Mapping tab 激活时加载 schema
  useEffect(() => {
    if (activeTab === 'field-mapping' && schema.length === 0 && !isLoadingSchema && !schemaError) {
      loadSchema()
    }
  }, [activeTab, schema.length, isLoadingSchema, schemaError, loadSchema])

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
        setErrors({ general: 'Failed to disconnect, please try again' })
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

    if (!token.trim()) {
      setErrors({
        token: isTokenConfigured
          ? 'Enter the token again to change the connection, or use Disconnect.'
          : 'Notion Token is required'
      })
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
      setErrors({ databaseUrl: 'Cannot parse Database ID, please check URL format' })
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
        setErrors({ general: response.error?.userMessage || 'Verification failed' })
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
    if (!isFieldMappingCompatible(fieldMapping, schema)) {
      setErrors({ general: 'Select valid Text, Status, and Date fields before saving' })
      return
    }
    setIsSaving(true)
    try {
      const response = await window.notionAPI.saveFieldMapping(fieldMapping)
      if (response.success) {
        onSaved()
        onClose()
      } else {
        setErrors({ general: response.error || 'Failed to save mapping' })
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

  const tabs = [
    { title: 'Connection', value: 'connection' as TabValue },
    { title: 'Field Mapping', value: 'field-mapping' as TabValue }
  ]

  const contentPanel = (
    <div
      className="settings-panel relative rounded-2xl overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-200 w-[290px]"
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
      {/* Scroll the entire content region at high zoom; actions stay outside it. */}
      <div className="settings-scroll min-h-0 overflow-y-auto overscroll-contain">
        <div className="settings-header flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="min-w-0 wrap-anywhere text-[15px] font-semibold text-foreground">
            Settings
          </h2>
          <button
            onClick={handleCancel}
            className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.25)' }}
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs: Connection | Field Mapping */}
        <div className="settings-tabs px-5">
          <AnimatedTabs
            tabs={tabs}
            activeValue={activeTab}
            onTabChange={(v) => setActiveTab(v as TabValue)}
          />
        </div>

        {/* 8px within a field, 24px between groups; avoid stacked footer padding. */}
        <div className="settings-body space-y-6 px-5 pt-5 pb-2 wrap-anywhere">
          {errors.general && (
            <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              {errors.general}
            </div>
          )}

          {activeTab === 'connection' && (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="notion-token"
                  className="block text-xs font-medium text-muted-foreground"
                >
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
                    placeholder={
                      isTokenConfigured ? 'Token is stored securely' : 'secret_xxx or ntn_xxx'
                    }
                    autoComplete="off"
                    className={`w-full h-10 ps-3 ${token ? 'pe-20' : 'pe-10'} text-[13px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    style={{
                      background: 'rgba(255,255,255,0.25)',
                      border: '0.5px solid rgba(255,255,255,0.5)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                    }}
                  />
                  {/* Icons Wrapper - 设计稿: gap 4 */}
                  <div className="absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
                <label
                  htmlFor="notion-database-url"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Database URL
                </label>
                <input
                  id="notion-database-url"
                  type="text"
                  value={databaseUrl}
                  onChange={(e) => setDatabaseUrl(e.target.value)}
                  placeholder="https://notion.so/..."
                  className="w-full h-10 px-3 text-[13px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    background: 'rgba(255,255,255,0.25)',
                    border: '0.5px solid rgba(255,255,255,0.5)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                  }}
                />
                {errors.databaseUrl && (
                  <p className="text-xs text-destructive">{errors.databaseUrl}</p>
                )}
                {!databaseUrl && (
                  <p className="text-[11px] text-muted-foreground" style={{ opacity: 0.6 }}>
                    Paste Notion Database link
                  </p>
                )}
                {databaseUrl && (
                  <div className="text-xs">
                    {parsedId ? (
                      <div className="flex items-center gap-1">
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
                        <span className="text-green-600">
                          Database ID: {parsedId.slice(0, 8)}...
                        </span>
                      </div>
                    ) : (
                      <span className="text-amber-600">⚠ Cannot parse Database ID</span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'field-mapping' && (
            <div className="space-y-6">
              {!dataSourceId ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-700">Save & Verify in Connection first</p>
                </div>
              ) : isLoadingSchema ? (
                <p className="text-xs text-muted-foreground">Loading database schema...</p>
              ) : schemaError ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">{schemaError}</p>
                  <Button variant="outline" size="sm" onClick={loadSchema}>
                    Retry
                  </Button>
                </div>
              ) : schema.length > 0 ? (
                <>
                  <FieldSelect
                    label="Text"
                    icon={<Type className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                    value={fieldMapping.textPropertyId}
                    options={schema}
                    filterTypes={['title', 'rich_text']}
                    typeLabel="Text"
                    onChange={(v) => setFieldMapping((prev) => ({ ...prev, textPropertyId: v }))}
                  />
                  <FieldSelect
                    label="Status"
                    icon={<Loader className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                    value={fieldMapping.statusPropertyId}
                    options={schema}
                    filterTypes={['status']}
                    typeLabel="Status"
                    onChange={(v) => setFieldMapping((prev) => ({ ...prev, statusPropertyId: v }))}
                  />
                  <FieldSelect
                    label="Date"
                    icon={<Calendar className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                    value={fieldMapping.timePropertyId}
                    options={schema}
                    filterTypes={['date']}
                    typeLabel="Date"
                    onChange={(v) => setFieldMapping((prev) => ({ ...prev, timePropertyId: v }))}
                  />
                </>
              ) : null}
            </div>
          )}
          {activeTab === 'connection' && isTokenConfigured && (
            <button
              type="button"
              onClick={() => setShowDisconnectConfirm(true)}
              className="settings-disconnect flex min-h-8 w-full items-center justify-center gap-2 rounded-full border border-destructive/15 bg-destructive/5 px-3 py-1 text-center text-xs text-destructive hover:bg-destructive/10 transition-colors duration-150"
            >
              <Unlink aria-hidden="true" className="h-4 w-4 shrink-0" />
              Disconnect your Notion
            </button>
          )}
        </div>
      </div>

      <div className="settings-actions flex flex-wrap justify-end gap-3 px-5 py-4 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-9 max-w-full px-[18px] rounded-full text-[13px] font-medium"
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
            className="h-auto min-h-9 max-w-full px-[18px] rounded-full text-[13px] font-medium text-white"
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
            className="h-auto min-h-9 max-w-full px-[18px] rounded-full text-[13px] font-medium text-white"
            style={{
              background: '#007AFF',
              boxShadow: '0 1px 3px rgba(0,122,255,0.3)'
            }}
            onClick={handleSaveMapping}
            disabled={
              isSaving || isLoadingSchema || !isFieldMappingCompatible(fieldMapping, schema)
            }
          >
            {isSaving ? 'Saving...' : 'Save Mapping'}
          </Button>
        )}
      </div>

      {/* Token Copied Toast */}
      {isTokenCopied && (
        <div
          className="absolute bottom-20 inset-x-4 mx-auto w-fit max-w-[calc(100%_-_32px)] z-50 flex items-center gap-2 animate-in fade-in-0 slide-in-from-bottom-2"
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#ffffff',
            border: '1px solid #e5e5e5',
            boxShadow: '0 4px 12px -1px rgba(0,0,0,0.1)'
          }}
        >
          <Check className="h-4 w-4 text-green-600" />
          <span className="min-w-0 wrap-anywhere text-xs text-muted-foreground">Token copied</span>
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
            className="settings-confirm-panel relative z-10 flex flex-col w-[250px] max-w-[calc(100%_-_32px)] max-h-[calc(100%_-_32px)] rounded-xl animate-in fade-in-0 zoom-in-95 duration-150"
            style={{
              background: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pb-1 space-y-2 wrap-anywhere">
              <h3 className="text-[15px] font-semibold text-foreground">Disconnect Notion?</h3>
              <p className="text-[13px] text-muted-foreground">
                Your token and database will be removed. You can reconnect anytime.
              </p>
            </div>
            <div className="settings-confirm-actions flex flex-wrap justify-end gap-3 p-4 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-auto min-h-8 max-w-full px-3 rounded-full text-[13px] font-medium"
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
                className="h-auto min-h-8 max-w-full px-3 rounded-full text-[13px] font-medium text-white"
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
