interface MenuAnchor {
  left: number
  right?: number
  top: number
  bottom: number
}

// Keep the popup inside the native window, opening above the trigger when needed.
export function getMenuPosition(
  anchor: MenuAnchor,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  direction: 'ltr' | 'rtl' = 'ltr'
): { left: number; top: number; maxHeight: number } {
  const inset = 8
  const gap = 4
  const below = Math.max(0, viewport.height - inset - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - gap - inset)
  const openAbove = menu.height > below && above > below
  const maxHeight = openAbove ? above : below
  const height = Math.min(menu.height, maxHeight)
  const leadingEdge =
    direction === 'rtl' && anchor.right !== undefined ? anchor.right - menu.width : anchor.left

  return {
    left: Math.max(inset, Math.min(leadingEdge, viewport.width - menu.width - inset)),
    top: openAbove ? anchor.top - gap - height : anchor.bottom + gap,
    maxHeight
  }
}
