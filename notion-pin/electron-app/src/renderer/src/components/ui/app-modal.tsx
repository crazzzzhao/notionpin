import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ========== AppModal Shell 样式规格 ==========
// 与 SettingsModal 100% 一致的外壳组件
// - 宽度: 290px (可通过 className 覆盖)
// - 圆角: 16px (rounded-2xl)
// - 背景: rgba(255,255,255,0.95) + blur(30px)
// - 边框: 0.5px solid rgba(255,255,255,0.6)
// - 阴影: 0 8px 32px rgba(0,0,0,0.15)
// - overlay: rgba(255,255,255,0.6) + blur(40px)

interface AppModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  /** 固定在底部的 footer（如按钮区域） */
  footer?: React.ReactNode
  className?: string
  /** 内容区域最大高度，超出时滚动 */
  maxContentHeight?: string
}

export function AppModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className,
  maxContentHeight = '60vh'
}: AppModalProps): React.JSX.Element | null {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay - 强模糊背景遮罩 */}
      <div
        className="absolute inset-0 animate-in fade-in-0 duration-200"
        style={{
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)'
        }}
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* Container - 玻璃面板 */}
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden flex flex-col w-[290px] max-w-[calc(100%-32px)] mx-4 animate-in fade-in-0 zoom-in-95 duration-200',
          className
        )}
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          border: '0.5px solid rgba(255, 255, 255, 0.6)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header - 使用 shadcn muted 背景色 + 底部阴影 */}
        <div
          className="flex items-center justify-between px-5 py-[18px] shrink-0 relative z-10 bg-muted/50 border-b border-border"
          style={{
            boxShadow: '0 1px 4px -1px rgba(0, 0, 0, 0.06)'
          }}
        >
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(255, 255, 255, 0.25)' }}
            aria-label="关闭"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Content - 内容区域，超出时滚动 */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: maxContentHeight }}>
          {children}
        </div>

        {/* Footer - 固定底部区域（可选） */}
        {footer && (
          <div
            className="shrink-0 px-5 py-4 border-t"
            style={{ borderColor: 'rgba(255, 255, 255, 0.5)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
