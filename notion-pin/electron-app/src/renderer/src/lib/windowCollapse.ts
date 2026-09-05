import type { WindowTransitionOptions } from '../../../shared/windowState'

interface CollapseAPI {
  setCollapsed: (collapsed: boolean, options: WindowTransitionOptions) => Promise<boolean>
  getWindowState: () => Promise<{ isCollapsed: boolean }>
}

/** Latest user intent wins, without overlapping native resize requests. */
export function createWindowCollapse(
  api: CollapseAPI,
  shouldAnimate: () => boolean,
  onError: () => void
): {
  initialize: (collapsed: boolean) => void
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
  toggle: () => Promise<void>
} {
  let desired = false
  let actual = false
  let running: Promise<void> | undefined
  const listeners = new Set<() => void>()
  const notify = (): void => listeners.forEach((listener) => listener())

  const reconcile = async (): Promise<void> => {
    try {
      while (desired !== actual) {
        actual = await api.setCollapsed(desired, { animate: shouldAnimate() })
      }
    } catch {
      try {
        actual = (await api.getWindowState()).isCollapsed
      } catch {
        // Keep the last acknowledged native state if the bridge is unavailable.
      }
      desired = actual
      notify()
      onError()
    } finally {
      running = undefined
    }
  }

  return {
    initialize(collapsed) {
      if (running) return
      desired = actual = collapsed
      notify()
    },
    getSnapshot: () => desired,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    toggle() {
      desired = !desired
      notify()
      running ??= reconcile()
      return running
    }
  }
}
