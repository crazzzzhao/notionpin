'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

// ========== Tab 条（受控） ==========
// 参考 shadcn Tabs：圆角矩形，颜色与动画保持不变

export interface AnimatedTabItem {
  title: string
  value: string
}

interface AnimatedTabsProps {
  tabs: AnimatedTabItem[]
  activeValue: string
  onTabChange: (value: string) => void
  containerClassName?: string
  activeTabClassName?: string
  tabClassName?: string
}

export function AnimatedTabs({
  tabs,
  activeValue,
  onTabChange,
  containerClassName,
  activeTabClassName,
  tabClassName
}: AnimatedTabsProps): React.JSX.Element {
  const activeIndex = tabs.findIndex((tab) => tab.value === activeValue)

  return (
    <div
      className={cn(
        'relative flex flex-row items-center rounded-xl p-1 text-muted-foreground max-w-full w-full',
        containerClassName
      )}
      style={{ 
        background: 'rgba(0, 0, 0, 0.04)',
        border: 'none'
      }}
    >
      {/* 滑动背景 - 使用 transform 而不是 layoutId 避免跳动 */}
      <motion.div
        className={cn('absolute top-1 bottom-1 rounded-lg', activeTabClassName)}
        style={{
          background: 'rgba(255, 255, 255, 0.8)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          width: `calc((100% - 8px) / ${tabs.length})`,
          left: 4
        }}
        animate={{
          x: `calc(${activeIndex} * 100%)`
        }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onTabChange(tab.value)}
          className={cn(
            'relative flex-1 flex items-center justify-center px-3 py-1.5 rounded-md text-[13px] font-medium min-w-0 z-10',
            tabClassName
          )}
          aria-label={tab.title}
          aria-selected={activeValue === tab.value}
        >
          <span
            className={cn(
              'relative whitespace-nowrap transition-colors duration-200',
              activeValue === tab.value ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {tab.title}
          </span>
        </button>
      ))}
    </div>
  )
}
