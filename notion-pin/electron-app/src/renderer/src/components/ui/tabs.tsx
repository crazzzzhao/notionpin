'use client'

import { motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// ========== Tab 条（受控） ==========
// 胶囊页签：外层、选中背景和按钮使用完整圆角，颜色与动画保持不变

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
  const railRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [highlight, setHighlight] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)

  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const measure = (): void => {
      const button = buttonRefs.current[activeIndex]
      if (!button) return
      const railBounds = rail.getBoundingClientRect()
      const buttonBounds = button.getBoundingClientRect()
      const next = {
        x: buttonBounds.left - railBounds.left,
        y: buttonBounds.top - railBounds.top,
        width: buttonBounds.width,
        height: buttonBounds.height
      }
      setHighlight((previous) =>
        previous &&
        (['x', 'y', 'width', 'height'] as const).every((key) => previous[key] === next[key])
          ? previous
          : next
      )
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(rail)
    buttonRefs.current.forEach((button) => {
      if (button) resize.observe(button)
    })
    const direction = new MutationObserver(measure)
    direction.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
      subtree: true
    })
    return () => {
      resize.disconnect()
      direction.disconnect()
    }
  }, [activeIndex, tabs.length])

  return (
    <div
      ref={railRef}
      className={cn(
        'animated-tabs relative grid items-stretch rounded-full p-1 text-muted-foreground max-w-full w-full',
        containerClassName
      )}
      style={{
        background: 'rgba(0, 0, 0, 0.04)',
        border: 'none',
        gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`
      }}
    >
      {/* Measured geometry supports wrapping, two-row filters and RTL without a mirrored offset. */}
      <motion.div
        aria-hidden="true"
        className={cn('absolute top-0 left-0 rounded-full pointer-events-none', activeTabClassName)}
        style={{
          background: 'rgba(255, 255, 255, 0.45)',
          boxShadow: '0 0.5px 1px rgba(0,0,0,0.03)',
          visibility: highlight ? 'visible' : 'hidden'
        }}
        initial={false}
        animate={highlight ?? { x: 4, y: 4, width: 0, height: 0 }}
        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
      />
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(element) => {
            buttonRefs.current[index] = element
          }}
          type="button"
          onClick={() => onTabChange(tab.value)}
          className={cn(
            'relative flex items-center justify-center rounded-full px-2 py-1.5 text-sm font-medium min-w-0 z-10',
            tabClassName
          )}
          aria-label={tab.title}
          aria-selected={activeValue === tab.value}
        >
          <span
            className={cn(
              'relative min-w-0 whitespace-normal wrap-anywhere transition-colors duration-200',
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
