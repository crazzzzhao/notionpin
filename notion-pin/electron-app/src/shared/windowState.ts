export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowTransitionOptions {
  animate?: boolean
}

export function parseCollapseRequest(
  collapsed: unknown,
  options: unknown
): { collapsed: boolean; animate: boolean } {
  if (
    typeof collapsed !== 'boolean' ||
    (options !== undefined &&
      (options === null ||
        typeof options !== 'object' ||
        Array.isArray(options) ||
        Object.keys(options).some((key) => key !== 'animate') ||
        ('animate' in options && typeof options.animate !== 'boolean')))
  ) {
    throw new Error('Invalid window transition')
  }

  return { collapsed, animate: (options as WindowTransitionOptions | undefined)?.animate ?? true }
}
