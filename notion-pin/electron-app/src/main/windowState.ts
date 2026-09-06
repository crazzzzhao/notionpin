import type { BrowserWindow } from 'electron'
import type { WindowBounds } from '../shared/windowState'

export const COLLAPSED_HEIGHT = 52
export const DEFAULT_EXPANDED_HEIGHT = 420
export const WINDOW_SAVE_DELAY_MS = 200
const RESIZE_SETTLE_DELAY_MS = 100
const RESIZE_TIMEOUT_MS = 1000

export interface SavedWindowState {
  isCollapsed: boolean
  windowBounds: WindowBounds
  expandedHeight: number
}

type NativeWindow = Pick<
  BrowserWindow,
  'getBounds' | 'setBounds' | 'isDestroyed' | 'on' | 'removeListener'
>

export function normalizeExpandedHeight(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= COLLAPSED_HEIGHT
    ? Math.round(value)
    : DEFAULT_EXPANDED_HEIGHT
}

/** Owns native geometry; synchronous storage stays out of animation frames. */
export class WindowStateController {
  private collapsed: boolean
  private expandedHeight: number
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private resizeTimer: ReturnType<typeof setTimeout> | undefined
  private resizeSettleTimer: ReturnType<typeof setTimeout> | undefined
  private targetHeight: number | undefined
  private pending: Promise<boolean> | undefined
  private finishResize: (() => void) | undefined
  private lastSaved = ''

  constructor(
    private readonly window: NativeWindow,
    initial: { isCollapsed: boolean; expandedHeight: number },
    private readonly persist: (state: SavedWindowState) => void
  ) {
    this.collapsed = initial.isCollapsed
    this.expandedHeight = normalizeExpandedHeight(initial.expandedHeight)
    window.on('move', this.scheduleSave)
    window.on('resize', this.onResize)
    window.on('resized', this.onResized)
    window.on('close', this.flush)
    window.on('closed', this.dispose)
  }

  getState = (): { isCollapsed: boolean; bounds: WindowBounds } => ({
    isCollapsed: this.collapsed,
    bounds: this.window.getBounds()
  })

  setCollapsed = async (collapsed: boolean, animate: boolean): Promise<boolean> => {
    while (this.pending) await this.pending
    if (this.window.isDestroyed()) throw new Error('Window is closed')
    if (collapsed === this.collapsed) return this.collapsed

    clearTimeout(this.saveTimer)
    const bounds = this.window.getBounds()
    if (!this.collapsed) this.expandedHeight = normalizeExpandedHeight(bounds.height)
    const previousCollapsed = this.collapsed
    this.collapsed = collapsed
    const height = collapsed ? COLLAPSED_HEIGHT : this.expandedHeight

    let resolveResize!: (value: boolean) => void
    const completion = new Promise<boolean>((resolve) => {
      resolveResize = resolve
    })
    this.pending = completion
    this.targetHeight = height
    this.finishResize = () => {
      clearTimeout(this.resizeTimer)
      clearTimeout(this.resizeSettleTimer)
      this.targetHeight = undefined
      this.finishResize = undefined
      this.pending = undefined
      // Let the last native frame and the IPC reply finish before synchronous I/O.
      // A new toggle cancels this trailing save; close still flushes immediately.
      this.scheduleSave()
      resolveResize(this.collapsed)
    }
    // 'resized' normally completes the request. A missing event must not lock IPC.
    this.resizeTimer = setTimeout(() => this.finishResize?.(), RESIZE_TIMEOUT_MS)
    try {
      this.window.setBounds({ ...bounds, height }, animate)
      if (!animate || bounds.height === height) this.finishResize?.()
    } catch (error) {
      this.collapsed = previousCollapsed
      this.finishResize?.()
      throw error
    }
    return completion
  }

  private scheduleSave = (): void => {
    if (this.pending) return
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(this.flush, WINDOW_SAVE_DELAY_MS)
  }

  private hasReachedTargetHeight = (): boolean =>
    this.targetHeight !== undefined &&
    !this.window.isDestroyed() &&
    this.window.getBounds().height === this.targetHeight

  private onResize = (): void => {
    clearTimeout(this.resizeSettleTimer)
    if (!this.pending) {
      this.scheduleSave()
      return
    }
    if (!this.hasReachedTargetHeight()) return
    // Some native resizes reach the target without a 'resized' acknowledgement.
    // Observe a quiet final frame so later clicks do not queue behind the timeout.
    this.resizeSettleTimer = setTimeout(() => {
      if (this.hasReachedTargetHeight()) this.finishResize?.()
    }, RESIZE_SETTLE_DELAY_MS)
  }

  private onResized = (): void => {
    if (this.finishResize) {
      if (this.hasReachedTargetHeight()) this.finishResize()
    } else this.scheduleSave()
  }

  flush = (): void => {
    clearTimeout(this.saveTimer)
    if (this.window.isDestroyed()) return
    const bounds = this.window.getBounds()
    if (!this.collapsed && !this.pending) {
      this.expandedHeight = normalizeExpandedHeight(bounds.height)
    }
    const snapshot: SavedWindowState = {
      isCollapsed: this.collapsed,
      // Closing mid-animation should restore its intended height, not a partial frame.
      windowBounds: this.pending
        ? { ...bounds, height: this.collapsed ? COLLAPSED_HEIGHT : this.expandedHeight }
        : bounds,
      expandedHeight: this.expandedHeight
    }
    const serialized = JSON.stringify(snapshot)
    if (serialized === this.lastSaved) return
    try {
      this.persist(snapshot)
      this.lastSaved = serialized
    } catch {
      // A disk error must not leave the window transition or its button stuck.
      console.warn('Could not save window geometry')
    }
  }

  private dispose = (): void => {
    this.finishResize?.()
    clearTimeout(this.saveTimer)
    clearTimeout(this.resizeTimer)
    clearTimeout(this.resizeSettleTimer)
    this.window.removeListener('move', this.scheduleSave)
    this.window.removeListener('resize', this.onResize)
    this.window.removeListener('resized', this.onResized)
    this.window.removeListener('close', this.flush)
    this.window.removeListener('closed', this.dispose)
  }
}
