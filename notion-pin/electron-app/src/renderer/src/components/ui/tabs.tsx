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
  return (
    <div
      className={cn(
        'flex flex-row items-center rounded-lg bg-muted p-1.5 text-muted-foreground [perspective:1000px] max-w-full w-full',
        containerClassName
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onTabChange(tab.value)}
          className={cn(
            'relative flex-1 flex items-center justify-center px-2 py-1.5 rounded-md text-xs font-medium min-w-0',
            tabClassName
          )}
          style={{ transformStyle: 'preserve-3d' }}
          aria-label={tab.title}
          aria-selected={activeValue === tab.value}
        >
          {activeValue === tab.value && (
            <motion.div
              layoutId="aceternity-tab-pill"
              transition={{ type: 'spring', bounce: 0.3, duration: 0.6 }}
              className={cn(
                'absolute inset-0 bg-background rounded-md shadow-sm',
                activeTabClassName
              )}
            />
          )}
          <span
            className={cn(
              'relative whitespace-nowrap',
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
