import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { getMenuPosition } from '../../../shared/menuPosition'

export type StatusOptionWithColor = { value: string; label: string; bg: string; text: string }

interface StatusMenuProps {
  id: string
  anchor: React.RefObject<HTMLButtonElement | null>
  options: StatusOptionWithColor[]
  value: string | null
  initialIndex: number
  onClose: (restoreFocus?: boolean) => void
  onChange: (value: string) => void
}

function StatusMenu({
  id,
  anchor,
  options,
  value,
  initialIndex,
  onClose,
  onChange
}: StatusMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<ReturnType<typeof getMenuPosition> | null>(null)

  useLayoutEffect(() => {
    const menu = menuRef.current
    const trigger = anchor.current
    if (!menu || !trigger) return
    setPosition(
      getMenuPosition(
        trigger.getBoundingClientRect(),
        menu.getBoundingClientRect(),
        {
          width: window.innerWidth,
          height: window.innerHeight
        },
        getComputedStyle(trigger).direction === 'rtl' ? 'rtl' : 'ltr'
      )
    )
    const closeOutside = (event: Event): void => {
      if (!menu.contains(event.target as Node) && !trigger.contains(event.target as Node)) {
        onClose()
      }
    }
    const closeOnScroll = (event: Event): void => {
      if (!menu.contains(event.target as Node)) onClose()
    }
    const close = (): void => onClose()
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [anchor, initialIndex, onClose])

  useLayoutEffect(() => {
    if (position) {
      // The menu must be visible before a native button can receive focus.
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button')[initialIndex]?.focus()
    }
  }, [position, initialIndex])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onClose(true)
        return
      case 'Tab':
        // Restore the trigger before the browser moves to the next/previous tab stop.
        onClose(true)
        return
      case 'ArrowDown':
        next = (index + 1) % buttons.length
        break
      case 'ArrowUp':
        next = (index - 1 + buttons.length) % buttons.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = buttons.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    buttons[next]?.focus()
  }

  return createPortal(
    <div
      id={id}
      ref={menuRef}
      role="menu"
      aria-label="Task status"
      onKeyDown={handleKeyDown}
      className="fixed z-50 w-44 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl p-1 text-popover-foreground"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
        backgroundColor: 'hsl(var(--popover))',
        boxShadow:
          '0 0 0 1px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12)'
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={value === option.value}
          tabIndex={-1}
          onClick={() => {
            onClose(true)
            onChange(option.value)
          }}
          className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1 text-start text-xs hover:bg-muted focus-visible:bg-muted focus-visible:outline-offset-[-2px]"
        >
          <span
            className="min-w-0 wrap-anywhere rounded px-1.5 py-0.5"
            style={{ backgroundColor: option.bg, color: option.text }}
          >
            {option.label}
          </span>
          <Check
            aria-hidden="true"
            className={`ms-auto h-3.5 w-3.5 shrink-0 ${value === option.value ? '' : 'invisible'}`}
          />
        </button>
      ))}
    </div>,
    document.body
  )
}

export function TaskStatusSelect({
  value,
  options,
  style,
  onChange
}: {
  value: string | null
  options: StatusOptionWithColor[]
  style: { bg: string; text: string }
  onChange: (value: string) => void
}): React.JSX.Element {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [initialIndex, setInitialIndex] = useState(0)
  const close = useCallback((restoreFocus = false): void => {
    setOpen(false)
    if (restoreFocus) anchor.current?.focus({ preventScroll: true })
  }, [])

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={options.length === 0}
        onClick={() => {
          setInitialIndex(
            Math.max(
              0,
              options.findIndex((option) => option.value === value)
            )
          )
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (options.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault()
            setInitialIndex(event.key === 'ArrowDown' ? 0 : options.length - 1)
            setOpen(true)
          }
        }}
        className="flex h-6 min-w-0 max-w-full items-center gap-1 rounded-full px-2 text-xs font-medium transition-opacity duration-150 hover:opacity-80"
        style={{ backgroundColor: style.bg, color: style.text }}
        title={`Click to change status: ${value || 'No status'}`}
      >
        <span className="truncate">{value || 'No status'}</span>
        <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <StatusMenu
          id={id}
          anchor={anchor}
          options={options}
          value={value}
          initialIndex={initialIndex}
          onClose={close}
          onChange={onChange}
        />
      )}
    </>
  )
}
